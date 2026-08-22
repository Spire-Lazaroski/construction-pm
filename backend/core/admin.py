from django.contrib import admin
from .models import (
    Project, PhaseCategory, Task, Vendor, Expense,
    Unit, Customer, SaleAgreement, PaymentInstallment, Issue, Document, Activity, TaskAuditLog,
)

for model in [
    Project, PhaseCategory, Task, Vendor, Expense, Unit, Customer,
    SaleAgreement, PaymentInstallment, Issue, Document, Activity, TaskAuditLog,
]:
    admin.site.register(model)
