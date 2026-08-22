from collections import defaultdict
from datetime import date, timedelta

from django.db import transaction
from django.db.models import Sum, Q, F
from django.utils import timezone
from rest_framework import viewsets, filters
from rest_framework.decorators import action
from rest_framework.response import Response
from rest_framework.parsers import MultiPartParser, FormParser, JSONParser

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


class ProjectViewSet(viewsets.ModelViewSet):
    queryset = Project.objects.all().order_by("-created_at")
    serializer_class = ProjectSerializer

    def get_serializer_class(self):
        if self.action == "retrieve":
            return ProjectDetailSerializer
        return ProjectSerializer

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

        totals = project.expenses.aggregate(
            total_estimated=Sum("amount", filter=Q(entry_type="estimate")),
            total_actual=Sum("amount", filter=Q(entry_type="actual")),
        )

        projected_cost = project.tasks.aggregate(s=Sum("estimated_cost"))["s"] or 0
        real_cost = totals["total_actual"] or 0
        units = project.units.all()
        projected_revenue = sum(
            (u.sale_agreement.agreed_price if hasattr(u, "sale_agreement") else u.list_price)
            for u in units
        )
        real_revenue = PaymentInstallment.objects.filter(
            agreement__unit__project=project, paid_date__isnull=False
        ).aggregate(s=Sum("amount_paid"))["s"] or 0

        totals.update({
            "projected_cost": projected_cost,
            "real_cost": real_cost,
            "projected_revenue": projected_revenue,
            "real_revenue": real_revenue,
            "projected_profit": projected_revenue - projected_cost,
            "real_profit": real_revenue - real_cost,
        })

        return Response({
            "granularity": granularity,
            "series": series,
            "tasks": task_summary,
            "totals": totals,
        })

    @action(detail=True, methods=["get"])
    def feed(self, request, pk=None):
        project = self.get_object()
        today = date.today()
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
    "name", "estimated_start", "estimated_end", "estimated_cost",
    "status", "progress_pct", "actual_start", "actual_end", "actual_cost", "notes",
]


class TaskViewSet(viewsets.ModelViewSet):
    queryset = Task.objects.all()
    serializer_class = TaskSerializer
    filter_backends = [filters.SearchFilter]
    search_fields = ["name"]

    def get_queryset(self):
        qs = super().get_queryset()
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
        TaskAuditLog.objects.create(
            project=instance.project, task=None, task_name_snapshot=instance.name,
            action="deleted", changed_by=self._audit_user(),
            changes={
                "estimated_start": [str(instance.estimated_start), ""],
                "estimated_end": [str(instance.estimated_end), ""],
                "estimated_cost": [str(instance.estimated_cost), ""],
            },
        )
        instance.delete()

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
                today = date.today()
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
        if project_id:
            qs = qs.filter(project_id=project_id)
        return qs


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
