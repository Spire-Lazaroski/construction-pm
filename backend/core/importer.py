"""Import a project from the team's Excel workbook (Гантограм + Фактури) and invoice PDFs.

Two steps, so nothing is written until the user has seen the problems:

    preview = parse_upload(xlsx_file, pdf_files)   # pure, no DB writes
    project = commit(preview, decisions, user, target_project=None)

Workbook shape (as used for Идадија):
  * a Gantt sheet whose header row has " ID" / "активност" / "Почеток" / "Крај" ...
    and each position on TWO rows: plan row (ID, dates, planned price, paid Yes/No)
    followed by the actual row (actual dates, realised %).
  * a "Фактури" sheet: date, number, contractor, position ID, ..., total with VAT,
    paid Yes/No, payment date, PDF path.
"""
import logging
import datetime as dt
import io
import re
from decimal import Decimal, InvalidOperation

from django.core.files.base import ContentFile
from django.db import transaction

from .models import Document, Expense, Project, Task, TaskAuditLog, Vendor
from .templates_data import GROUP_NAMES

CODE_RE = re.compile(r"\b([АБЦВГДABCDЕE]\d{2}(?:\.\d+)?)\b")
DATE_RE = re.compile(r"\b(\d{2})[./](\d{2})[./](\d{4})\b")

logger = logging.getLogger(__name__)


# ----------------------------------------------------------------------------- helpers

def _norm(s):
    return re.sub(r"\s+", " ", str(s or "")).strip()


def _parse_date(v):
    if v is None or v == "":
        return None
    if isinstance(v, dt.datetime):
        return v.date()
    if isinstance(v, dt.date):
        return v
    m = DATE_RE.search(str(v))
    if m:
        d, mo, y = map(int, m.groups())
        try:
            return dt.date(y, mo, d)
        except ValueError:
            return None
    return None


def _parse_money(v):
    """Accepts 12000, 12000.5, '12,000', '12.000,50', '143 500'."""
    if v is None or v == "":
        return None
    if isinstance(v, (int, float, Decimal)):
        return Decimal(str(v)).quantize(Decimal("0.01"))
    s = re.sub(r"[^\d,.\-]", "", str(v))
    if not s:
        return None
    if "," in s and "." in s:
        # whichever comes last is the decimal separator
        if s.rfind(",") > s.rfind("."):
            s = s.replace(".", "").replace(",", ".")
        else:
            s = s.replace(",", "")
    elif "," in s:
        head, _, tail = s.rpartition(",")
        s = s.replace(",", "") if len(tail) == 3 else head.replace(",", "") + "." + tail
    elif s.count(".") > 1 or (s.count(".") == 1 and len(s.rpartition(".")[2]) == 3):
        s = s.replace(".", "")
    try:
        return Decimal(s).quantize(Decimal("0.01"))
    except InvalidOperation:
        return None


def _iso(d):
    return d.isoformat() if d else None


def _money_str(d):
    return str(d) if d is not None else None


def _vendor_key(name):
    return _norm(name).lower()


# ----------------------------------------------------------------------------- PDF invoices

def parse_invoice_pdf(data, filename=""):
    """Best-effort extraction from a simple one-page invoice. Never raises."""
    out = {"filename": filename, "code": None, "date": None, "amount": None, "vendor": None,
           "description": None, "readable": False}
    m = CODE_RE.search(filename or "")
    if m:
        out["code"] = m.group(1)
    try:
        from pypdf import PdfReader
        text = "\n".join((p.extract_text() or "") for p in PdfReader(io.BytesIO(data)).pages)
    except Exception:
        return out
    lines = [_norm(l) for l in text.splitlines() if _norm(l)]
    if not lines:
        return out
    labels = ("ред", "бр.", "позиција", "дата", "цена со ддв", "фактура")
    dm = DATE_RE.search(text)
    if dm:
        out["date"] = _parse_date(dm.group(0))
    cm = CODE_RE.search(text)
    if cm:
        out["code"] = out["code"] or cm.group(1)
    # amount: largest money-looking token that is not part of a date or code
    cleaned = DATE_RE.sub(" ", text)
    cleaned = CODE_RE.sub(" ", cleaned)
    amounts = [_parse_money(t) for t in re.findall(r"\d{1,3}(?:[.,\s]\d{3})+(?:[.,]\d{2})?|\d{3,}", cleaned)]
    amounts = [a for a in amounts if a]
    if amounts:
        out["amount"] = max(amounts)
    # vendor: the line right before "Фактура", else the first line
    idx = next((i for i, l in enumerate(lines) if l.lower() == "фактура"), None)
    if idx is not None and idx > 0:
        out["vendor"] = lines[idx - 1]
    else:
        out["vendor"] = lines[0]
    # description: text on the code line after the code, else free lines
    desc = ""
    for l in lines:
        c = CODE_RE.search(l)
        if c:
            desc = _norm(l[c.end():])
            break
    if not desc:
        free = [l for l in lines
                if not any(l.lower().startswith(x) for x in labels)
                and not DATE_RE.fullmatch(l) and not CODE_RE.fullmatch(l)
                and _parse_money(l) is None and l != out["vendor"]]
        desc = " ".join(free)
    out["description"] = desc or None
    out["readable"] = bool(out["amount"] and out["date"])
    return out


# ----------------------------------------------------------------------------- workbook

def _find_gantt_sheet(wb):
    for ws in wb.worksheets:
        for row in ws.iter_rows(min_row=1, max_row=15, max_col=12):
            vals = [_norm(c.value).lower() for c in row]
            if "id" in vals and any(v.startswith("активност") for v in vals):
                return ws, row[0].row, vals
    return None, None, None


def _find_invoice_sheet(wb):
    for ws in wb.worksheets:
        head = [_norm(c.value).lower() for c in next(ws.iter_rows(min_row=1, max_row=1))]
        if any("фактур" in h for h in head) and any("позиција" in h for h in head):
            return ws, head
    return None, None


def _col(head, *needles):
    for i, h in enumerate(head):
        if all(n in h for n in needles):
            return i
    return None


def parse_workbook(file_obj):
    import openpyxl
    wb = openpyxl.load_workbook(file_obj, data_only=False)
    ws, hdr_row, head = _find_gantt_sheet(wb)
    if ws is None:
        raise ValueError("Could not find the Gantt sheet (a header row with ID / активност).")

    c_id = head.index("id")
    c_name = _col(head, "активност")
    c_start = _col(head, "почеток")
    c_end = _col(head, "крај")
    c_pct = _col(head, "реализирано")
    c_budget = _col(head, "проектирана")
    c_paid = _col(head, "платена")

    # project name / dates from the title block
    project = {"name": None, "start": None, "end": None}
    for row in ws.iter_rows(min_row=1, max_row=hdr_row - 1):
        for c in row:
            v = _norm(c.value)
            if v.lower().startswith("објект"):
                project["name"] = _norm(v[len("објект"):]) or None
    for row in ws.iter_rows(min_row=1, max_row=hdr_row - 1):
        for c in row:
            lab = _norm(c.value).lower()
            if lab in ("почеток", "крај"):
                above = ws.cell(row=c.row - 1, column=c.column).value
                project["start" if lab == "почеток" else "end"] = _iso(_parse_date(above))

    tasks = []
    r = hdr_row + 1
    max_r = ws.max_row
    while r <= max_r:
        code = _norm(ws.cell(row=r, column=c_id + 1).value)
        if code.upper().startswith("ВКУПНО"):
            break
        if code and CODE_RE.fullmatch(code):
            plan = [ws.cell(row=r, column=i + 1).value for i in range(len(head))]
            actual = [ws.cell(row=r + 1, column=i + 1).value for i in range(len(head))]
            pct_raw = actual[c_pct] if c_pct is not None else None
            try:
                pct = round(float(pct_raw) * 100) if pct_raw not in (None, "") and float(pct_raw) <= 1 else (
                    round(float(pct_raw)) if pct_raw not in (None, "") else None)
            except (TypeError, ValueError):
                pct = None
            tasks.append({
                "code": code,
                "parent_code": code.rsplit(".", 1)[0] if "." in code else None,
                "group": code[0],
                "name": _norm(plan[c_name]) or _norm(actual[c_name]) or code,
                "estimated_start": _iso(_parse_date(plan[c_start])),
                "estimated_end": _iso(_parse_date(plan[c_end])),
                "actual_start": _iso(_parse_date(actual[c_start])),
                "actual_end": _iso(_parse_date(actual[c_end])),
                "progress_pct": pct,
                "budget": _money_str(_parse_money(plan[c_budget])) if c_budget is not None else None,
                "interim_paid": _norm(plan[c_paid]).lower() in ("да", "yes") if c_paid is not None else False,
                "row": r,
            })
            r += 2
        else:
            r += 1

    invoices = []
    iws, ihead = _find_invoice_sheet(wb)
    if iws is not None:
        ci = {
            "date": _col(ihead, "датум на фактура"), "number": _col(ihead, "број"),
            "vendor": _col(ihead, "изведувач"), "code": _col(ihead, "позиција (id)"),
            "note": _col(ihead, "белешка"), "net": _col(ihead, "без ддв"),
            "gross": _col(ihead, "вкупно"), "paid": _col(ihead, "платено"),
            "paid_date": _col(ihead, "датум на плаќање"), "pdf": _col(ihead, "патека"),
        }
        for row in iws.iter_rows(min_row=2):
            get = lambda k: row[ci[k]].value if ci[k] is not None and ci[k] < len(row) else None
            code = _norm(get("code"))
            gross = _parse_money(get("gross")) if not str(get("gross") or "").startswith("=") else None
            net = _parse_money(get("net")) if not str(get("net") or "").startswith("=") else None
            if not code or (gross is None and net is None):
                continue
            invoices.append({
                "row": row[0].row, "code": code, "date": _iso(_parse_date(get("date"))),
                "number": _norm(get("number")), "vendor": _norm(get("vendor")) or None,
                "note": _norm(get("note")), "gross": _money_str(gross or (net * Decimal("1.18") if net else None)),
                "paid": _norm(get("paid")).lower() in ("да", "yes"),
                "paid_date": _iso(_parse_date(get("paid_date"))), "pdf": _norm(get("pdf")) or None,
            })
    return {"project": project, "tasks": tasks, "invoices": invoices}


# ----------------------------------------------------------------------------- preview

def build_preview(xlsx_file, pdf_files=()):
    wb = parse_workbook(xlsx_file)
    pdfs = {}
    for f in pdf_files:
        info = parse_invoice_pdf(f.read(), f.name)
        f.seek(0)
        if info["code"]:
            pdfs[info["code"]] = info

    problems = []

    def add(sev, where, msg, key, action, options, code=None, **params):
        # `code` + `params` let the UI show the message in Macedonian or English.
        problems.append({"severity": sev, "where": where, "message": msg, "key": key, "code": code,
                         "params": {k: str(v) for k, v in params.items()}, "action": action, "options": options})

    tasks = wb["tasks"]
    by_code = {t["code"]: t for t in tasks}
    for t in tasks:
        s, e = t["estimated_start"], t["estimated_end"]
        if s and e and e < s:
            fixed = None
            sd, ed = dt.date.fromisoformat(s), dt.date.fromisoformat(e)
            # common typo: day/month swapped or wrong month — suggest same-day end
            if ed.day == sd.day or ed.month == sd.day:
                fixed = s
            add("error", t["code"], f"End {ed:%d.%m.%Y} is before start {sd:%d.%m.%Y}.",
                f"dates:{t['code']}", "fix" if fixed else "clear",
                [{"value": "fix", "label": f"Set end = {sd:%d.%m.%Y}"}, {"value": "clear", "label": "Import without dates"}],
                code="end_before_start", end=f"{ed:%d.%m.%Y}", start=f"{sd:%d.%m.%Y}")
            t["suggested_end"] = fixed or s
        if t["parent_code"] and t["parent_code"] not in by_code:
            add("warning", t["code"], f"Parent {t['parent_code']} not found; imported under its group.",
                f"parent:{t['code']}", "keep", [{"value": "keep", "label": "OK"}], code="parent_missing", parent=t["parent_code"])
    undated = [t["code"] for t in tasks if not t["estimated_start"] and "." not in t["code"]]
    if undated:
        add("warning", f"{undated[0]}–{undated[-1]}" if len(undated) > 1 else undated[0],
            f"{len(undated)} positions have no dates.", "undated", "keep",
            [{"value": "keep", "label": "Import without schedule"}], code="undated", n=len(undated))

    # merge invoice rows with PDFs
    invoices = []
    for inv in wb["invoices"]:
        pdf = pdfs.get(inv["code"])
        merged = dict(inv)
        merged["pdf_file"] = pdf["filename"] if pdf else None
        if pdf:
            merged["vendor"] = merged["vendor"] or pdf["vendor"]
            merged["pdf_date"] = _iso(pdf["date"])
            merged["pdf_amount"] = _money_str(pdf["amount"])
            merged["pdf_description"] = pdf["description"]
        invoices.append(merged)
    sheet_codes = {i["code"] for i in invoices}
    for code, pdf in pdfs.items():
        if code not in sheet_codes:
            invoices.append({"row": None, "code": code, "date": _iso(pdf["date"]), "number": "", "vendor": pdf["vendor"],
                             "note": "", "gross": _money_str(pdf["amount"]), "paid": False, "paid_date": None,
                             "pdf": None, "pdf_file": pdf["filename"], "pdf_date": _iso(pdf["date"]),
                             "pdf_amount": _money_str(pdf["amount"]), "pdf_description": pdf["description"]})
            if not pdf["readable"]:
                add("error", code, f"Invoice PDF {pdf['filename']} has no readable amount or date.",
                    f"inv:{code}", "skip", [{"value": "skip", "label": "Skip this invoice"}], code="pdf_unreadable", file=pdf["filename"])

    date_mismatch = [i["code"] for i in invoices if i.get("pdf_date") and i.get("date") and i["pdf_date"] != i["date"]]
    if date_mismatch:
        add("warning", "Invoices", f"{len(date_mismatch)} sheet dates differ from the date on the PDF.",
            "invoice_dates", "pdf", [{"value": "pdf", "label": "Use the PDF date"}, {"value": "sheet", "label": "Use the sheet date"}],
            code="dates_differ", n=len(date_mismatch))
    amount_mismatch = [i["code"] for i in invoices if i.get("pdf_amount") and i.get("gross") and i["pdf_amount"] != i["gross"]]
    for c in amount_mismatch:
        add("warning", c, "Amount in the sheet differs from the PDF.", f"amount:{c}", "pdf",
            [{"value": "pdf", "label": "Use the PDF amount"}, {"value": "sheet", "label": "Use the sheet amount"}], code="amount_differs")
    for i in invoices:
        t = by_code.get(i["code"])
        if not t:
            add("warning", i["code"], "Invoice for a position that is not in the Gantt sheet.", f"orphan:{i['code']}", "keep",
                [{"value": "keep", "label": "Import without position"}, {"value": "skip", "label": "Skip"}], code="orphan_invoice")
            continue
        desc = (i.get("pdf_description") or "").lower()
        if desc:
            words = {w for w in re.findall(r"\w{4,}", t["name"].lower())}
            if words and not any(w[:5] in desc for w in words):
                add("warning", i["code"], f"Invoice text “{i['pdf_description']}” doesn't look like “{t['name']}”.",
                    f"desc:{i['code']}", "flag", [{"value": "flag", "label": "Import, mark for review"}, {"value": "keep", "label": "Import as is"}],
                    code="desc_mismatch", text=i["pdf_description"], name=t["name"])
    no_progress = [i["code"] for i in invoices if by_code.get(i["code"]) and not by_code[i["code"]]["progress_pct"]]
    if no_progress:
        add("warning", f"{no_progress[0]}–{no_progress[-1]}" if len(no_progress) > 1 else no_progress[0],
            f"{len(no_progress)} invoices are for positions with no reported progress.", "no_progress", "received",
            [{"value": "received", "label": "Import as Received (not approved)"}], code="no_progress", n=len(no_progress))

    vendors = {}
    for i in invoices:
        if i.get("vendor"):
            vendors.setdefault(_vendor_key(i["vendor"]), set()).add(i["vendor"])
    merged_v = [sorted(v) for v in vendors.values() if len(v) > 1]
    for names in merged_v:
        add("question", "Vendors", f"“{'” and “'.join(names)}” look like the same company.", f"vendor:{names[0]}", "merge",
            [{"value": "merge", "label": "Merge into one vendor"}], code="vendor_dupe", names="” / “".join(names))

    budget = sum((Decimal(t["budget"]) for t in tasks if t["budget"]), Decimal(0))
    return {
        "project": wb["project"],
        "groups": [{"code": g, "name": GROUP_NAMES.get(g, g)} for g in sorted({t["group"] for t in tasks}, key=lambda c: "АБЦВГД".find(c))],
        "tasks": tasks,
        "invoices": invoices,
        "problems": problems,
        "summary": {
            "positions": len(tasks), "sub_positions": sum(1 for t in tasks if t["parent_code"]),
            "invoices": len([i for i in invoices if i.get("gross")]), "pdfs": len(pdfs),
            "vendors": len(vendors), "budget": str(budget),
        },
    }


# ----------------------------------------------------------------------------- commit

def _upload_pdfs(pdf_by_name, wanted):
    """Upload the invoice PDFs to storage in parallel (Supabase is a network hop per file;
    one by one, 20 PDFs took most of the request time). Returns {original name: stored name}.
    A failed upload is logged and skipped: the invoice is still imported, without its PDF."""
    from concurrent.futures import ThreadPoolExecutor
    from django.core.files.storage import default_storage

    field = Document._meta.get_field("file")
    names = [n for n in dict.fromkeys(wanted) if n and n in pdf_by_name]

    def one(name):
        f = pdf_by_name[name]
        f.seek(0)
        data = f.read()
        try:
            return name, default_storage.save(field.generate_filename(None, name), ContentFile(data))
        except Exception:
            logger.exception("PDF upload failed for %s", name)
            return name, None

    if not names:
        return {}
    with ThreadPoolExecutor(max_workers=min(8, len(names))) as pool:
        return dict(pool.map(one, names))


@transaction.atomic
def commit(preview, decisions, user, pdf_files=(), target_project=None, project_fields=None):
    """Create (or update) a project from a preview. `decisions` maps problem key -> chosen action."""
    decisions = decisions or {}
    choice = lambda key, default: decisions.get(key, default)
    p = preview["project"]
    fields = project_fields or {}
    if target_project is None:
        project = Project.objects.create(
            name=fields.get("name") or p.get("name") or "Imported project",
            start_date=fields.get("start_date") or p.get("start"),
            estimated_end_date=fields.get("estimated_end_date") or p.get("end"),
            latitude=fields.get("latitude") or None, longitude=fields.get("longitude") or None,
            status="active",
        )
    else:
        project = target_project

    existing = {t.wbs_code: t for t in project.tasks.all() if t.wbs_code}
    order = project.tasks.count()
    audit = []  # written in one query at the end (each query is a network hop to Supabase)

    def upsert(code, **vals):
        nonlocal order
        t = existing.get(code)
        if t is None:
            order += 1
            t = Task.objects.create(project=project, wbs_code=code, order=order, **vals)
            audit.append(TaskAuditLog(project=project, task=t, task_name_snapshot=t.name, action="created",
                                      changed_by=user, changes={"source": ["", "excel import"]}))
            existing[code] = t
        else:
            for k, v in vals.items():
                setattr(t, k, v)
            t.save()
        return t

    for g in preview["groups"]:
        upsert(g["code"], name=g["name"], parent=None)

    for t in preview["tasks"]:
        start, end = t["estimated_start"], t["estimated_end"]
        if start and end and end < start:
            if choice(f"dates:{t['code']}", "fix") == "fix":
                end = t.get("suggested_end") or start
            else:
                start = end = None
        parent_code = t["parent_code"] if t["parent_code"] in existing or any(
            x["code"] == t["parent_code"] for x in preview["tasks"]) else t["group"]
        parent = existing.get(parent_code) or existing.get(t["group"])
        pct = t["progress_pct"] or 0
        status = "completed" if pct >= 100 else ("in_progress" if pct > 0 or t["actual_start"] else "not_started")
        a_start = t["actual_start"] if pct > 0 else None
        a_end = t["actual_end"] if pct >= 100 else None
        if a_start and a_end and a_end < a_start:
            # same typo usually sits on the actual row too (А01.1: 03.03 instead of 03.09)
            a_end = a_start if choice(f"dates:{t['code']}", "fix") == "fix" else None
        upsert(t["code"], name=t["name"], parent=parent,
               estimated_start=start, estimated_end=end,
               actual_start=a_start,
               actual_end=a_end,
               progress_pct=min(max(pct, 0), 100), status=status,
               estimated_cost=Decimal(t["budget"]) if t["budget"] else Decimal(0))

    # vendors
    vendor_cache = {v.name.lower(): v for v in Vendor.objects.all()}

    def vendor_for(name):
        if not name:
            return None
        key = _vendor_key(name)
        v = vendor_cache.get(key)
        if v is None:
            v = Vendor.objects.create(name=_norm(name))
            vendor_cache[key] = v
        return v

    pdf_by_name = {f.name: f for f in pdf_files}
    stored = _upload_pdfs(pdf_by_name, [inv.get("pdf_file") for inv in preview["invoices"]])
    date_pref = choice("invoice_dates", "pdf")
    for inv in preview["invoices"]:
        code = inv["code"]
        if choice(f"inv:{code}", "skip") == "skip" and not inv.get("gross"):
            continue
        if choice(f"orphan:{code}", "keep") == "skip":
            continue
        amount_src = choice(f"amount:{code}", "pdf")
        amount = inv.get("pdf_amount") if amount_src == "pdf" and inv.get("pdf_amount") else inv.get("gross")
        if not amount:
            continue
        date = inv.get("pdf_date") if date_pref == "pdf" and inv.get("pdf_date") else inv.get("date")
        date = date or inv.get("pdf_date") or project.start_date or dt.date.today().isoformat()
        task = existing.get(code)
        vendor = vendor_for(inv.get("vendor"))
        if task and vendor and not task.vendor_id:
            task.vendor = vendor
            task.save(update_fields=["vendor"])
        doc = None
        pdf_name = inv.get("pdf_file") or ""
        if stored.get(pdf_name):
            doc = Document.objects.create(project=project, task=task, vendor=vendor, doc_type="invoice",
                                          title=pdf_name, notes="Imported from Excel", file=stored[pdf_name])
        note = inv.get("pdf_description") or inv.get("note") or ""
        flagged = choice(f"desc:{code}", "flag") == "flag" and f"desc:{code}" in {p["key"] for p in preview["problems"]}
        exp = Expense.objects.create(
            project=project, task=task, vendor=vendor, entry_type="actual",
            description=(("[проверка] " if flagged else "") + (note or (task.name if task else code)))[:255],
            amount=Decimal(amount), currency="EUR", original_amount=Decimal(amount),
            invoice_number=inv.get("number") or "", date=date, document=doc,
            approval_status="received",
            amount_paid=Decimal(amount) if inv.get("paid") else Decimal(0),
            paid_date=inv.get("paid_date") if inv.get("paid") else None,
        )
        # Interim payment marked "Да" in the Gantt sheet → treat that position's invoice as paid.
        tsrc = next((t for t in preview["tasks"] if t["code"] == code), None)
        if tsrc and tsrc.get("interim_paid") and exp.amount_paid == 0:
            exp.amount_paid = exp.amount
            exp.paid_date = exp.date
            exp.approval_status = "approved"
            exp.save(update_fields=["amount_paid", "paid_date", "approval_status"])

    # project budget = sum of leaf budgets if not given
    if not project.total_budget:
        project.total_budget = sum((Decimal(t["budget"]) for t in preview["tasks"] if t["budget"]), Decimal(0))
        project.save(update_fields=["total_budget"])
    TaskAuditLog.objects.bulk_create(audit)
    return project
