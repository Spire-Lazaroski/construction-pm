from django.db import transaction
from rest_framework import serializers
from .models import (
    Project, PhaseCategory, Task, Vendor, Expense,
    Unit, Customer, SaleAgreement, PaymentInstallment, Issue, Document, Activity,
)


class ActivitySerializer(serializers.ModelSerializer):
    related_task_name = serializers.CharField(source="related_task.name", read_only=True, default=None)
    related_vendor_name = serializers.CharField(source="related_vendor.name", read_only=True, default=None)
    related_customer_name = serializers.CharField(source="related_customer.name", read_only=True, default=None)

    class Meta:
        model = Activity
        fields = "__all__"


class DocumentSerializer(serializers.ModelSerializer):
    # DRF's automatic FileField serialization returns None on all sorts of edge cases
    # (empty file, storage misconfiguration, etc.) with zero indication why — which is
    # exactly what made this bug invisible. This makes the URL generation explicit and
    # logs the real reason if it ever fails again, instead of silently returning nothing.
    file_url = serializers.SerializerMethodField()

    class Meta:
        model = Document
        fields = "__all__"

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
    predecessors = serializers.PrimaryKeyRelatedField(many=True, queryset=Task.objects.all(), required=False)
    verified_by_username = serializers.CharField(source="verified_by.username", read_only=True, default=None)

    class Meta:
        model = Task
        fields = "__all__"


class VendorSerializer(serializers.ModelSerializer):
    class Meta:
        model = Vendor
        fields = "__all__"


class ExpenseSerializer(serializers.ModelSerializer):
    vendor_name = serializers.CharField(source="vendor.name", read_only=True, default=None)
    task_name = serializers.CharField(source="task.name", read_only=True, default=None)
    outstanding_balance = serializers.ReadOnlyField()
    payment_status = serializers.ReadOnlyField()

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
