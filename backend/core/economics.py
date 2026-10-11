"""Project economics: what a project produces (units, m²) against what it costs.

Cost side
- construction: the positions' budgets (own amounts, same rule as the Excel) and invoices
- land: cash compensation to the landowner (units handed over are excluded from revenue)
- fixed monthly costs (RecurringCost):
    * with a project  -> that site's running cost, counted in every month the site is open
    * without project -> company overhead; each month it is shared among the projects
      active that month, in proportion to their budgets
Revenue side
- units for sale: area × planned price per m² (or a fixed price); "final" uses the
  geodetic area once it is measured.
"""
import datetime as dt
from collections import defaultdict
from decimal import Decimal

from django.db.models import Sum
from django.utils import timezone

from .models import Project, RecurringCost

ZERO = Decimal(0)
DAYS_PER_MONTH = Decimal("30.4375")


def month_start(d):
    return d.replace(day=1)


def months_between(first, last):
    """[first .. last] as 1st-of-month dates, inclusive."""
    out, m = [], month_start(first)
    last = month_start(last)
    while m <= last:
        out.append(m)
        m = (m.replace(day=28) + dt.timedelta(days=4)).replace(day=1)
    return out


def project_span(project):
    """(first month, last month) the project is running, or None without dates."""
    end = project.actual_end_date or project.estimated_end_date
    if not project.start_date or not end or end < project.start_date:
        return None
    return month_start(project.start_date), month_start(end)


def project_budget(project):
    return project.tasks.aggregate(s=Sum("estimated_cost"))["s"] or project.total_budget or ZERO


def _active(project, month, span):
    return project.status != "on_hold" and span is not None and span[0] <= month <= span[1]


class OverheadAllocator:
    """Company overhead per month and each project's budget share of it."""

    def __init__(self):
        self.projects = list(Project.objects.all())
        self.spans = {p.pk: project_span(p) for p in self.projects}
        self.budgets = {p.pk: project_budget(p) for p in self.projects}
        self.company_costs = list(RecurringCost.objects.filter(project__isnull=True))

    def company_total(self, month):
        return sum((c.amount for c in self.company_costs if c.active_in(month)), ZERO)

    def shares(self, month):
        active = [p for p in self.projects if _active(p, month, self.spans[p.pk])]
        if not active:
            return {}
        total = sum((self.budgets[p.pk] for p in active), ZERO)
        if total <= 0:  # no budgets yet: split equally
            return {p.pk: Decimal(1) / len(active) for p in active}
        return {p.pk: self.budgets[p.pk] / total for p in active}

    def matrix(self, months):
        """[{month, company_total, unallocated, projects: {id: {share, amount}}}]"""
        rows = []
        for m in months:
            total = self.company_total(m)
            shares = self.shares(m)
            rows.append({
                "month": m,
                "company_total": total,
                "unallocated": total if not shares else ZERO,
                "projects": {str(pid): {"share": s, "amount": total * s} for pid, s in shares.items()},
            })
        return rows


def _r(x, places="0.01"):
    return Decimal(x).quantize(Decimal(places)) if x is not None else None


def project_economics(project, today=None):
    today = today or timezone.localdate()
    this_month = month_start(today)

    # ---- units / effect
    units = list(project.units.all())
    by_alloc = defaultdict(lambda: {"count": 0, "area_planned": ZERO, "area_final": ZERO,
                                    "value_planned": ZERO, "value_final": ZERO})
    by_type = defaultdict(lambda: {"count": 0, "area_planned": ZERO, "area_final": ZERO})
    measured = 0
    for u in units:
        a = by_alloc[u.allocation]
        a["count"] += 1
        a["area_planned"] += u.sqm or ZERO
        a["area_final"] += u.area_final or ZERO
        a["value_planned"] += u.planned_value
        a["value_final"] += u.value_final
        t = by_type[u.unit_type]
        t["count"] += 1
        t["area_planned"] += u.sqm or ZERO
        t["area_final"] += u.area_final or ZERO
        measured += u.area_actual is not None
    sale = by_alloc["sale"]
    landowner = by_alloc["landowner"]
    total_area_planned = sum((v["area_planned"] for v in by_alloc.values()), ZERO)
    total_area_final = sum((v["area_final"] for v in by_alloc.values()), ZERO)

    # ---- construction
    budget = project_budget(project)
    invoiced = project.expenses.filter(entry_type="actual").aggregate(s=Sum("amount"))["s"] or ZERO
    paid = project.expenses.filter(entry_type="actual").aggregate(s=Sum("amount_paid"))["s"] or ZERO

    # ---- fixed monthly costs
    span = project_span(project)
    months = months_between(*span) if span else []
    site_costs = list(project.recurring_costs.all())
    allocator = OverheadAllocator()
    overhead_rows = allocator.matrix(months)
    monthly = []
    for m, row in zip(months, overhead_rows):
        site = sum((c.amount for c in site_costs if c.active_in(m)), ZERO)
        mine = row["projects"].get(str(project.pk), {"share": ZERO, "amount": ZERO})
        monthly.append({"month": m, "site": site, "overhead": mine["amount"], "share": mine["share"]})
    site_planned = sum((r["site"] for r in monthly), ZERO)
    overhead_planned = sum((r["overhead"] for r in monthly), ZERO)
    site_to_date = sum((r["site"] for r in monthly if r["month"] <= this_month), ZERO)
    overhead_to_date = sum((r["overhead"] for r in monthly if r["month"] <= this_month), ZERO)
    current = next((r for r in monthly if r["month"] == this_month), monthly[-1] if monthly else None)
    run_rate = (current["site"] + current["overhead"]) if current else ZERO

    # ---- delay: forecast finish from the critical path vs. planned finish
    delay = {"days": None, "cost": None, "forecast_finish": None, "planned_finish": None}
    try:
        from .scheduling import compute_schedule
        sched = compute_schedule(project, status_date=today)
        ff, pf = sched.get("forecast_finish"), sched.get("planned_finish")
        delay["forecast_finish"], delay["planned_finish"] = ff, pf
        if ff and pf:
            days = (ff - pf).days
            delay["days"] = days
            delay["cost"] = _r(run_rate / DAYS_PER_MONTH * max(days, 0))
    except Exception:  # a dependency loop must not break the economics page
        pass

    # ---- result
    land_cash = project.land_cash_compensation or ZERO
    total_cost = budget + land_cash + site_planned + overhead_planned
    revenue_planned = sale["value_planned"]
    revenue_final = sale["value_final"]

    def per_sqm(amount, area):
        return _r(amount / area) if area else None

    return {
        "units": {
            "count": len(units),
            "measured": measured,
            "area_planned": total_area_planned,
            "area_final": total_area_final,
            "area_difference": total_area_final - total_area_planned,
            "by_allocation": {k: dict(v) for k, v in by_alloc.items()},
            "by_type": {k: dict(v) for k, v in by_type.items()},
        },
        "revenue": {
            "planned": revenue_planned,
            "final": revenue_final,
            "avg_price_sqm": per_sqm(revenue_planned, sale["area_planned"]),
        },
        "land": {
            "cash": land_cash,
            "units_count": landowner["count"],
            "units_area": landowner["area_final"],
            "units_value": landowner["value_final"],
            "total": land_cash + landowner["value_final"],
        },
        "costs": {
            "construction_budget": budget,
            "invoiced": invoiced,
            "paid": paid,
            "land_cash": land_cash,
            "site_planned": site_planned,
            "site_to_date": site_to_date,
            "overhead_planned": _r(overhead_planned),
            "overhead_to_date": _r(overhead_to_date),
            "overhead_pct_of_budget": _r(overhead_planned / budget * 100, "0.1") if budget else None,
            "fixed_per_month": _r(run_rate),
            "total": _r(total_cost),
        },
        "result": {
            "margin": _r(revenue_planned - total_cost),
            "margin_pct": _r((revenue_planned - total_cost) / revenue_planned * 100, "0.1") if revenue_planned else None,
            "margin_final": _r(revenue_final - total_cost),
            "cost_per_sqm_sellable": per_sqm(total_cost, sale["area_planned"]),
            "cost_per_sqm_sellable_final": per_sqm(total_cost, sale["area_final"]),
            "cost_per_sqm_built": per_sqm(total_cost, total_area_planned),
            "break_even_price_sqm": per_sqm(total_cost, sale["area_final"] or sale["area_planned"]),
        },
        "delay": delay,
        "monthly": [{**r, "overhead": _r(r["overhead"]), "share": _r(r["share"] * 100, "0.1")} for r in monthly],
        "has_dates": span is not None,
    }
