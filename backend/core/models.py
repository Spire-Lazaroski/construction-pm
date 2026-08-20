import uuid
from decimal import Decimal
from django.conf import settings
from django.db import models


class TimeStamped(models.Model):
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        abstract = True


class Project(TimeStamped):
    STATUS_CHOICES = [
        ("planning", "Planning"),
        ("active", "Active"),
        ("on_hold", "On Hold"),
        ("completed", "Completed"),
    ]

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    name = models.CharField(max_length=255)
    site_address = models.CharField(max_length=255, blank=True)
    description = models.TextField(blank=True)
    start_date = models.DateField(null=True, blank=True)
    estimated_end_date = models.DateField(null=True, blank=True)
    actual_end_date = models.DateField(null=True, blank=True)
    total_budget = models.DecimalField(max_digits=14, decimal_places=2, default=0)
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default="planning")

    def __str__(self):
        return self.name


class PhaseCategory(models.Model):
    """Reusable library of phase/task types so users don't retype the process every project."""
    name = models.CharField(max_length=100)
    default_order = models.PositiveIntegerField(default=0)
    color = models.CharField(max_length=7, default="#3b82f6")

    class Meta:
        verbose_name_plural = "Phase categories"
        ordering = ["default_order"]

    def __str__(self):
        return self.name


class Task(TimeStamped):
    """A phase / task / milestone belonging to a project. Drives the Gantt chart."""
    STATUS_CHOICES = [
        ("not_started", "Not Started"),
        ("in_progress", "In Progress"),
        ("completed", "Completed"),
        ("delayed", "Delayed"),
        ("blocked", "Blocked"),
    ]

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    project = models.ForeignKey(Project, related_name="tasks", on_delete=models.CASCADE)
    category = models.ForeignKey(PhaseCategory, null=True, blank=True, on_delete=models.SET_NULL)
    parent = models.ForeignKey("self", null=True, blank=True, related_name="subtasks", on_delete=models.CASCADE)
    name = models.CharField(max_length=255)
    order = models.PositiveIntegerField(default=0)

    estimated_start = models.DateField()
    estimated_end = models.DateField()
    actual_start = models.DateField(null=True, blank=True)
    actual_end = models.DateField(null=True, blank=True)

    estimated_cost = models.DecimalField(max_digits=14, decimal_places=2, default=0)
    actual_cost = models.DecimalField(max_digits=14, decimal_places=2, default=0)

    progress_pct = models.PositiveIntegerField(default=0)
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default="not_started")

    predecessors = models.ManyToManyField(
        "self", symmetrical=False, related_name="successors", blank=True
    )

    notes = models.TextField(blank=True)

    # --- verification / sign-off: "completed" means someone said so; "verified" means
    # a second person checked it. These stay separate from `status` on purpose. ---
    verified = models.BooleanField(default=False)
    verified_by = models.ForeignKey(
        settings.AUTH_USER_MODEL, null=True, blank=True, on_delete=models.SET_NULL, related_name="verified_tasks"
    )
    verified_at = models.DateTimeField(null=True, blank=True)
    verification_notes = models.TextField(blank=True)

    class Meta:
        ordering = ["order", "estimated_start"]

    def __str__(self):
        return f"{self.project.name} / {self.name}"

    @property
    def schedule_variance_days(self):
        if self.actual_end and self.estimated_end:
            return (self.actual_end - self.estimated_end).days
        return None

    @property
    def cost_variance(self):
        return self.estimated_cost - self.actual_cost

    @property
    def health(self):
        """Simple red/amber/green indicator used by the Gantt UI."""
        if self.status == "completed":
            if not self.verified:
                return "amber"  # done, but not yet signed off — not "green" until checked
            over_budget = self.actual_cost > self.estimated_cost
            return "amber" if over_budget else "green"
        if self.status == "blocked":
            return "red"
        if self.actual_cost and self.estimated_cost and self.actual_cost > self.estimated_cost * Decimal("1.1"):
            return "red"
        import datetime
        if self.status != "completed" and self.estimated_end < datetime.date.today() and self.progress_pct < 100:
            return "red"
        return "green"


class Vendor(models.Model):
    name = models.CharField(max_length=255)
    trade = models.CharField(max_length=100, blank=True)
    contact_name = models.CharField(max_length=255, blank=True)
    phone = models.CharField(max_length=50, blank=True)
    email = models.EmailField(blank=True)
    notes = models.TextField(blank=True)

    def __str__(self):
        return self.name


class Expense(TimeStamped):
    """Flexible cost entry: vendor <-> task, estimate or actual, with a JSON field for
    vendor-specific structure (unit rates, quantities, retention %, etc.). Actual entries
    double as vendor payables — due_date/paid_date/amount_paid track what's owed vs paid."""
    TYPE_CHOICES = [("estimate", "Estimate"), ("actual", "Actual")]

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    project = models.ForeignKey(Project, related_name="expenses", on_delete=models.CASCADE)
    task = models.ForeignKey(Task, null=True, blank=True, related_name="expenses", on_delete=models.SET_NULL)
    vendor = models.ForeignKey(Vendor, null=True, blank=True, related_name="expenses", on_delete=models.SET_NULL)

    entry_type = models.CharField(max_length=10, choices=TYPE_CHOICES)
    description = models.CharField(max_length=255)
    amount = models.DecimalField(max_digits=14, decimal_places=2)
    date = models.DateField()
    extra_fields = models.JSONField(default=dict, blank=True)

    # --- payables tracking (relevant when entry_type == "actual") ---
    due_date = models.DateField(null=True, blank=True)
    paid_date = models.DateField(null=True, blank=True)
    amount_paid = models.DecimalField(max_digits=14, decimal_places=2, default=0)

    def __str__(self):
        return f"{self.description} ({self.amount})"

    @property
    def outstanding_balance(self):
        return self.amount - self.amount_paid

    @property
    def payment_status(self):
        if self.amount_paid <= 0:
            return "unpaid"
        if self.amount_paid >= self.amount:
            return "paid"
        return "partial"


class Unit(models.Model):
    STATUS_CHOICES = [("available", "Available"), ("reserved", "Reserved"), ("sold", "Sold")]

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    project = models.ForeignKey(Project, related_name="units", on_delete=models.CASCADE)
    identifier = models.CharField(max_length=50)
    sqm = models.DecimalField(max_digits=8, decimal_places=2)
    list_price = models.DecimalField(max_digits=14, decimal_places=2)
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default="available")

    class Meta:
        unique_together = ("project", "identifier")

    def __str__(self):
        return f"{self.project.name} / {self.identifier}"


class Customer(models.Model):
    name = models.CharField(max_length=255)
    email = models.EmailField(blank=True)
    phone = models.CharField(max_length=50, blank=True)
    notes = models.TextField(blank=True)

    def __str__(self):
        return self.name


class SaleAgreement(TimeStamped):
    STATUS_CHOICES = [
        ("draft", "Draft"),
        ("signed", "Signed"),
        ("completed", "Completed"),
        ("cancelled", "Cancelled"),
    ]
    PAYMENT_STRUCTURES = [
        ("lump_sum", "Lump Sum"),
        ("installments", "Installments"),
        ("mortgage", "Mortgage"),
    ]

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    unit = models.OneToOneField(Unit, related_name="sale_agreement", on_delete=models.CASCADE)
    customer = models.ForeignKey(Customer, related_name="agreements", on_delete=models.CASCADE)
    agreed_price = models.DecimalField(max_digits=14, decimal_places=2)
    agreed_sqm = models.DecimalField(max_digits=8, decimal_places=2)
    signed_date = models.DateField(null=True, blank=True)
    payment_structure = models.CharField(max_length=50, choices=PAYMENT_STRUCTURES)
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default="draft")
    notes = models.TextField(blank=True)

    def __str__(self):
        return f"{self.unit} -> {self.customer}"


class PaymentInstallment(models.Model):
    agreement = models.ForeignKey(SaleAgreement, related_name="installments", on_delete=models.CASCADE)
    due_date = models.DateField()
    amount_due = models.DecimalField(max_digits=14, decimal_places=2)
    paid_date = models.DateField(null=True, blank=True)
    amount_paid = models.DecimalField(max_digits=14, decimal_places=2, default=0)

    class Meta:
        ordering = ["due_date"]


class Document(TimeStamped):
    """Generic attachment (contract, permit, insurance doc, invoice PDF...) stored on
    Supabase Storage in production (see settings.py) or local media in dev."""
    DOC_TYPES = [
        ("contract", "Contract"),
        ("permit", "Permit"),
        ("insurance", "Insurance"),
        ("invoice", "Invoice"),
        ("drawing", "Drawing/Plan"),
        ("other", "Other"),
    ]

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    project = models.ForeignKey(Project, related_name="documents", on_delete=models.CASCADE)
    task = models.ForeignKey(Task, null=True, blank=True, related_name="documents", on_delete=models.SET_NULL)
    vendor = models.ForeignKey(Vendor, null=True, blank=True, related_name="documents", on_delete=models.SET_NULL)
    sale_agreement = models.ForeignKey(
        "SaleAgreement", null=True, blank=True, related_name="documents", on_delete=models.SET_NULL
    )
    doc_type = models.CharField(max_length=20, choices=DOC_TYPES, default="other")
    title = models.CharField(max_length=255)
    file = models.FileField(upload_to="documents/%Y/%m/")
    notes = models.TextField(blank=True)

    def __str__(self):
        return self.title


class Activity(TimeStamped):
    """A small, manual to-do that doesn't have its own record elsewhere — the CRM layer.
    Optionally linked to a task, vendor, or customer for context."""
    TYPE_CHOICES = [
        ("call", "Call"),
        ("email", "Email"),
        ("site_visit", "Site Visit"),
        ("meeting", "Meeting"),
        ("follow_up", "Follow-up"),
        ("note", "Note"),
    ]

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    project = models.ForeignKey(Project, related_name="activities", on_delete=models.CASCADE)
    title = models.CharField(max_length=255)
    activity_type = models.CharField(max_length=20, choices=TYPE_CHOICES, default="note")
    due_date = models.DateField(null=True, blank=True)
    done = models.BooleanField(default=False)
    related_task = models.ForeignKey(Task, null=True, blank=True, related_name="activities", on_delete=models.SET_NULL)
    related_vendor = models.ForeignKey(Vendor, null=True, blank=True, related_name="activities", on_delete=models.SET_NULL)
    related_customer = models.ForeignKey(Customer, null=True, blank=True, related_name="activities", on_delete=models.SET_NULL)
    notes = models.TextField(blank=True)

    class Meta:
        ordering = ["done", "due_date"]

    def __str__(self):
        return self.title


class Issue(TimeStamped):
    """Unforeseen problem. Can be linked to a task and can spawn a remediation Task,
    so it plugs back into the same dependency graph as the main process."""
    SEVERITY_CHOICES = [("low", "Low"), ("medium", "Medium"), ("high", "High"), ("critical", "Critical")]
    STATUS_CHOICES = [("open", "Open"), ("in_progress", "In Progress"), ("resolved", "Resolved")]

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    project = models.ForeignKey(Project, related_name="issues", on_delete=models.CASCADE)
    related_task = models.ForeignKey(Task, null=True, blank=True, related_name="issues", on_delete=models.SET_NULL)
    remediation_task = models.OneToOneField(
        Task, null=True, blank=True, related_name="resolves_issue", on_delete=models.SET_NULL
    )

    title = models.CharField(max_length=255)
    description = models.TextField(blank=True)
    severity = models.CharField(max_length=10, choices=SEVERITY_CHOICES, default="medium")
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default="open")
    discovered_date = models.DateField()
    resolved_date = models.DateField(null=True, blank=True)
    estimated_cost_impact = models.DecimalField(max_digits=14, decimal_places=2, default=0)
    actual_cost_impact = models.DecimalField(max_digits=14, decimal_places=2, default=0)
    estimated_delay_days = models.PositiveIntegerField(default=0)

    def __str__(self):
        return self.title
