# 08 — Project status (as of 11.10.2026)

Replaces the "status" lines in docs 03, 06 and 07. Those docs remain the record of what was planned and delivered at the time.
Checked against the code on `main` (`7ff8cdf`), not only against the earlier docs.

---

## 1. Delivered and on `main`

| Area | Delivered | Commit | Doc |
|---|---|---|---|
| Phase 0: UI foundation | Sidebar layout, MK/EN, `<MoneyInput>`, `<DateInput>`, toasts, confirm dialogs, CRM hidden behind `VITE_FEATURE_CRM` | `79d3ecb` | 06 |
| Phase 0: correctness | All pages fetched (R-01), inclusive durations (R-04), milestone flag (R-05), 0–100 % (R-10), `Europe/Skopje` (R-09), remediation without dates (R-07), cross-project/loop checks (R-08) | `79d3ecb` | 06 |
| Phase 0: security basics | DEBUG off by default, required `DJANGO_SECRET_KEY`, upload type and size limits (S-01, S-04) | `79d3ecb` | 06 |
| Excel import | Идадија workbook + PDFs, preview with problems, import new or into an existing project | `79d3ecb` + fixes | 06 |
| Budget & invoices | Invoice in its own currency, VAT split, approve, record payment, derived payment status per position | `79d3ecb` | 06 |
| Phase A: scheduling | FS/SS/FF/SF + lag, working calendar + MK holidays, constraints, CPM with actuals, float, driving path, baselines, reschedule with preview | `79d3ecb` | 07 |
| Fixes after Phase A | Supabase upload hangs, ASCII object keys, PDF upload errors tolerated, admin static files, 3D view fallback | `e6abedf`, `371034d`, `7ff8cdf` | none (recorded here) |

Backend tests: 11 in `backend/core/tests.py` (they include the full Идадија import and the CPM cases).

## 2. Process note

The roadmap (doc 03) said: one branch per phase, a PR, your review, then merge. In practice Phase 0 and Phase A went to `main` as **one commit** (`79d3ecb`), and the later fixes also went straight to `main`.
**From now on (proposed):** every piece of work goes on its own branch with a PR, starting with the security work in doc 09.

## 3. Open items

| ID | Item | Source | Priority | Planned in |
|---|---|---|---|---|
| S-02 | **Documents are in a public Supabase bucket.** Confirmed in `core/storage.py` (`SupabasePublicStorage` builds `/object/public/` URLs). Invoices and contracts can be opened by anyone with the link. | doc 01 | **P0** | doc 09, SEC-1 |
| SEC-2 | **Confirmed 11.10.2026:** all 29 tables in `public` had RLS off and the public `anon` role had SELECT **and INSERT** on every one, including `auth_user` and `authtoken_token`. **Live database locked on 11.10.2026** (SQL run in the dashboard); migration 0011 on branch `security/supabase` keeps it that way. | new | ✔ Done | doc 09, SEC-2 |
| S-03 / D-09 | Roles (Admin / Project manager / Site-Viewer). Any logged-in user can do everything, including deleting projects. | doc 01, 05 | P1 | doc 09, SEC-3 |
| R-03 | One source of truth for actual cost: `Task.actual_cost` removed (it was 0 everywhere in production); health, cost variance and the task report use the position's invoices. | doc 01 | ✔ PR `cleanup/layer-1` |
| A.4 | `Payment` records: several per invoice, each with date, method (bank / cash / compensation / other), reference and who entered it; the invoice's paid amount and date are derived. The 1 existing payment was migrated. | doc 05 D-06 | ✔ PR `cleanup/layer-1` |
| A.5 | Vendor colour/filter mode on the Gantt (the column and bar labels are done) | doc 03 | P2 | |
| — | Drag bars on the Gantt to reschedule | doc 06/07 | P2 | |
| Phase B | Resources, capacity, over-allocation across projects | doc 03 | P2 | |
| Phase C | Satellite toggle polish, **licence check for Esri imagery and Cesium ion** | doc 03 | P2 (licence check: P1) | |
| SEC-9 | Nightly encrypted backup (database + document files) as a GitHub Action; needs repository secrets. | doc 09 | ✔ PR `cleanup/layer-1` |
| — | **The GitHub repository is public**: code and docs (incl. real amounts and vendor names in doc 02) are readable by anyone. | new | P1, your decision |
| R-06 | CRM "Mark sold" marks every installment as paid (CRM is parked) | doc 01 | Parked | |

## 4. Documentation drift (to fix as we go)

- Doc 06 says "not committed yet". It is committed.
- Doc 04 recommends Inter and a light sidebar. What was delivered is IBM Plex Sans and a dark navy sidebar. **Delivered = current standard.** Doc 04 stays as the original brief.
- The README says "no roles yet". That is correct, but it is a security gap and is now planned (doc 09).
- Licence assumption (D-08): Cesium was kept because it is "not for commercial use". If United Build Group uses the app to run its own projects, that is likely **commercial use** under Cesium ion's and Esri's free terms. This needs a decision, see doc 09 §6.

## 5. Not verified in this review

- **Supabase (checked later on 11.10.2026):** organisation plan is **free**; bucket `documents` is **public**, 23 objects; 2 users (1 superuser, last created 20.08.2026), 2 tokens. The last 24 h of logs show no Data API (`/rest/v1`) calls from outside. Logs only go back one day on the free plan, so earlier access can be neither confirmed nor ruled out.
- **Tests:** `ImportTests.test_preview_and_commit` fails on `main` too: it expects the А01.1 date problem, which the current sample workbook no longer has. The local venv was missing `whitenoise`; `pip install -r requirements.txt` fixes that.
- **Railway:** whether migrations 0008 and 0009 have been applied, and which environment variables are set. I have no access, so you need to check.
- I did not run the tests or the build in this review (no code change was made).

## 6. Proposed order from here

1. Doc 09 security work: SEC-1 private bucket, SEC-2 Data API check, SEC-9 backups, then SEC-3 roles and the rest. Branch `security/*`.
2. Fix R-03 (one source of truth for actual cost) and A.4 `Payment` records.
3. Choose from the gaps in doc 10 (change orders, site diary, cash flow) before Phase B.
