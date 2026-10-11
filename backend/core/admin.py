from django.contrib import admin
from .models import (
    Project, PhaseCategory, Task, Vendor, Expense,
    Unit, Customer, SaleAgreement, PaymentInstallment, Issue, Document, Activity, TaskAuditLog,
    TaskDependency, ProjectCalendar, CalendarException, Baseline, Payment, RecurringCost,
)

for model in [
    Project, PhaseCategory, Task, Vendor, Expense, Unit, Customer,
    SaleAgreement, PaymentInstallment, Issue, Document, Activity, TaskAuditLog,
    TaskDependency, ProjectCalendar, CalendarException, Baseline, Payment, RecurringCost,
]:
    admin.site.register(model)
