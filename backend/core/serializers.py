from django.db import transaction
from rest_framework import serializers
from .models import (
    TaskDependency, CalendarException, ProjectCalendar, Baseline,
    Project, PhaseCategory, Task, Vendor, Expense,
    Unit, Customer, SaleAgreement, PaymentInstallment, Issue, Document, Activity, TaskAuditLog,
)


class TaskAuditLogSerializer(serializers.ModelSerializer):
    changed_by_username = serializers.CharField(source="changed_by.username", read_only=True, default=None)

    class Meta:
        model = TaskAuditLog
        fields = "__all__"


class ActivitySerializer(serializers.ModelSerializer):
    related_task_name = serializers.CharField(source="related_task.name", read_only=True, default=None)
    related_vendor_name = serializers.CharField(source="related_vendor.name", read_only=True, default=None)
    related_customer_name = serializers.CharField(source="related_customer.name", read_only=True, default=None)

    class Meta:
        model = Activity
        fields = "__all__"


class DocumentSerializer(serializers.ModelSerializer):
    file_url = serializers.SerializerMethodField()

    class Meta:
        model = Document
        fields = "__all__"

    def validate_file(self, f):
        from django.conf import settings as dj
        ext = (f.name.rsplit(".", 1)[-1] if "." in f.name else "").lower()
        if ext not in dj.ALLOWED_UPLOAD_EXTENSIONS:
            raise serializers.ValidationError(f"File type .{ext} is not allowed.")
        if f.size > dj.MAX_UPLOAD_MB * 1024 * 1024:
            raise serializers.ValidationError(f"File is larger than {dj.MAX_UPLOAD_MB} MB.")
        return f

    def get_file_url(self, obj):
        if not obj.file or not obj.file.name:
            return None
        try:
            return obj.file.url
        except Exception as e:
            import logging
            logging.getLogger("django").error(f"Document {obj.id} file.url failed: {e}")
            return None


class PhaseCategorySerializer(serializers.ModelSerializer):
    class Meta:
        model = PhaseCategory
        fields = "__all__"


class TaskSerializer(serializers.ModelSerializer):
    health = serializers.ReadOnlyField()
    schedule_variance_days = serializers.ReadOnlyField()
    cost_variance = serializers.ReadOnlyField()
    # Read: predecessor ids (for arrows) and full links; write: dependency_specs replaces the links.
    predecessors = serializers.SerializerMethodField()
    dependencies = serializers.SerializerMethodField()
    dependency_specs = serializers.ListField(child=serializers.DictField(), write_only=True, required=False)
    verified_by_username = serializers.CharField(source="verified_by.username", read_only=True, default=None)
    vendor_name = serializers.CharField(source="vendor.name", read_only=True, default=None)

    class Meta:
        model = Task
        exclude = ["deleted_at"]

    def _links(self, obj):
        cache = getattr(obj, "_prefetched_objects_cache", {})
        links = cache.get("predecessor_links")
        if links is None:
            links = obj.predecessor_links.all()
        return [l for l in links if l.predecessor.deleted_at is None]

    def create(self, validated_data):
        specs = validated_data.pop("dependency_specs", None)
        task = super().create(validated_data)
        _apply_specs(task, specs)
        return task

    def update(self, instance, validated_data):
        specs = validated_data.pop("dependency_specs", None)
        task = super().update(instance, validated_data)
        _apply_specs(task, specs)
        return task

    def get_predecessors(self, obj):
        return [str(l.predecessor_id) for l in self._links(obj)]

    def get_dependencies(self, obj):
        return [{"id": str(l.pk), "predecessor": str(l.predecessor_id), "type": l.type, "lag_days": l.lag_days}
                for l in self._links(obj)]

    def validate(self, attrs):
        project = attrs.get("project") or getattr(self.instance, "project", None)
        start = attrs.get("estimated_start", getattr(self.instance, "estimated_start", None))
        end = attrs.get("estimated_end", getattr(self.instance, "estimated_end", None))
        if start and end and end < start:
            raise serializers.ValidationError({"estimated_end": "End date is before the start date."})
        a_start = attrs.get("actual_start", getattr(self.instance, "actual_start", None))
        a_end = attrs.get("actual_end", getattr(self.instance, "actual_end", None))
        if a_start and a_end and a_end < a_start:
            raise serializers.ValidationError({"actual_end": "Actual end is before the actual start."})

        parent = attrs.get("parent", getattr(self.instance, "parent", None))
        if parent is not None:
            if project and parent.project_id != project.pk:
                raise serializers.ValidationError({"parent": "Parent must belong to the same project."})
            # No loops: a task can't be moved under itself or one of its own children.
            if self.instance is not None:
                node = parent
                while node is not None:
                    if node.pk == self.instance.pk:
                        raise serializers.ValidationError({"parent": "A position can't be placed under itself."})
                    node = node.parent

        specs = attrs.get("dependency_specs")
        if specs is not None:
            from .scheduling import validate_no_cycle
            seen = set()
            clean = []
            for sp in specs:
                pid = sp.get("predecessor")
                typ = (sp.get("type") or "FS").upper()
                try:
                    lag = int(sp.get("lag_days") or 0)
                except (TypeError, ValueError):
                    raise serializers.ValidationError({"dependency_specs": "Lag must be a whole number of days."})
                if typ not in ("FS", "SS", "FF", "SF"):
                    raise serializers.ValidationError({"dependency_specs": f"Unknown dependency type {typ}."})
                pred = Task.objects.filter(pk=pid).first()
                if pred is None:
                    raise serializers.ValidationError({"dependency_specs": "Predecessor not found."})
                if project and pred.project_id != project.pk:
                    raise serializers.ValidationError({"dependency_specs": "Dependencies must be in the same project."})
                if self.instance is not None:
                    if pred.pk == self.instance.pk:
                        raise serializers.ValidationError({"dependency_specs": "A position can't depend on itself."})
                    loop = validate_no_cycle(pred.pk, self.instance.pk)
                    if loop and not TaskDependency.objects.filter(predecessor=pred, successor=self.instance).exists():
                        raise serializers.ValidationError({"dependency_specs": "This creates a loop: " + " → ".join(loop)})
                if pred.pk in seen:
                    continue
                seen.add(pred.pk)
                clean.append((pred, typ, lag))
            attrs["dependency_specs"] = clean
        return attrs


def _apply_specs(task, specs):
    if specs is None:
        return
    TaskDependency.objects.filter(successor=task).delete()
    for pred, typ, lag in specs:
        TaskDependency.objects.create(predecessor=pred, successor=task, type=typ, lag_days=lag)


class TaskDependencySerializer(serializers.ModelSerializer):
    class Meta:
        model = TaskDependency
        fields = "__all__"


class CalendarExceptionSerializer(serializers.ModelSerializer):
    national = serializers.SerializerMethodField()

    class Meta:
        model = CalendarException
        fields = "__all__"

    def get_national(self, obj):
        return obj.project_id is None


class BaselineSerializer(serializers.ModelSerializer):
    created_by_username = serializers.CharField(source="created_by.username", read_only=True, default=None)
    task_count = serializers.SerializerMethodField()

    class Meta:
        model = Baseline
        fields = ["id", "project", "name", "created_at", "created_by_username", "task_count"]
        read_only_fields = ["project", "created_at"]

    def get_task_count(self, obj):
        return obj.items.count()


class VendorSerializer(serializers.ModelSerializer):
    class Meta:
        model = Vendor
        fields = "__all__"


class ExpenseSerializer(serializers.ModelSerializer):
    vendor_name = serializers.CharField(source="vendor.name", read_only=True, default=None)
    task_name = serializers.CharField(source="task.name", read_only=True, default=None)
    task_code = serializers.CharField(source="task.wbs_code", read_only=True, default=None)
    document_url = serializers.SerializerMethodField()
    outstanding_balance = serializers.ReadOnlyField()
    payment_status = serializers.ReadOnlyField()
    net_amount = serializers.ReadOnlyField()
    vat_amount = serializers.ReadOnlyField()

    def get_document_url(self, obj):
        try:
            return obj.document.file.url if obj.document and obj.document.file else None
        except Exception:
            return None

    class Meta:
        model = Expense
        fields = "__all__"


class UnitSerializer(serializers.ModelSerializer):
    class Meta:
        model = Unit
        fields = "__all__"


class CustomerSerializer(serializers.ModelSerializer):
    class Meta:
        model = Customer
        fields = "__all__"


class PaymentInstallmentSerializer(serializers.ModelSerializer):
    class Meta:
        model = PaymentInstallment
        fields = "__all__"
        # 'agreement' is not required on write: when creating a sale, installments are
        # nested inside SaleAgreementSerializer.create() and don't have an agreement id
        # yet (the agreement doesn't exist until that same call creates it).
        extra_kwargs = {"agreement": {"required": False}}


class SaleAgreementSerializer(serializers.ModelSerializer):
    installments = PaymentInstallmentSerializer(many=True, required=False)
    unit_identifier = serializers.CharField(source="unit.identifier", read_only=True)
    customer_name = serializers.CharField(source="customer.name", read_only=True)

    class Meta:
        model = SaleAgreement
        fields = "__all__"

    def create(self, validated_data):
        installments = validated_data.pop("installments", [])
        with transaction.atomic():
            agreement = SaleAgreement.objects.create(**validated_data)
            for inst in installments:
                PaymentInstallment.objects.create(agreement=agreement, **inst)
        return agreement


class IssueSerializer(serializers.ModelSerializer):
    remediation_task_name = serializers.CharField(source="remediation_task.name", read_only=True, default=None)
    remediation_task_status = serializers.CharField(source="remediation_task.status", read_only=True, default=None)

    class Meta:
        model = Issue
        fields = "__all__"


class ProjectSerializer(serializers.ModelSerializer):
    class Meta:
        model = Project
        fields = "__all__"


class ProjectDetailSerializer(serializers.ModelSerializer):
    tasks = TaskSerializer(many=True, read_only=True)
    units = UnitSerializer(many=True, read_only=True)
    issues = IssueSerializer(many=True, read_only=True)

    class Meta:
        model = Project
        fields = "__all__"
