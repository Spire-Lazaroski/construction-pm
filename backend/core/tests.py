import datetime as dt
import io
import os
from decimal import Decimal

from django.contrib.auth.models import User
from django.core.files.uploadedfile import SimpleUploadedFile
from django.test import TestCase, override_settings
from rest_framework.test import APIClient

from .importer import _parse_money, parse_invoice_pdf
from .models import Expense, Project, Task, Vendor

SAMPLE_DIR = os.environ.get("SAMPLE_DIR")


class MoneyParsingTests(TestCase):
    def test_formats(self):
        self.assertEqual(_parse_money("12,000"), Decimal("12000.00"))
        self.assertEqual(_parse_money("143.500,50"), Decimal("143500.50"))
        self.assertEqual(_parse_money("143,500.50"), Decimal("143500.50"))
        self.assertEqual(_parse_money("1.168.500"), Decimal("1168500.00"))
        self.assertEqual(_parse_money(8500), Decimal("8500.00"))
        self.assertEqual(_parse_money("12,5"), Decimal("12.50"))
        self.assertIsNone(_parse_money(""))


@override_settings(MEDIA_ROOT="/tmp/cpm-test-media")
class ApiTests(TestCase):
    def setUp(self):
        self.user = User.objects.create_user("pm", password="x")
        self.c = APIClient()
        self.c.force_authenticate(self.user)

    def _project(self, **kw):
        r = self.c.post("/api/projects/", {"name": "Test", **kw}, format="json")
        self.assertEqual(r.status_code, 201, r.content)
        return r.json()

    def test_template_structure(self):
        p = self._project(structure="template")
        tasks = self.c.get("/api/tasks/", {"project": p["id"], "page_size": 500}).json()["results"]
        self.assertEqual(len(tasks), 3 + 7 + 30 + 7)
        groups = [t for t in tasks if t["parent"] is None]
        self.assertEqual([g["wbs_code"] for g in groups], ["А", "Б", "Ц"])
        self.assertTrue(all(t["estimated_start"] is None for t in tasks))

    def test_own_costs_and_soft_delete_restore(self):
        p = self._project()
        parent = self.c.post("/api/tasks/", {"project": p["id"], "name": "Group", "estimated_cost": "999"}, format="json").json()
        a = self.c.post("/api/tasks/", {"project": p["id"], "parent": parent["id"], "name": "A", "estimated_cost": "100"}, format="json").json()
        self.c.post("/api/tasks/", {"project": p["id"], "parent": a["id"], "name": "A.1", "estimated_cost": "40"}, format="json")
        self.c.post("/api/tasks/", {"project": p["id"], "parent": parent["id"], "name": "B", "estimated_cost": "60"}, format="json")
        totals = self.c.get(f"/api/projects/{p['id']}/analytics/").json()["totals"]
        # own amounts: Group 999 + A 100 + A.1 40 + B 60 (a parent's figure is its own, like the Excel)
        self.assertEqual(Decimal(str(totals["projected_cost"])), Decimal("1199"))

        r = self.c.delete(f"/api/tasks/{a['id']}/")
        self.assertEqual(r.status_code, 204)
        names = [t["name"] for t in self.c.get("/api/tasks/", {"project": p["id"]}).json()["results"]]
        self.assertEqual(sorted(names), ["B", "Group"])
        self.c.post(f"/api/tasks/{a['id']}/restore/")
        names = [t["name"] for t in self.c.get("/api/tasks/", {"project": p["id"]}).json()["results"]]
        self.assertEqual(sorted(names), ["A", "A.1", "B", "Group"])

    def test_validation(self):
        p = self._project()
        r = self.c.post("/api/tasks/", {"project": p["id"], "name": "X", "estimated_start": "2026-09-03",
                                        "estimated_end": "2026-03-03"}, format="json")
        self.assertEqual(r.status_code, 400)
        t = self.c.post("/api/tasks/", {"project": p["id"], "name": "X"}, format="json").json()
        r = self.c.patch(f"/api/tasks/{t['id']}/", {"parent": t["id"]}, format="json")
        self.assertEqual(r.status_code, 400)
        r = self.c.patch(f"/api/tasks/{t['id']}/", {"progress_pct": 140}, format="json")
        self.assertEqual(r.status_code, 400)

    def test_duplicate(self):
        p = self._project()
        t = self.c.post("/api/tasks/", {"project": p["id"], "name": "X", "estimated_cost": "10"}, format="json").json()
        d = self.c.post(f"/api/tasks/{t['id']}/duplicate/").json()
        self.assertEqual(d["name"], "X (копија)")

    def test_page_size(self):
        p = self._project(structure="template")
        r = self.c.get("/api/tasks/", {"project": p["id"], "page_size": 1000}).json()
        self.assertIsNone(r["next"])


@override_settings(MEDIA_ROOT="/tmp/cpm-test-media")
class ImportTests(TestCase):
    """Runs against the real Идадија sample when SAMPLE_DIR points at it."""

    def setUp(self):
        if not SAMPLE_DIR:
            self.skipTest("SAMPLE_DIR not set")
        self.user = User.objects.create_user("pm", password="x")
        self.c = APIClient()
        self.c.force_authenticate(self.user)

    def _files(self):
        files = {}
        xlsx = [f for f in os.listdir(SAMPLE_DIR) if f.endswith(".xlsx")][0]
        with open(os.path.join(SAMPLE_DIR, xlsx), "rb") as fh:
            files["file"] = SimpleUploadedFile(xlsx, fh.read())
        pdfs = []
        for f in sorted(os.listdir(SAMPLE_DIR)):
            if f.endswith(".pdf"):
                with open(os.path.join(SAMPLE_DIR, f), "rb") as fh:
                    pdfs.append(SimpleUploadedFile(f, fh.read(), content_type="application/pdf"))
        files["pdfs"] = pdfs
        return files

    def test_preview_and_commit(self):
        r = self.c.post("/api/projects/import_preview/", self._files(), format="multipart")
        self.assertEqual(r.status_code, 200, r.content[:500])
        pv = r.json()
        self.assertEqual(pv["summary"]["positions"], 48)
        self.assertEqual(Decimal(pv["summary"]["budget"]), Decimal("1168500"))
        keys = {p["key"] for p in pv["problems"]}
        self.assertIn("dates:А01.1", keys)
        self.assertIn("inv:Б04", keys)
        self.assertIn("desc:Б03", keys)

        files = self._files()
        files["project_fields"] = '{"latitude": "41.350496", "longitude": "21.564121"}'
        r = self.c.post("/api/projects/import_commit/", files, format="multipart")
        self.assertEqual(r.status_code, 201, r.content[:500])
        p = Project.objects.get()
        self.assertEqual(p.name, "Идадија")
        self.assertEqual(str(p.latitude), "41.350496")
        self.assertEqual(p.tasks.count(), 3 + 48)
        a011 = p.tasks.get(wbs_code="А01.1")
        self.assertEqual(a011.estimated_end, dt.date(2026, 9, 3))
        self.assertEqual(a011.parent.wbs_code, "А01")
        invoiced = sum(e.amount for e in Expense.objects.filter(project=p))
        self.assertEqual(invoiced, Decimal("696550"))
        self.assertEqual(sum(1 for v in Vendor.objects.all() if v.name.lower() == "мива градба"), 1)
        self.assertEqual(p.tasks.get(wbs_code="А04").vendor.name.lower(), "мива градба")
        paid = sum(e.amount_paid for e in Expense.objects.filter(project=p))
        self.assertEqual(paid, Decimal("12000"))
        totals = self.c.get(f"/api/projects/{p.id}/analytics/").json()["totals"]
        self.assertEqual(Decimal(str(totals["projected_cost"])), Decimal("1168500"))


@override_settings(MEDIA_ROOT="/tmp/cpm-test-media")
class SchedulingTests(TestCase):
    """Critical path on the Mon–Sat calendar with MK holidays (08.09.2026 is a holiday)."""

    def setUp(self):
        self.user = User.objects.create_user("pm", password="x")
        self.c = APIClient()
        self.c.force_authenticate(self.user)
        self.p = self.c.post("/api/projects/", {"name": "CPM"}, format="json").json()

    def task(self, name, start, end, deps=None, **kw):
        body = {"project": self.p["id"], "name": name, "estimated_start": start, "estimated_end": end, **kw}
        if deps:
            body["dependency_specs"] = deps
        r = self.c.post("/api/tasks/", body, format="json")
        self.assertEqual(r.status_code, 201, r.content)
        return r.json()

    def sched(self, status_date):
        r = self.c.get(f"/api/projects/{self.p['id']}/schedule/", {"status_date": status_date})
        self.assertEqual(r.status_code, 200, r.content)
        return r.json()

    def test_chain_float_holidays_and_slip(self):
        t1 = self.task("T1", "2026-09-01", "2026-09-04")                                   # Tue–Fri, 4 d
        t2 = self.task("T2", "2026-09-05", "2026-09-09", [{"predecessor": t1["id"], "type": "FS"}])  # Sat, Mon, (Tue holiday), Wed
        t3 = self.task("T3", "2026-09-01", "2026-09-02")                                   # parallel, 2 d
        t5 = self.task("T5", "2026-09-01", "2026-09-01", [{"predecessor": t1["id"], "type": "SS", "lag_days": 2}])
        s = self.sched("2026-08-31")
        r = s["tasks"]
        self.assertEqual(r[t2["id"]]["es"], "2026-09-05")
        self.assertEqual(r[t2["id"]]["ef"], "2026-09-09")          # skips Sunday + 08.09 holiday
        self.assertTrue(r[t1["id"]]["critical"] and r[t2["id"]]["critical"])
        self.assertEqual(r[t3["id"]]["total_float"], 5)            # 3,4,5,7,9 September
        self.assertTrue(r[t3["id"]]["near_critical"])
        self.assertEqual(r[t5["id"]]["es"], "2026-09-03")          # SS + 2 working days
        self.assertEqual(s["critical_path"], [t1["id"], t2["id"]])
        self.assertEqual(r[t2["id"]]["driving"][0]["task"], t1["id"])

        # Nothing started by 10.09 -> T1 can't start before the status date; T2 is pushed.
        s = self.sched("2026-09-10")
        r = s["tasks"]
        self.assertEqual(r[t1["id"]]["es"], "2026-09-10")
        self.assertEqual(r[t1["id"]]["ef"], "2026-09-14")
        self.assertEqual(r[t2["id"]]["ef"], "2026-09-17")
        self.assertEqual(s["forecast_finish"], "2026-09-17")
        self.assertEqual(s["finish_variance"], 7)

        # Preview + apply reschedule
        prev = self.c.post(f"/api/projects/{self.p['id']}/reschedule/?status_date=2026-09-10", {"apply": False}, format="json").json()
        self.assertTrue(any(c["task"] == t2["id"] for c in prev["changes"]))
        self.c.post(f"/api/projects/{self.p['id']}/reschedule/?status_date=2026-09-10", {"apply": True}, format="json")
        self.assertEqual(Task.objects.get(pk=t2["id"]).estimated_end, dt.date(2026, 9, 17))

    def test_actuals_ff_and_constraint(self):
        a = self.task("A", "2026-09-01", "2026-09-10", actual_start="2026-09-01", progress_pct=50, status="in_progress")
        b = self.task("B", "2026-09-02", "2026-09-03", [{"predecessor": a["id"], "type": "FF", "lag_days": 1}])
        c = self.task("C", "2026-09-01", "2026-09-02", constraint_type="fnlt", constraint_date="2026-09-01")
        r = self.sched("2026-09-05")["tasks"]
        # A: 8 working days (Sunday 06.09 and holiday 08.09 off), 50 % -> 4 left from 05.09 -> 05,07,09,10
        self.assertEqual(r[a["id"]]["ef"], "2026-09-10")
        self.assertEqual(r[b["id"]]["ef"], "2026-09-11")           # FF + 1
        self.assertLess(r[c["id"]]["total_float"], 0)              # can't meet "finish no later than"
        self.assertIn("fnlt", r[c["id"]]["violations"])

    def test_loop_rejected_and_baseline(self):
        a = self.task("A", "2026-09-01", "2026-09-02")
        b = self.task("B", "2026-09-03", "2026-09-04", [{"predecessor": a["id"]}])
        r = self.c.patch(f"/api/tasks/{a['id']}/", {"dependency_specs": [{"predecessor": b["id"]}]}, format="json")
        self.assertEqual(r.status_code, 400)
        self.assertIn("loop", str(r.content))
        bl = self.c.post(f"/api/projects/{self.p['id']}/baselines/", {"name": "План"}, format="json")
        self.assertEqual(bl.status_code, 201)
        self.c.patch(f"/api/tasks/{b['id']}/", {"estimated_start": "2026-09-05", "estimated_end": "2026-09-09"}, format="json")
        r = self.sched("2026-08-31")["tasks"]
        self.assertEqual(r[b["id"]]["baseline_end"], "2026-09-04")
        self.assertEqual(r[b["id"]]["finish_variance"], 3)          # 04 -> 05, 07, 09

    def test_calendar_endpoint(self):
        cal = self.c.get(f"/api/projects/{self.p['id']}/calendar/").json()
        self.assertEqual(cal["working_weekdays"], [0, 1, 2, 3, 4, 5])
        self.assertTrue(any(e["date"] == "2026-09-08" and e["national"] for e in cal["exceptions"]))
        r = self.c.post("/api/calendar-exceptions/", {"project": self.p["id"], "date": "2026-09-07", "name": "Зимска пауза"}, format="json")
        self.assertEqual(r.status_code, 201)
        t = self.task("T", "2026-09-05", "2026-09-09")
        r = self.sched("2026-08-31")["tasks"]
        self.assertEqual(r[t["id"]]["duration"], 2)                 # Sat 05 + Wed 09 (07 off, 08 holiday)
