from django.contrib import admin
from .models import (
    Project, PhaseCategory, Task, Vendor, Expense,
    Unit, Customer, SaleAgreement, PaymentInstallment, Issue, Document, Activity, TaskAuditLog,
    TaskDependency, ProjectCalendar, CalendarException, Baseline,
)

for model in [
    Project, PhaseCategory, Task, Vendor, Expense, Unit, Customer,
    SaleAgreement, PaymentInstallment, Issue, Document, Activity, TaskAuditLog,
    TaskDependency, ProjectCalendar, CalendarException, Baseline,
]:
    admin.site.register(model)
