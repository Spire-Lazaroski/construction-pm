"""Critical-path scheduling (CPM) with working calendars.

    result = compute_schedule(project, status_date=None, baseline=None)

Rules
-----
* Calendar: the project's working weekdays (default Mon–Sat) minus national holidays and
  project non-working days, plus project extra working days. A task can instead run on a
  7-day calendar (curing, permits).
* Durations are working days, inclusive: a task 01.09–04.09 (Tue–Fri) lasts 4 days.
* Dependencies: FS / SS / FF / SF with lag in working days (negative = lead). Links to or
  from a group are expanded to every position inside it.
* Actuals win: a started task starts on its actual start; a finished task ends on its
  actual end; a task in progress finishes after its remaining work, counted from the status
  date. A task not yet started can't start before the status date, nor before its planned
  start (the plan is treated as "start no earlier than").
* Constraints: SNET (start no earlier than), MSO (must start on), FNLT (finish no later than —
  produces negative float when it can't be met).
* Forward pass -> early dates; backward pass from the forecast finish -> late dates;
  total float, free float, critical (float <= 0, work not finished), near-critical, and the
  driving predecessors (the links that actually set each early start).
"""
import datetime as dt
import math
from collections import defaultdict, deque

from django.utils import timezone

from .models import CalendarException, ProjectCalendar, Task, TaskDependency

ONE = dt.timedelta(days=1)
NEAR_CRITICAL_DAYS = 5


class ScheduleCycleError(Exception):
    def __init__(self, names):
        self.names = names
        super().__init__("Dependency loop: " + " → ".join(names))


class WorkCalendar:
    def __init__(self, weekdays, holidays, extra_working, seven_day=False):
        self.weekdays = set(weekdays)
        self.holidays = holidays
        self.extra = extra_working
        self.seven_day = seven_day

    def is_working(self, d):
        if self.seven_day:
            return True
        if d in self.extra:
            return True
        if d in self.holidays:
            return False
        return d.weekday() in self.weekdays

    def next_working(self, d):
        for _ in range(3660):
            if self.is_working(d):
                return d
            d += ONE
        return d

    def prev_working(self, d):
        for _ in range(3660):
            if self.is_working(d):
                return d
            d -= ONE
        return d

    def add(self, d, n):
        """Move n working days from working day d (n may be negative)."""
        d = self.next_working(d) if n >= 0 else self.prev_working(d)
        step = ONE if n >= 0 else -ONE
        left = abs(n)
        while left:
            d += step
            if self.is_working(d):
                left -= 1
        return d

    def count(self, a, b):
        """Working days in [a, b] inclusive."""
        if not a or not b or b < a:
            return 0
        n, d = 0, a
        while d <= b:
            if self.is_working(d):
                n += 1
            d += ONE
        return n

    def diff(self, a, b):
        """Signed working days from a to b (0 when equal)."""
        if b >= a:
            return max(self.count(a, b) - 1, 0) if self.is_working(a) else self.count(a, b)
        return -(max(self.count(b, a) - 1, 0) if self.is_working(b) else self.count(b, a))


def project_calendars(project):
    cal = ProjectCalendar.objects.filter(project=project).first()
    weekdays = cal.working_weekdays if cal and cal.working_weekdays else [0, 1, 2, 3, 4, 5]
    holidays, extra = set(), set()
    for e in CalendarException.objects.filter(project__isnull=True):
        if not e.is_working:
            holidays.add(e.date)
    for e in CalendarException.objects.filter(project=project):
        if e.is_working:
            extra.add(e.date)
            holidays.discard(e.date)
        else:
            holidays.add(e.date)
    return {
        "project": WorkCalendar(weekdays, holidays, extra),
        "seven_day": WorkCalendar(range(7), set(), set(), seven_day=True),
        "weekdays": list(weekdays),
    }


def compute_schedule(project, status_date=None, baseline=None, near_days=NEAR_CRITICAL_DAYS):
    today = status_date or timezone.localdate()
    cals = project_calendars(project)
    tasks = list(project.tasks.all())
    by_id = {t.pk: t for t in tasks}
    children = defaultdict(list)
    for t in tasks:
        if t.parent_id and t.parent_id in by_id:
            children[t.parent_id].append(t.pk)

    def leaves_under(tid):
        if not children.get(tid):
            return [tid]
        out = []
        for c in children[tid]:
            out.extend(leaves_under(c))
        return out

    cal_of = lambda t: cals["seven_day"] if t.calendar_mode == "seven_day" else cals["project"]

    # ---- per-leaf durations & fixed dates
    info = {}
    for t in tasks:
        if children.get(t.pk):
            continue
        c = cal_of(t)
        pct = t.progress_pct or 0
        done = t.status == "completed" or pct >= 100 or bool(t.actual_end)
        started = bool(t.actual_start) or pct > 0
        ps, pe = t.estimated_start, t.estimated_end
        if pe and not ps:
            ps = pe
        if ps and not pe:
            pe = ps
        dur = 0 if t.is_milestone else (max(c.count(ps, pe), 1) if ps and pe else None)
        scheduled = dur is not None or (done and (t.actual_start or t.actual_end)) or started and t.actual_start
        info[t.pk] = dict(task=t, cal=c, pct=pct, done=done, started=started, ps=ps, pe=pe,
                          dur=dur if dur is not None else 1, scheduled=bool(scheduled))

    # ---- links between leaves
    links = []  # (pred_leaf, succ_leaf, type, lag, dep_id)
    for d in TaskDependency.objects.filter(successor__project=project, predecessor__project=project):
        if d.predecessor_id not in by_id or d.successor_id not in by_id:
            continue  # soft-deleted end
        for p in leaves_under(d.predecessor_id):
            for s in leaves_under(d.successor_id):
                if p != s and p in info and s in info and info[p]["scheduled"] and info[s]["scheduled"]:
                    links.append((p, s, d.type, d.lag_days, str(d.pk)))
    preds_of, succs_of = defaultdict(list), defaultdict(list)
    for l in links:
        preds_of[l[1]].append(l)
        succs_of[l[0]].append(l)

    # ---- topological order (Kahn); a loop is reported with names
    nodes = [k for k, v in info.items() if v["scheduled"]]
    indeg = {n: 0 for n in nodes}
    for l in links:
        indeg[l[1]] += 1
    q = deque(sorted([n for n in nodes if indeg[n] == 0], key=lambda n: (info[n]["ps"] or dt.date.max)))
    order = []
    while q:
        n = q.popleft()
        order.append(n)
        for l in succs_of[n]:
            indeg[l[1]] -= 1
            if indeg[l[1]] == 0:
                q.append(l[1])
    if len(order) != len(nodes):
        stuck = [n for n in nodes if n not in set(order)]
        names = [f"{by_id[n].wbs_code or ''} {by_id[n].name}".strip() for n in stuck[:6]]
        raise ScheduleCycleError(names)

    # ---- forward pass
    ES, EF, driving, rem_dur = {}, {}, {}, {}
    for n in order:
        i = info[n]
        t, c, dur = i["task"], i["cal"], i["dur"]
        if i["done"]:
            s = t.actual_start or i["ps"] or t.actual_end
            f = t.actual_end or i["pe"] or s
            ES[n], EF[n], driving[n], rem_dur[n] = s, max(f, s), [], 0
            continue
        if i["started"] and t.actual_start:
            s = t.actual_start
            remaining = math.ceil(dur * (100 - i["pct"]) / 100) if dur else 0
            rem_dur[n] = remaining
            anchor = c.next_working(max(today, s))
            f = c.add(anchor, remaining - 1) if remaining > 0 else max(anchor - ONE, s)
            ES[n], EF[n], driving[n] = s, max(f, s), []
            continue
        # not started
        rem_dur[n] = dur
        base = c.next_working(i["ps"]) if i["ps"] else c.next_working(today)
        why = [{"kind": "plan"}]
        if c.next_working(today) > base:
            base, why = c.next_working(today), [{"kind": "status_date"}]
        if t.constraint_type == "snet" and t.constraint_date and c.next_working(t.constraint_date) > base:
            base, why = c.next_working(t.constraint_date), [{"kind": "constraint"}]
        cands = []
        for (p, s_, typ, lag, did) in preds_of[n]:
            pe_, ps_ = EF[p], ES[p]
            if typ == "FS":
                es = c.add(c.next_working(pe_ + ONE), lag)
            elif typ == "SS":
                es = c.add(c.next_working(ps_), lag)
            elif typ == "FF":
                es = c.add(c.add(c.next_working(pe_), lag), -(max(dur, 1) - 1))
            else:  # SF
                es = c.add(c.add(c.next_working(ps_), lag), -(max(dur, 1) - 1))
            cands.append((es, p, did, typ, lag))
        es = base
        for cand in cands:
            if cand[0] > es:
                es = cand[0]
        if cands and es > base:
            why = [{"kind": "link", "task": str(p), "dependency": did, "type": typ, "lag": lag}
                   for (e, p, did, typ, lag) in cands if e == es]
        elif cands:
            # the plan and a link agree on the date: the link is the real driver
            links_eq = [{"kind": "link", "task": str(p), "dependency": did, "type": typ, "lag": lag}
                        for (e, p, did, typ, lag) in cands if e == es]
            why = links_eq + why if links_eq else why
        if t.constraint_type == "mso" and t.constraint_date:
            es, why = c.next_working(t.constraint_date), [{"kind": "constraint"}]
        ES[n] = es
        EF[n] = es if dur == 0 else c.add(es, dur - 1)
        driving[n] = why

    finish = max(EF.values()) if EF else None

    # ---- backward pass
    LS, LF = {}, {}
    for n in reversed(order):
        i = info[n]
        c, t = i["cal"], i["task"]
        d_rem = rem_dur.get(n, i["dur"])
        lf = c.prev_working(finish) if finish else EF[n]
        for (p, s, typ, lag, did) in succs_of[n]:
            # progress override: a successor that already started (or finished) is fixed by
            # its actual dates, so the link no longer constrains this one
            if info[s]["done"] or (info[s]["started"] and info[s]["task"].actual_start):
                continue
            if typ == "FS":
                cand = c.prev_working(c.add(c.next_working(LS[s]), -lag) - ONE)
            elif typ == "SS":
                cand = c.add(c.add(c.prev_working(LS[s]), -lag), max(d_rem, 1) - 1)
            elif typ == "FF":
                cand = c.add(c.prev_working(LF[s]), -lag)
            else:  # SF
                cand = c.add(c.add(c.prev_working(LF[s]), -lag), max(d_rem, 1) - 1)
            lf = min(lf, cand)
        if t.constraint_type == "fnlt" and t.constraint_date:
            lf = min(lf, c.prev_working(t.constraint_date))
        LF[n] = lf
        LS[n] = lf if d_rem <= 1 else c.add(lf, -(d_rem - 1))

    # ---- floats
    out = {}
    for n in order:
        i = info[n]
        c = i["cal"]
        tf = c.diff(EF[n], LF[n])
        # free float: how far this one can slip before any successor moves
        ff = None
        for (p, s, typ, lag, did) in succs_of[n]:
            if info[s]["done"] or (info[s]["started"] and info[s]["task"].actual_start):
                continue
            if typ == "FS":
                lim = c.prev_working(c.add(c.next_working(ES[s]), -lag) - ONE)
                slack = c.diff(EF[n], lim)
            elif typ == "SS":
                slack = c.diff(ES[n], c.add(ES[s], -lag))
            elif typ == "FF":
                slack = c.diff(EF[n], c.add(EF[s], -lag))
            else:
                slack = c.diff(ES[n], c.add(EF[s], -lag))
            ff = slack if ff is None else min(ff, slack)
        if ff is None:
            ff = tf
        ff = max(min(ff, tf), min(tf, 0))
        t = i["task"]
        viol = []
        if t.constraint_type == "fnlt" and t.constraint_date and EF[n] > t.constraint_date:
            viol.append("fnlt")
        if t.constraint_type == "mso" and t.constraint_date and any(
                e.get("kind") == "link" for e in driving[n]):
            viol.append("mso")
        out[str(n)] = {
            "es": ES[n], "ef": EF[n], "ls": LS[n], "lf": LF[n],
            "total_float": tf, "free_float": ff,
            "critical": (not i["done"]) and tf <= 0,
            "near_critical": (not i["done"]) and 0 < tf <= near_days,
            "done": i["done"], "remaining_days": rem_dur.get(n, 0), "duration": i["dur"],
            "driving": driving[n], "violations": viol,
            "plan_finish_variance": c.diff(i["pe"], EF[n]) if i["pe"] else None,
            "moved": (not i["done"] and not i["started"] and i["ps"] is not None and ES[n] != c.next_working(i["ps"])),
        }

    # ---- summaries roll up
    def roll(tid):
        if not children.get(tid):
            return out.get(str(tid))
        parts = [r for r in (roll(c) for c in children[tid]) if r]
        if not parts:
            return None
        r = {
            "es": min(p["es"] for p in parts), "ef": max(p["ef"] for p in parts),
            "ls": min(p["ls"] for p in parts), "lf": max(p["lf"] for p in parts),
            "total_float": min(p["total_float"] for p in parts),
            "free_float": min(p["free_float"] for p in parts),
            "critical": any(p["critical"] for p in parts),
            "near_critical": any(p["near_critical"] for p in parts),
            "done": all(p["done"] for p in parts), "summary": True, "driving": [], "violations": [],
            "moved": any(p.get("moved") for p in parts),
            "plan_finish_variance": max([p.get("plan_finish_variance") or 0 for p in parts] or [0]),
        }
        out[str(tid)] = r
        return r
    for t in tasks:
        if not t.parent_id:
            roll(t.pk)

    # ---- baseline variance
    if baseline is not None:
        items = {bi.task_id: bi for bi in baseline.items.all()}
        pc = cals["project"]
        for tid, r in out.items():
            bi = items.get(dt_uuid(tid))
            if bi and bi.end and r.get("ef"):
                r["baseline_start"], r["baseline_end"] = bi.start, bi.end
                r["finish_variance"] = pc.diff(bi.end, r["ef"])

    # ---- critical path (ordered) and project summary
    crit = [n for n in order if out[str(n)]["critical"]]
    crit.sort(key=lambda n: (ES[n], EF[n]))
    # compare the forecast with the positions' own planned finish (the contract deadline
    # on the project can be much later and would hide a slip); fall back to the deadline
    planned_end = max((i["pe"] for i in info.values() if i["pe"]), default=None) or project.estimated_end_date
    pc = cals["project"]
    unscheduled = [str(k) for k, v in info.items() if not v["scheduled"]]
    for k in unscheduled:
        out.setdefault(k, {"unscheduled": True})
    return {
        "status_date": today,
        "forecast_finish": finish,
        "planned_finish": planned_end,
        "deadline": project.estimated_end_date,
        "finish_variance": pc.diff(planned_end, finish) if planned_end and finish else None,
        "critical_path": [str(n) for n in crit],
        "unscheduled": unscheduled,
        "near_critical_days": near_days,
        "calendar": {"working_weekdays": cals["weekdays"],
                     "holidays": sorted(d.isoformat() for d in cals["project"].holidays)},
        "tasks": out,
    }


def dt_uuid(s):
    import uuid
    try:
        return uuid.UUID(str(s))
    except ValueError:
        return s


def validate_no_cycle(pred_id, succ_id):
    """Would adding pred -> succ create a loop? Returns the loop path (names) or None."""
    if pred_id == succ_id:
        return ["(self)"]
    graph = defaultdict(list)
    for d in TaskDependency.objects.all().values_list("predecessor_id", "successor_id"):
        graph[d[0]].append(d[1])
    # path from succ back to pred?
    stack, seen, parent = [succ_id], {succ_id}, {}
    while stack:
        n = stack.pop()
        if n == pred_id:
            path, cur = [n], n
            while cur in parent:
                cur = parent[cur]
                path.append(cur)
            names = {t.pk: f"{t.wbs_code or ''} {t.name}".strip() for t in Task.all_objects.filter(pk__in=path)}
            return [names.get(p, str(p)) for p in reversed(path)]
        for m in graph.get(n, []):
            if m not in seen:
                seen.add(m)
                parent[m] = n
                stack.append(m)
    return None
