import datetime
import uuid
from decimal import Decimal
from django.conf import settings
from django.core.validators import MaxValueValidator, MinValueValidator
from django.db import models
from django.utils import timezone


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
    investor = models.CharField(max_length=255, blank=True)
    building_type = models.CharField(max_length=100, blank=True)
    latitude = models.DecimalField(max_digits=9, decimal_places=6, null=True, blank=True)
    longitude = models.DecimalField(max_digits=9, decimal_places=6, null=True, blank=True)

    def __str__(self):
        return self.name


class PhaseCategory(models.Model):
    name = models.CharField(max_length=100)
    default_order = models.PositiveIntegerField(default=0)
    color = models.CharField(max_length=7, default="#3b82f6")

    class Meta:
        verbose_name_plural = "Phase categories"
        ordering = ["default_order"]

    def __str__(self):
        return self.name


class LiveTaskManager(models.Manager):
    """Default manager hides soft-deleted tasks everywhere (including project.tasks)."""
    def get_queryset(self):
        return super().get_queryset().filter(deleted_at__isnull=True)


class Task(TimeStamped):
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
    wbs_code = models.CharField(max_length=30, blank=True, help_text="Position code, e.g. А01 or А01.1")
    is_milestone = models.BooleanField(default=False)
    vendor = models.ForeignKey(
        "Vendor", null=True, blank=True, related_name="tasks", on_delete=models.SET_NULL,
        help_text="Main contractor on this position (shown on the Gantt).",
    )

    # Nullable: a position can exist in the budget before it is scheduled.
    estimated_start = models.DateField(null=True, blank=True)
    estimated_end = models.DateField(null=True, blank=True)
    actual_start = models.DateField(null=True, blank=True)
    actual_end = models.DateField(null=True, blank=True)

    estimated_cost = models.DecimalField(max_digits=14, decimal_places=2, default=0)
    actual_cost = models.DecimalField(max_digits=14, decimal_places=2, default=0)

    progress_pct = models.PositiveIntegerField(default=0, validators=[MinValueValidator(0), MaxValueValidator(100)])
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default="not_started")

    # Scheduling (Phase A): dependencies live in TaskDependency (FS/SS/FF/SF + lag).
    CALENDAR_CHOICES = [("project", "Project calendar"), ("seven_day", "7-day (calendar days)")]
    CONSTRAINT_CHOICES = [
        ("", "As soon as possible"),
        ("snet", "Start no earlier than"),
        ("fnlt", "Finish no later than"),
        ("mso", "Must start on"),
    ]
    calendar_mode = models.CharField(max_length=10, choices=CALENDAR_CHOICES, default="project")
    constraint_type = models.CharField(max_length=4, choices=CONSTRAINT_CHOICES, default="", blank=True)
    constraint_date = models.DateField(null=True, blank=True)

    notes = models.TextField(blank=True)

    verified = models.BooleanField(default=False)
    verified_by = models.ForeignKey(
        settings.AUTH_USER_MODEL, null=True, blank=True, on_delete=models.SET_NULL, related_name="verified_tasks"
    )
    verified_at = models.DateTimeField(null=True, blank=True)
    verification_notes = models.TextField(blank=True)

    deleted_at = models.DateTimeField(null=True, blank=True, db_index=True)

    objects = LiveTaskManager()
    all_objects = models.Manager()

    class Meta:
        ordering = ["order", "estimated_start"]
        base_manager_name = "all_objects"

    def __str__(self):
        return f"{self.project.name} / {self.name}"

    @property
    def schedule_variance_days(self):
        if self.actual_end and self.estimated_end:
            return (self.actual_end - self.estimated_end).days
        return None

    def descendants(self, include_deleted=False):
        manager = Task.all_objects if include_deleted else Task.objects
        out, frontier = [], [self.pk]
        while frontier:
            kids = list(manager.filter(parent_id__in=frontier))
            out.extend(kids)
            frontier = [k.pk for k in kids]
        return out

    @property
    def cost_variance(self):
        return self.estimated_cost - self.actual_cost

    @property
    def health(self):
        """Simple red/amber/green indicator used by the Gantt UI."""
        if self.status == "completed":
            if not self.verified:
                return "amber"
            over_budget = self.actual_cost > self.estimated_cost
            return "amber" if over_budget else "green"
        if self.status == "blocked":
            return "red"
        if self.actual_cost and self.estimated_cost and self.actual_cost > self.estimated_cost * Decimal("1.1"):
            return "red"
        if (self.status != "completed" and self.estimated_end
                and self.estimated_end < timezone.localdate() and self.progress_pct < 100):
            return "red"
        return "green"


class TaskAuditLog(models.Model):
    """A record of who changed what on a task, and when — separate from the task
    itself so it survives edits and even deletion (task FK is nullable for that)."""
    ACTION_CHOICES = [("created", "Created"), ("updated", "Updated"), ("deleted", "Deleted")]

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    project = models.ForeignKey(Project, related_name="task_audit_logs", on_delete=models.CASCADE)
    task = models.ForeignKey(Task, null=True, blank=True, related_name="audit_logs", on_delete=models.SET_NULL)
    task_name_snapshot = models.CharField(max_length=255)
    action = models.CharField(max_length=10, choices=ACTION_CHOICES)
    changed_by = models.ForeignKey(
        settings.AUTH_USER_MODEL, null=True, blank=True, on_delete=models.SET_NULL, related_name="task_audit_entries"
    )
    changed_at = models.DateTimeField(auto_now_add=True)
    changes = models.JSONField(default=dict, blank=True)

    class Meta:
        ordering = ["-changed_at"]

    def __str__(self):
        return f"{self.action} — {self.task_name_snapshot} ({self.changed_at})"


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
    vendor-specific structure. Actual entries double as vendor payables — due_date/
    paid_date/amount_paid track what's owed vs paid."""
    TYPE_CHOICES = [("estimate", "Estimate"), ("actual", "Actual")]

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    project = models.ForeignKey(Project, related_name="expenses", on_delete=models.CASCADE)
    task = models.ForeignKey(Task, null=True, blank=True, related_name="expenses", on_delete=models.SET_NULL)
    vendor = models.ForeignKey(Vendor, null=True, blank=True, related_name="expenses", on_delete=models.SET_NULL)

    APPROVAL_CHOICES = [("received", "Received"), ("approved", "Approved"), ("rejected", "Rejected")]
    CURRENCY_CHOICES = [("EUR", "EUR"), ("MKD", "MKD")]

    entry_type = models.CharField(max_length=10, choices=TYPE_CHOICES)
    description = models.CharField(max_length=255)
    # `amount` is always EUR (what every report sums). An invoice issued in MKD keeps
    # its original figure in `original_amount` + `currency`.
    amount = models.DecimalField(max_digits=14, decimal_places=2)
    currency = models.CharField(max_length=3, choices=CURRENCY_CHOICES, default="EUR")
    original_amount = models.DecimalField(max_digits=16, decimal_places=2, null=True, blank=True)
    invoice_number = models.CharField(max_length=100, blank=True)
    vat_rate = models.DecimalField(max_digits=5, decimal_places=2, default=Decimal("18.00"))
    approval_status = models.CharField(max_length=10, choices=APPROVAL_CHOICES, default="received")
    document = models.ForeignKey(
        "Document", null=True, blank=True, related_name="expenses", on_delete=models.SET_NULL,
        help_text="The invoice PDF.",
    )
    date = models.DateField()
    extra_fields = models.JSONField(default=dict, blank=True)

    due_date = models.DateField(null=True, blank=True)
    paid_date = models.DateField(null=True, blank=True)
    amount_paid = models.DecimalField(max_digits=14, decimal_places=2, default=0)

    def __str__(self):
        return f"{self.description} ({self.amount})"

    @property
    def net_amount(self):
        rate = Decimal(1) + (self.vat_rate or 0) / Decimal(100)
        return (self.amount / rate).quantize(Decimal("0.01")) if self.amount else Decimal(0)

    @property
    def vat_amount(self):
        return (self.amount - self.net_amount) if self.amount else Decimal(0)

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
    """A small, manual to-do that doesn't have its own record elsewhere — the CRM layer."""
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
    resolution_notes = models.TextField(blank=True)

    def __str__(self):
        return self.title


class TaskDependency(models.Model):
    """predecessor -> successor link. lag_days is in working days (negative = lead)."""
    TYPE_CHOICES = [("FS", "Finish-to-start"), ("SS", "Start-to-start"), ("FF", "Finish-to-finish"), ("SF", "Start-to-finish")]

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    predecessor = models.ForeignKey(Task, related_name="successor_links", on_delete=models.CASCADE)
    successor = models.ForeignKey(Task, related_name="predecessor_links", on_delete=models.CASCADE)
    type = models.CharField(max_length=2, choices=TYPE_CHOICES, default="FS")
    lag_days = models.IntegerField(default=0)

    class Meta:
        unique_together = ("predecessor", "successor")

    def __str__(self):
        return f"{self.predecessor} -{self.type}{self.lag_days:+d}-> {self.successor}"


class ProjectCalendar(models.Model):
    """Working week of a project. Default Mon–Sat (Sunday off) — decision D-02."""
    project = models.OneToOneField(Project, related_name="calendar", on_delete=models.CASCADE)
    # Python weekday numbers: 0 = Monday … 6 = Sunday
    working_weekdays = models.JSONField(default=list)

    def save(self, *args, **kwargs):
        if not self.working_weekdays:
            self.working_weekdays = [0, 1, 2, 3, 4, 5]
        super().save(*args, **kwargs)


class CalendarException(models.Model):
    """A non-working day (holiday, winter stop) or an extra working day.
    project = NULL means a national holiday that applies to every project."""
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    project = models.ForeignKey(Project, null=True, blank=True, related_name="calendar_exceptions", on_delete=models.CASCADE)
    date = models.DateField()
    name = models.CharField(max_length=120)
    is_working = models.BooleanField(default=False, help_text="True = extra working day (e.g. a Sunday pour).")

    class Meta:
        ordering = ["date"]
        unique_together = ("project", "date")

    def __str__(self):
        return f"{self.date} {self.name}"


class Baseline(models.Model):
    """A saved copy of the plan, to compare the current schedule against."""
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    project = models.ForeignKey(Project, related_name="baselines", on_delete=models.CASCADE)
    name = models.CharField(max_length=120)
    created_at = models.DateTimeField(auto_now_add=True)
    created_by = models.ForeignKey(settings.AUTH_USER_MODEL, null=True, blank=True, on_delete=models.SET_NULL)

    class Meta:
        ordering = ["-created_at"]


class BaselineTask(models.Model):
    baseline = models.ForeignKey(Baseline, related_name="items", on_delete=models.CASCADE)
    task = models.ForeignKey(Task, null=True, blank=True, related_name="baseline_items", on_delete=models.SET_NULL)
    start = models.DateField(null=True, blank=True)
    end = models.DateField(null=True, blank=True)
    cost = models.DecimalField(max_digits=14, decimal_places=2, default=0)
