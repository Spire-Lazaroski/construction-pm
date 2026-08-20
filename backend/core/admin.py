from django.contrib import admin
from .models import (
    Project, PhaseCategory, Task, Vendor, Expense,
    Unit, Customer, SaleAgreement, PaymentInstallment, Issue, Document, Activity,
)

for model in [
    Project, PhaseCategory, Task, Vendor, Expense, Unit, Customer,
    SaleAgreement, PaymentInstallment, Issue, Document, Activity,
]:
    admin.site.register(model)
