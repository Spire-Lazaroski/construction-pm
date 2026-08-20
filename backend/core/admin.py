from django.contrib import admin
from .models import (
    Project, PhaseCategory, Task, Vendor, Expense,
    Unit, Customer, SaleAgreement, PaymentInstallment, Issue,
)

for model in [Project, PhaseCategory, Task, Vendor, Expense, Unit, Customer, SaleAgreement, PaymentInstallment, Issue]:
    admin.site.register(model)
