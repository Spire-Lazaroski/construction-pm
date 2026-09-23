from collections import defaultdict
from datetime import date, timedelta

import json

from django.db import transaction
from django.db.models import Sum, Q, F, Exists, OuterRef
from django.utils import timezone
from rest_framework import viewsets, filters, status as http
from rest_framework.decorators import action
from rest_framework.response import Response
from rest_framework.parsers import MultiPartParser, FormParser, JSONParser

from . import importer
from .scheduling import compute_schedule, ScheduleCycleError, project_calendars
from .models import TaskDependency, CalendarException, ProjectCalendar, Baseline, BaselineTask
from .serializers import TaskDependencySerializer, CalendarExceptionSerializer, BaselineSerializer
from .templates_data import RESIDENTIAL_BUILDING

from .models import (
    Project, PhaseCategory, Task, Vendor, Expense,
    Unit, Customer, SaleAgreement, PaymentInstallment, Issue, Document, Activity, TaskAuditLog,
)
from .serializers import (
    ProjectSerializer, ProjectDetailSerializer, PhaseCategorySerializer, TaskSerializer,
    VendorSerializer, ExpenseSerializer, UnitSerializer, CustomerSerializer,
    SaleAgreementSerializer, PaymentInstallmentSerializer, IssueSerializer, DocumentSerializer,
    ActivitySerializer, TaskAuditLogSerializer,
)


def _leaf_tasks(project):
    """Tasks with no live children."""
    child = Task.objects.filter(parent_id=OuterRef("pk"))
    return project.tasks.annotate(has_children=Exists(child)).filter(has_children=False)


# Cost rule (matches the team's Excel): every task's `estimated_cost` is its OWN amount,
# not including sub-positions. А01 = 12.000 and its sub-position А01.1 = 3.000 means
# 15.000 in total. Groups (А/Б/Ц) carry 0 of their own; the UI shows each parent's
# roll-up (own + all descendants) as a computed figure, so nothing is typed twice.


def today():
    return timezone.localdate()


def _compute_financial_totals(project):
    """Shared by the per-project analytics endpoint and the cross-project overview,
    so the two numbers can never quietly drift apart from duplicated logic."""
    expense_totals = project.expenses.aggregate(
        total_estimated=Sum("amount", filter=Q(entry_type="estimate")),
        total_actual=Sum("amount", filter=Q(entry_type="actual")),
    )
    projected_cost = project.tasks.aggregate(s=Sum("estimated_cost"))["s"] or 0
    real_cost = expense_totals["total_actual"] or 0
    units = project.units.all()
    projected_revenue = sum(
        (u.sale_agreement.agreed_price if hasattr(u, "sale_agreement") else u.list_price)
        for u in units
    )
    real_revenue = PaymentInstallment.objects.filter(
        agreement__unit__project=project, paid_date__isnull=False
    ).aggregate(s=Sum("amount_paid"))["s"] or 0

    return {
        "total_estimated": expense_totals["total_estimated"] or 0,
        "total_actual": real_cost,
        "projected_cost": projected_cost,
        "real_cost": real_cost,
        "projected_revenue": projected_revenue,
        "real_revenue": real_revenue,
        "projected_profit": projected_revenue - projected_cost,
        "real_profit": real_revenue - real_cost,
    }


class ProjectViewSet(viewsets.ModelViewSet):
    queryset = Project.objects.all().order_by("-created_at")
    serializer_class = ProjectSerializer

    def get_serializer_class(self):
        if self.action == "retrieve":
            return ProjectDetailSerializer
        return ProjectSerializer

    @transaction.atomic
    def perform_create(self, serializer):
        """`structure`: "empty" (default), "template" (residential building А/Б/Ц),
        or "copy" with `copy_from` = another project's id (structure + vendors, no actuals)."""
        project = serializer.save()
        structure = self.request.data.get("structure", "empty")
        user = self.request.user if self.request.user.is_authenticated else None
        order = 0
        if structure == "template":
            for gcode, gname, items in RESIDENTIAL_BUILDING:
                order += 1
                g = Task.objects.create(project=project, wbs_code=gcode, name=gname, order=order)
                for code, name in items:
                    order += 1
                    Task.objects.create(project=project, parent=g, wbs_code=code, name=name, order=order)
        elif structure == "copy" and self.request.data.get("copy_from"):
            src = Project.objects.filter(pk=self.request.data["copy_from"]).first()
            if src:
                mapping = {}
                for t in src.tasks.order_by("order"):
                    mapping[t.pk] = Task.objects.create(
                        project=project, wbs_code=t.wbs_code, name=t.name, order=t.order,
                        estimated_start=t.estimated_start, estimated_end=t.estimated_end,
                        estimated_cost=t.estimated_cost, is_milestone=t.is_milestone, vendor=t.vendor,
                        category=t.category,
                    )
                for t in src.tasks.all():
                    new = mapping[t.pk]
                    if t.parent_id in mapping:
                        new.parent = mapping[t.parent_id]
                        new.save(update_fields=["parent"])
                    for link in t.predecessor_links.all():
                        if link.predecessor_id in mapping:
                            TaskDependency.objects.get_or_create(
                                predecessor=mapping[link.predecessor_id], successor=new,
                                defaults={"type": link.type, "lag_days": link.lag_days})
                src_cal = ProjectCalendar.objects.filter(project=src).first()
                if src_cal:
                    ProjectCalendar.objects.create(project=project, working_weekdays=src_cal.working_weekdays)
        if structure in ("template", "copy"):
            TaskAuditLog.objects.create(project=project, task=None, task_name_snapshot=project.name,
                                        action="created", changed_by=user, changes={"structure": ["", structure]})

    # ------------------------------------------------------------------ scheduling (Phase A)
    def _schedule(self, project, request):
        bl = None
        bl_id = request.query_params.get("baseline") or request.data.get("baseline") if hasattr(request, "data") else None
        if bl_id:
            bl = Baseline.objects.filter(pk=bl_id, project=project).first()
        elif project.baselines.exists():
            bl = project.baselines.first()
        sd = request.query_params.get("status_date")
        status_date = date.fromisoformat(sd) if sd else None
        return compute_schedule(project, status_date=status_date, baseline=bl), bl

    @action(detail=True, methods=["get"])
    def schedule(self, request, pk=None):
        """Critical path: early/late dates, float, driving links, forecast finish."""
        project = self.get_object()
        try:
            result, bl = self._schedule(project, request)
        except ScheduleCycleError as e:
            return Response({"detail": str(e), "loop": e.names}, status=409)
        result["baseline"] = BaselineSerializer(bl).data if bl else None
        return Response(result)

    @action(detail=True, methods=["post"])
    def reschedule(self, request, pk=None):
        """Move planned dates of NOT-started positions to the calculated early dates.
        {"apply": false} -> preview only; {"apply": true} -> write + audit log."""
        project = self.get_object()
        try:
            result, _ = self._schedule(project, request)
        except ScheduleCycleError as e:
            return Response({"detail": str(e), "loop": e.names}, status=409)
        changes = []
        for t in project.tasks.filter(actual_start__isnull=True, progress_pct=0).exclude(status="completed"):
            r = result["tasks"].get(str(t.pk))
            if not r or r.get("summary") or r.get("unscheduled") or t.subtasks.exists():
                continue
            if r["es"] != t.estimated_start or r["ef"] != t.estimated_end:
                changes.append({"task": str(t.pk), "code": t.wbs_code, "name": t.name,
                                "old_start": t.estimated_start, "old_end": t.estimated_end,
                                "new_start": r["es"], "new_end": r["ef"]})
        if request.data.get("apply"):
            user = request.user if request.user.is_authenticated else None
            with transaction.atomic():
                for c in changes:
                    t = Task.objects.get(pk=c["task"])
                    TaskAuditLog.objects.create(
                        project=project, task=t, task_name_snapshot=t.name, action="updated", changed_by=user,
                        changes={"estimated_start": [str(t.estimated_start), str(c["new_start"])],
                                 "estimated_end": [str(t.estimated_end), str(c["new_end"])],
                                 "source": ["", "reschedule"]})
                    t.estimated_start, t.estimated_end = c["new_start"], c["new_end"]
                    t.save(update_fields=["estimated_start", "estimated_end"])
        return Response({"applied": bool(request.data.get("apply")), "changes": changes})

    @action(detail=True, methods=["get", "post"])
    def baselines(self, request, pk=None):
        """GET: list saved baselines. POST {name}: snapshot the current plan."""
        project = self.get_object()
        if request.method == "POST":
            name = request.data.get("name") or f"Основна линија {timezone.localdate():%d.%m.%Y}"
            with transaction.atomic():
                bl = Baseline.objects.create(project=project, name=name,
                                             created_by=request.user if request.user.is_authenticated else None)
                BaselineTask.objects.bulk_create([
                    BaselineTask(baseline=bl, task=t, start=t.estimated_start, end=t.estimated_end, cost=t.estimated_cost)
                    for t in project.tasks.all()
                ])
            return Response(BaselineSerializer(bl).data, status=201)
        return Response(BaselineSerializer(project.baselines.all(), many=True).data)

    @action(detail=True, methods=["get", "put"])
    def calendar(self, request, pk=None):
        """Working week + exceptions. PUT {working_weekdays: [0..6]}."""
        project = self.get_object()
        cal, _ = ProjectCalendar.objects.get_or_create(project=project)
        if request.method == "PUT":
            days = sorted({int(d) for d in request.data.get("working_weekdays", []) if 0 <= int(d) <= 6})
            if not days:
                return Response({"working_weekdays": ["Choose at least one working day."]}, status=400)
            cal.working_weekdays = days
            cal.save()
        excs = CalendarException.objects.filter(Q(project=project) | Q(project__isnull=True)).order_by("date")
        return Response({"working_weekdays": cal.working_weekdays,
                         "exceptions": CalendarExceptionSerializer(excs, many=True).data})

    @action(detail=False, methods=["post"], parser_classes=[MultiPartParser, FormParser])
    def import_preview(self, request):
        """Upload the workbook (+ optional invoice PDFs); returns what would be created
        and every problem found. Writes nothing."""
        xlsx = request.FILES.get("file")
        if not xlsx:
            return Response({"file": ["Choose an .xlsx file."]}, status=400)
        try:
            preview = importer.build_preview(xlsx, request.FILES.getlist("pdfs"))
        except Exception as e:  # malformed workbook → readable message, not a 500
            return Response({"file": [f"Could not read this workbook: {e}"]}, status=400)
        return Response(preview)

    @action(detail=False, methods=["post"], parser_classes=[MultiPartParser, FormParser])
    def import_commit(self, request):
        """Same upload again + `decisions` (JSON) + optional `project` (id to update)
        or `project_fields` (JSON: name, latitude, longitude...)."""
        xlsx = request.FILES.get("file")
        if not xlsx:
            return Response({"file": ["Choose an .xlsx file."]}, status=400)
        pdfs = request.FILES.getlist("pdfs")
        try:
            preview = importer.build_preview(xlsx, pdfs)
        except Exception as e:
            return Response({"file": [f"Could not read this workbook: {e}"]}, status=400)
        decisions = json.loads(request.data.get("decisions") or "{}")
        fields = json.loads(request.data.get("project_fields") or "{}")
        target = None
        if request.data.get("project"):
            target = Project.objects.filter(pk=request.data["project"]).first()
            if target is None:
                return Response({"project": ["Project not found."]}, status=404)
        user = request.user if request.user.is_authenticated else None
        project = importer.commit(preview, decisions, user, pdf_files=pdfs, target_project=target, project_fields=fields)
        return Response(ProjectSerializer(project).data, status=http.HTTP_201_CREATED)

    @action(detail=False, methods=["get"])
    def overview(self, request):
        """One call returning every project with a computed completion %, current
        phase, financial snapshot, and drawing thumbnails — powers the portfolio
        dashboard without the frontend making a dozen requests per project."""
        results = []
        for project in self.get_queryset():
            tasks = list(project.tasks.all())

            # Cost-weighted completion: a finished big-budget phase should move the
            # needle more than a finished tiny one.
            total_cost = sum(float(t.estimated_cost) for t in tasks)
            if total_cost > 0:
                weighted = sum(float(t.estimated_cost) * (t.progress_pct or 0) for t in tasks)
                completion_pct = round(weighted / total_cost)
            elif tasks:
                completion_pct = round(sum(t.progress_pct or 0 for t in tasks) / len(tasks))
            else:
                completion_pct = 0

            # Time-elapsed: a secondary comparison point, not the headline number.
            time_elapsed_pct = None
            if project.start_date and project.estimated_end_date:
                total_days = (project.estimated_end_date - project.start_date).days
                if total_days > 0:
                    elapsed = (today() - project.start_date).days
                    time_elapsed_pct = max(0, min(100, round(elapsed / total_days * 100)))

            current_phase = None
            in_progress = sorted(
                [t for t in tasks if t.status == "in_progress"], key=lambda t: t.estimated_start or date.max
            )
            if in_progress:
                current_phase = {"name": in_progress[0].name, "progress_pct": in_progress[0].progress_pct}
            else:
                not_started = sorted([t for t in tasks if t.status == "not_started"], key=lambda t: t.order)
                if not_started:
                    current_phase = {"name": not_started[0].name, "progress_pct": 0}

            drawings = project.documents.filter(doc_type="drawing")[:4]

            results.append({
                "id": str(project.id),
                "name": project.name,
                "status": project.status,
                "site_address": project.site_address,
                "latitude": project.latitude,
                "longitude": project.longitude,
                "completion_pct": completion_pct,
                "time_elapsed_pct": time_elapsed_pct,
                "current_phase": current_phase,
                "task_count": len(tasks),
                "total_budget": project.total_budget,
                "start_date": project.start_date,
                "estimated_end_date": project.estimated_end_date,
                "financials": _compute_financial_totals(project),
                "drawings": DocumentSerializer(drawings, many=True).data,
            })
        return Response(results)

    @action(detail=True, methods=["get"])
    def analytics(self, request, pk=None):
        project = self.get_object()
        granularity = request.query_params.get("granularity", "month")

        def bucket_key(d: date):
            if granularity == "day":
                return d.isoformat()
            if granularity == "week":
                iso = d.isocalendar()
                return f"{iso[0]}-W{iso[1]:02d}"
            if granularity == "quarter":
                return f"{d.year}-Q{((d.month - 1) // 3) + 1}"
            if granularity == "year":
                return str(d.year)
            return f"{d.year}-{d.month:02d}"

        cost_buckets = defaultdict(lambda: {"estimate": 0, "actual": 0})
        for exp in project.expenses.all():
            key = bucket_key(exp.date)
            entry_key = exp.entry_type if exp.entry_type in ("estimate", "actual") else "actual"
            cost_buckets[key][entry_key] += float(exp.amount)

        revenue_buckets = defaultdict(lambda: {"estimated": 0, "actual": 0})
        for agreement in SaleAgreement.objects.filter(unit__project=project):
            for inst in agreement.installments.all():
                key = bucket_key(inst.due_date)
                revenue_buckets[key]["estimated"] += float(inst.amount_due)
                if inst.paid_date:
                    key_paid = bucket_key(inst.paid_date)
                    revenue_buckets[key_paid]["actual"] += float(inst.amount_paid)

        all_keys = sorted(set(cost_buckets) | set(revenue_buckets))
        cum_cost_est = cum_cost_act = cum_rev_est = cum_rev_act = 0
        series = []
        for key in all_keys:
            cum_cost_est += cost_buckets[key]["estimate"]
            cum_cost_act += cost_buckets[key]["actual"]
            cum_rev_est += revenue_buckets[key]["estimated"]
            cum_rev_act += revenue_buckets[key]["actual"]
            series.append({
                "period": key,
                "cost_estimated": cost_buckets[key]["estimate"],
                "cost_actual": cost_buckets[key]["actual"],
                "revenue_estimated": revenue_buckets[key]["estimated"],
                "revenue_actual": revenue_buckets[key]["actual"],
                "cumulative_cost_estimated": cum_cost_est,
                "cumulative_cost_actual": cum_cost_act,
                "cumulative_revenue_estimated": cum_rev_est,
                "cumulative_revenue_actual": cum_rev_act,
                "net_actual": cum_rev_act - cum_cost_act,
                "net_estimated": cum_rev_est - cum_cost_est,
            })

        task_summary = TaskSerializer(project.tasks.all(), many=True).data
        totals = _compute_financial_totals(project)

        return Response({
            "granularity": granularity,
            "series": series,
            "tasks": task_summary,
            "totals": totals,
        })

    @action(detail=True, methods=["get"])
    def feed(self, request, pk=None):
        project = self.get_object()
        today = timezone.localdate()
        horizon = today + timedelta(days=14)

        overdue_installments = PaymentInstallment.objects.filter(
            agreement__unit__project=project, paid_date__isnull=True, due_date__lt=today
        ).select_related("agreement__customer", "agreement__unit")
        upcoming_installments = PaymentInstallment.objects.filter(
            agreement__unit__project=project, paid_date__isnull=True,
            due_date__gte=today, due_date__lte=horizon
        ).select_related("agreement__customer", "agreement__unit")

        overdue_payables = project.expenses.filter(
            entry_type="actual", due_date__lt=today
        ).exclude(amount_paid__gte=F("amount"))
        upcoming_payables = project.expenses.filter(
            entry_type="actual", due_date__gte=today, due_date__lte=horizon
        ).exclude(amount_paid__gte=F("amount"))

        tasks_soon = project.tasks.filter(
            Q(estimated_start__gte=today, estimated_start__lte=horizon) |
            Q(estimated_end__gte=today, estimated_end__lte=horizon)
        ).exclude(status="completed")

        open_issues = project.issues.exclude(status="resolved")

        pending_verification = project.tasks.filter(status="completed", verified=False)

        activities = project.activities.filter(done=False).order_by("due_date")

        def inst_data(inst):
            return {
                "id": str(inst.id), "due_date": inst.due_date, "amount_due": inst.amount_due,
                "customer_name": inst.agreement.customer.name, "unit": inst.agreement.unit.identifier,
            }

        def payable_data(exp):
            return {
                "id": str(exp.id), "due_date": exp.due_date, "amount": exp.amount,
                "amount_paid": exp.amount_paid, "vendor_name": exp.vendor.name if exp.vendor else None,
                "description": exp.description,
            }

        return Response({
            "overdue_installments": [inst_data(i) for i in overdue_installments],
            "upcoming_installments": [inst_data(i) for i in upcoming_installments],
            "overdue_payables": [payable_data(e) for e in overdue_payables],
            "upcoming_payables": [payable_data(e) for e in upcoming_payables],
            "tasks_soon": TaskSerializer(tasks_soon, many=True).data,
            "open_issues": IssueSerializer(open_issues, many=True).data,
            "pending_verification": TaskSerializer(pending_verification, many=True).data,
            "activities": ActivitySerializer(activities, many=True).data,
        })


class PhaseCategoryViewSet(viewsets.ModelViewSet):
    queryset = PhaseCategory.objects.all()
    serializer_class = PhaseCategorySerializer


TASK_AUDITED_FIELDS = [
    "name", "wbs_code", "parent_id", "vendor_id", "estimated_start", "estimated_end", "estimated_cost",
    "status", "progress_pct", "actual_start", "actual_end", "actual_cost", "notes",
]


class TaskViewSet(viewsets.ModelViewSet):
    queryset = Task.objects.all()
    serializer_class = TaskSerializer
    filter_backends = [filters.SearchFilter]
    search_fields = ["name"]

    def get_queryset(self):
        qs = super().get_queryset().select_related("vendor", "verified_by").prefetch_related("predecessor_links__predecessor")
        project_id = self.request.query_params.get("project")
        if project_id:
            qs = qs.filter(project_id=project_id)
        return qs

    def perform_create(self, serializer):
        task = serializer.save()
        TaskAuditLog.objects.create(
            project=task.project, task=task, task_name_snapshot=task.name,
            action="created", changed_by=self._audit_user(),
        )

    def perform_update(self, serializer):
        before = Task.objects.get(pk=serializer.instance.pk)
        old_values = {f: getattr(before, f) for f in TASK_AUDITED_FIELDS}
        task = serializer.save()
        changes = {}
        for f in TASK_AUDITED_FIELDS:
            new_val = getattr(task, f)
            if str(old_values[f]) != str(new_val):
                changes[f] = [str(old_values[f]), str(new_val)]
        if changes:
            TaskAuditLog.objects.create(
                project=task.project, task=task, task_name_snapshot=task.name,
                action="updated", changed_by=self._audit_user(), changes=changes,
            )

    def perform_destroy(self, instance):
        """Soft delete: the position and all its sub-positions disappear everywhere,
        but can be brought back with POST /tasks/{id}/restore/ (the Undo button)."""
        stamp = timezone.now()
        family = [instance] + instance.descendants()
        for t in family:
            t.deleted_at = stamp
            t.save(update_fields=["deleted_at"])
        TaskAuditLog.objects.create(
            project=instance.project, task=instance, task_name_snapshot=instance.name,
            action="deleted", changed_by=self._audit_user(),
            changes={
                "estimated_start": [str(instance.estimated_start), ""],
                "estimated_end": [str(instance.estimated_end), ""],
                "estimated_cost": [str(instance.estimated_cost), ""],
                "sub_positions": [str(len(family) - 1), ""],
            },
        )

    @action(detail=True, methods=["post"])
    def restore(self, request, pk=None):
        task = Task.all_objects.filter(pk=pk).first()
        if task is None or task.deleted_at is None:
            return Response({"detail": "Nothing to restore."}, status=400)
        stamp = task.deleted_at
        family = [task] + [t for t in task.descendants(include_deleted=True) if t.deleted_at == stamp]
        for t in family:
            t.deleted_at = None
            t.save(update_fields=["deleted_at"])
        TaskAuditLog.objects.create(project=task.project, task=task, task_name_snapshot=task.name,
                                    action="updated", changed_by=self._audit_user(), changes={"restored": ["", "yes"]})
        return Response(TaskSerializer(task).data)

    @action(detail=True, methods=["post"])
    def duplicate(self, request, pk=None):
        src = self.get_object()
        copy = Task.objects.create(
            project=src.project, parent=src.parent, name=f"{src.name} (копија)", wbs_code="",
            order=src.order, estimated_start=src.estimated_start, estimated_end=src.estimated_end,
            estimated_cost=src.estimated_cost, is_milestone=src.is_milestone, vendor=src.vendor,
            category=src.category, notes=src.notes,
        )
        TaskAuditLog.objects.create(project=copy.project, task=copy, task_name_snapshot=copy.name,
                                    action="created", changed_by=self._audit_user(), changes={"duplicated_from": ["", src.name]})
        return Response(TaskSerializer(copy).data, status=201)

    def _audit_user(self):
        return self.request.user if self.request.user.is_authenticated else None

    @action(detail=True, methods=["get"])
    def audit(self, request, pk=None):
        task = self.get_object()
        logs = task.audit_logs.all()
        return Response(TaskAuditLogSerializer(logs, many=True).data)

    @action(detail=True, methods=["post"])
    def verify(self, request, pk=None):
        task = self.get_object()
        if task.status != "completed":
            return Response({"detail": "Only completed tasks can be verified."}, status=400)
        task.verified = True
        task.verified_by = request.user
        task.verified_at = timezone.now()
        notes = request.data.get("notes", "")
        if notes:
            task.verification_notes = notes
        task.save(update_fields=["verified", "verified_by", "verified_at", "verification_notes"])
        return Response(TaskSerializer(task).data)

    @action(detail=True, methods=["post"])
    def reject(self, request, pk=None):
        task = self.get_object()
        reason = request.data.get("reason", "")
        task.verified = False
        task.verified_by = None
        task.verified_at = None
        task.status = "in_progress"
        task.verification_notes = reason
        task.save(update_fields=["verified", "verified_by", "verified_at", "status", "verification_notes"])
        return Response(TaskSerializer(task).data)


class VendorViewSet(viewsets.ModelViewSet):
    queryset = Vendor.objects.all()
    serializer_class = VendorSerializer


class ExpenseViewSet(viewsets.ModelViewSet):
    queryset = Expense.objects.all().order_by("-date")
    serializer_class = ExpenseSerializer

    def get_queryset(self):
        qs = super().get_queryset()
        project_id = self.request.query_params.get("project")
        task_id = self.request.query_params.get("task")
        if project_id:
            qs = qs.filter(project_id=project_id)
        if task_id:
            qs = qs.filter(task_id=task_id)
        return qs


class UnitViewSet(viewsets.ModelViewSet):
    queryset = Unit.objects.all()
    serializer_class = UnitSerializer

    def get_queryset(self):
        qs = super().get_queryset()
        project_id = self.request.query_params.get("project")
        if project_id:
            qs = qs.filter(project_id=project_id)
        return qs

    @action(detail=True, methods=["post"])
    def mark_sold(self, request, pk=None):
        unit = self.get_object()
        with transaction.atomic():
            unit.status = "sold"
            unit.save(update_fields=["status"])
            agreement = getattr(unit, "sale_agreement", None)
            if agreement and agreement.status != "completed":
                agreement.status = "completed"
                agreement.save(update_fields=["status"])
                today = timezone.localdate()
                for inst in agreement.installments.filter(paid_date__isnull=True):
                    inst.paid_date = today
                    inst.amount_paid = inst.amount_due
                    inst.save(update_fields=["paid_date", "amount_paid"])
        return Response(UnitSerializer(unit).data)


class CustomerViewSet(viewsets.ModelViewSet):
    queryset = Customer.objects.all()
    serializer_class = CustomerSerializer


class SaleAgreementViewSet(viewsets.ModelViewSet):
    queryset = SaleAgreement.objects.select_related("unit", "customer").prefetch_related("installments")
    serializer_class = SaleAgreementSerializer

    def get_queryset(self):
        qs = super().get_queryset()
        unit_id = self.request.query_params.get("unit")
        project_id = self.request.query_params.get("project")
        if unit_id:
            qs = qs.filter(unit_id=unit_id)
        if project_id:
            qs = qs.filter(unit__project_id=project_id)
        return qs


class PaymentInstallmentViewSet(viewsets.ModelViewSet):
    queryset = PaymentInstallment.objects.all()
    serializer_class = PaymentInstallmentSerializer

    def perform_update(self, serializer):
        with transaction.atomic():
            instance = serializer.save()
            agreement = instance.agreement
            all_installments = agreement.installments.all()
            fully_paid = all_installments.exists() and all(
                i.paid_date and i.amount_paid >= i.amount_due for i in all_installments
            )
            if fully_paid and agreement.status != "completed":
                agreement.status = "completed"
                agreement.save(update_fields=["status"])
                agreement.unit.status = "sold"
                agreement.unit.save(update_fields=["status"])


class DocumentViewSet(viewsets.ModelViewSet):
    queryset = Document.objects.all().order_by("-created_at")
    serializer_class = DocumentSerializer
    parser_classes = [MultiPartParser, FormParser, JSONParser]

    def create(self, request, *args, **kwargs):
        import logging
        logger = logging.getLogger("django")
        has_file = "file" in request.FILES
        logger.info(f"Document upload attempt — POST keys: {list(request.data.keys())}, FILES keys: {list(request.FILES.keys())}")
        if not has_file:
            logger.warning("Document upload rejected — no file present in request.FILES.")
            return Response(
                {"file": ["No file was received. Choose a file before uploading."]},
                status=400,
            )
        response = super().create(request, *args, **kwargs)
        doc_id = response.data.get("id")
        if doc_id:
            saved = Document.objects.get(id=doc_id)
            logger.info(f"Document {doc_id} created — saved file.name on model: {saved.file.name!r}")
            if not saved.file.name:
                logger.error(
                    f"Document {doc_id}: file WAS present in request.FILES but the "
                    f"saved model's file.name ended up empty — investigate storage save step."
                )
        return response

    def get_queryset(self):
        qs = super().get_queryset()
        project_id = self.request.query_params.get("project")
        task_id = self.request.query_params.get("task")
        sale_agreement_id = self.request.query_params.get("sale_agreement")
        if project_id:
            qs = qs.filter(project_id=project_id)
        if task_id:
            qs = qs.filter(task_id=task_id)
        if sale_agreement_id:
            qs = qs.filter(sale_agreement_id=sale_agreement_id)
        return qs


class ActivityViewSet(viewsets.ModelViewSet):
    queryset = Activity.objects.all()
    serializer_class = ActivitySerializer

    def get_queryset(self):
        qs = super().get_queryset()
        project_id = self.request.query_params.get("project")
        task_id = self.request.query_params.get("task")
        if project_id:
            qs = qs.filter(project_id=project_id)
        if task_id:
            qs = qs.filter(related_task_id=task_id)
        return qs

    def perform_create(self, serializer):
        activity = serializer.save()
        self._sync_task_progress(activity.related_task)

    def perform_update(self, serializer):
        activity = serializer.save()
        self._sync_task_progress(activity.related_task)

    def perform_destroy(self, instance):
        task = instance.related_task
        instance.delete()
        self._sync_task_progress(task)

    def _sync_task_progress(self, task):
        """A linked to-do checklist drives progress % automatically — completion/
        verification of the task itself stays a separate, deliberate human action."""
        if not task:
            return
        activities = task.activities.all()
        if not activities.exists():
            return
        done_count = activities.filter(done=True).count()
        total = activities.count()
        pct = round((done_count / total) * 100)
        if task.progress_pct != pct:
            old_pct = task.progress_pct
            task.progress_pct = pct
            task.save(update_fields=["progress_pct"])
            TaskAuditLog.objects.create(
                project=task.project, task=task, task_name_snapshot=task.name,
                action="updated",
                changed_by=self.request.user if self.request.user.is_authenticated else None,
                changes={"progress_pct": [str(old_pct), str(pct)]},
            )


class IssueViewSet(viewsets.ModelViewSet):
    queryset = Issue.objects.all()
    serializer_class = IssueSerializer

    def get_queryset(self):
        qs = super().get_queryset()
        project_id = self.request.query_params.get("project")
        task_id = self.request.query_params.get("task")
        if project_id:
            qs = qs.filter(project_id=project_id)
        if task_id:
            qs = qs.filter(related_task_id=task_id)
        return qs

    @action(detail=True, methods=["post"])
    def start(self, request, pk=None):
        """Someone's now actively working the issue — the middle state between
        'noticed it' and 'fixed it'."""
        issue = self.get_object()
        issue.status = "in_progress"
        issue.save(update_fields=["status"])
        return Response(IssueSerializer(issue).data)

    @action(detail=True, methods=["post"])
    def resolve(self, request, pk=None):
        """Close it out with what it actually cost/took, not just the original estimate —
        so estimate-vs-reality is visible here too, same as everywhere else in the app."""
        issue = self.get_object()
        issue.status = "resolved"
        issue.resolved_date = timezone.localdate()
        actual_cost = request.data.get("actual_cost_impact")
        if actual_cost is not None:
            issue.actual_cost_impact = actual_cost
        notes = request.data.get("resolution_notes", "")
        if notes:
            issue.resolution_notes = notes
        issue.save(update_fields=["status", "resolved_date", "actual_cost_impact", "resolution_notes"])
        return Response(IssueSerializer(issue).data)

    @action(detail=True, methods=["post"])
    def spawn_remediation_task(self, request, pk=None):
        """Turn the issue into a real task on the Gantt — the actual fix work, tracked
        with its own dates/cost/dependencies like any other task, not just a note."""
        issue = self.get_object()
        if issue.remediation_task:
            return Response({"detail": "This issue already has a remediation task."}, status=400)
        start = request.data.get("estimated_start") or timezone.localdate().isoformat()
        end = request.data.get("estimated_end") or (
            date.fromisoformat(start) + timedelta(days=max(issue.estimated_delay_days, 1))).isoformat()
        with transaction.atomic():
            remediation = Task.objects.create(
                project=issue.project,
                name=request.data.get("name") or f"Fix: {issue.title}",
                estimated_start=start,
                estimated_end=end,
                estimated_cost=request.data.get("estimated_cost") or issue.estimated_cost_impact,
                order=issue.project.tasks.count(),
            )
            if issue.related_task:
                TaskDependency.objects.get_or_create(predecessor=issue.related_task, successor=remediation)
            issue.remediation_task = remediation
            if issue.status == "open":
                issue.status = "in_progress"
            issue.save(update_fields=["remediation_task", "status"])
        return Response({
            "issue": IssueSerializer(issue).data,
            "task": TaskSerializer(remediation).data,
        })


class TaskDependencyViewSet(viewsets.ModelViewSet):
    queryset = TaskDependency.objects.all()
    serializer_class = TaskDependencySerializer

    def get_queryset(self):
        qs = super().get_queryset()
        project_id = self.request.query_params.get("project")
        if project_id:
            qs = qs.filter(successor__project_id=project_id)
        return qs


class CalendarExceptionViewSet(viewsets.ModelViewSet):
    """Project-specific non-working / extra working days. National holidays (project = null)
    are read-only here; they are managed in the Django admin."""
    queryset = CalendarException.objects.all()
    serializer_class = CalendarExceptionSerializer

    def get_queryset(self):
        qs = super().get_queryset()
        project_id = self.request.query_params.get("project")
        if project_id:
            qs = qs.filter(Q(project_id=project_id) | Q(project__isnull=True))
        return qs

    def perform_destroy(self, instance):
        from rest_framework.exceptions import PermissionDenied
        if instance.project_id is None:
            raise PermissionDenied("National holidays are managed by an administrator.")
        instance.delete()


class BaselineViewSet(viewsets.ModelViewSet):
    queryset = Baseline.objects.all()
    serializer_class = BaselineSerializer
    http_method_names = ["get", "patch", "delete"]
