# 06 — Phase 0 delivery (+ items pulled forward): what changed and how to test

Branch to create: `phase-0/ui-foundation`. The changes are in the working copy and **not committed yet**. Review them, then commit.

## 1. What you can do now

| Area | What's new |
|---|---|
| **Look** | New layout: dark-navy sidebar with your logo, project switcher, top bar with breadcrumb, EUR/MKD and МК/EN switches. Restrained palette, IBM Plex Sans, no monospace or "HUD" labels, lucide icons instead of emoji, toasts instead of `alert()`, custom confirm dialogs. The login page is redesigned. |
| **Language** | Macedonian (default) and English on every new screen. The switch is remembered per browser. |
| **Amounts** | `<MoneyInput>` in every money field. It groups thousands as you type (`1435000` → `1.435.000`), uses a comma for decimals, and the numeric-keypad `.` types the comma. Paste accepts `143.500,00`, `143,500.00`, `€ 143 500`, `150k`. |
| **Dates** | `<DateInput>` always shows `dd.mm.yyyy`, whatever the browser language. You can type `01092026` (the dots are added for you) or paste `2026-09-01`. The calendar button opens the browser's date picker. |
| **Schedule (Gantt)** | Tree of groups, positions and sub-positions with a collapse arrow on every parent. **Level 1/2/All** buttons for big projects. Day/Week/Month zoom. Comfortable/Compact density. Filters: all, in progress, late, undated. Search. Vendor column plus vendor name on each bar. Week numbers (Н1 = the project's start week). Today line. Sundays shaded. Baseline (plan) shown under the actual bar. Dependency arrows. Your collapse, zoom and density choices are remembered. |
| **Fix mistakes** | The **⋯** menu on every row offers Edit, Progress & documents, Add sub-position, Add position in the same group, Duplicate and Delete. Delete asks for confirmation and then shows an **Undo** (soft delete, restorable). The editor suggests the next code (Б31, А05.2…), checks that the end date is not before the start, and warns about loops. |
| **New project in the app** | *Нов проект* has details, investor, type, dates, budget, location, and a choice of structure: empty, residential template (А/Б/Ц with 44 positions), copy an existing project, or Excel. |
| **Location** | Paste `41.350496, 21.564121` from Google Maps or click the map. Street/Satellite toggle (with place-name labels on satellite), remembered per browser. |
| **Excel import** | Its own tool in the sidebar. Upload the workbook plus the PDFs → review the problems (each has a chosen action) → import as a new project **or into an existing one** (positions matched by code). |
| **Budget & invoices** | Positions table (budget, invoiced, difference, % done, payment status derived from the invoices) and invoices table (date, number, vendor, position, amount, paid, status, PDF). **New invoice** is entered in its own currency (EUR/MKD) with VAT split, a PDF upload, and warnings for over budget or ahead of the work. **Approve** and **Record payment** (partial payments supported). |
| **Project overview** | KPIs, a *work done vs. invoiced vs. time* check, budget by group, a "needs attention" list, and the map. |
| **Settings** | Edit the project (all fields and location), vendors list, delete project. |
| **CRM** | Hidden (`VITE_FEATURE_CRM=1` brings it back). Nothing is deleted. |

## 2. Backend changes

- **Migration `0008`**, additive and safe on existing data:
  - Task: `wbs_code`, `is_milestone`, `vendor`, `deleted_at` (soft delete). Planned dates can now be empty. `progress_pct` is limited to 0–100.
  - Expense: `invoice_number`, `currency`, `original_amount`, `vat_rate`, `approval_status`, `document`.
  - Project: `investor`, `building_type`.
- New endpoints:
  - `POST /api/projects/` accepts `structure` (`empty`/`template`/`copy`) and `copy_from`.
  - `POST /api/projects/import_preview/` and `/import_commit/` (multipart: `file`, `pdfs[]`, `decisions`, `project` or `project_fields`).
  - `POST /api/tasks/{id}/restore/` and `/duplicate/`.
  - `?page_size=` up to 2000.
- Validation: end date not before start (planned and actual), parent must be in the same project, no loops, no self-dependency, no cross-project dependencies.
- Correctness: time zone `Europe/Skopje`, "today" is local, lists are no longer cut off at 100 rows, and remediation tasks without dates no longer crash.
- Security: DEBUG is off by default, the app refuses to start without `DJANGO_SECRET_KEY`, and uploads are limited to allowed file types and 25 MB.
- `pypdf` and `openpyxl` were added to `requirements.txt`.
- Tests are in `backend/core/tests.py` (7), including a full import of the Идадија sample: 48 positions, 1.168.500 € budget, 696.550 € invoiced, 12.000 € paid, А01.1 date fixed, МИВА/Мива merged.

### Cost rule — correction to doc 01 (R-02)

The sample showed that the Excel adds **the parent's own amount plus its sub-positions**: А01 = 12.000, А01.1 = 3.000, total 15.000. The app now follows the same rule. Each position's budget is its *own* amount, and parents show own + children as a computed total. Groups (А/Б/Ц) carry 0 of their own. Totals match the Excel (1.168.500 €).

## 3. Before you deploy (Railway)

1. Set **`DJANGO_SECRET_KEY`** on Railway. Without it the backend will not start, which is intentional.
2. Check that `DJANGO_DEBUG` is **not** `1` in production.
3. If you use a custom domain, add it to `DJANGO_ALLOWED_HOSTS`. The default already covers `*.railway.app`.
4. After the deploy, run `python manage.py migrate` (migration 0008).
5. Vercel: nothing is required. Optionally set `VITE_CESIUM_ION_TOKEN` for 3D.

## 4. How to test (about 10 minutes)

1. Log in → *Увоз од Excel* → drop `Гантограм_Идадија_со_фактури (posledna).xlsx` and all 21 PDFs → *Провери датотеки*. You should see 48 positions, 20 invoices, 1.168.500 €, and 8 problems.
2. Enter the coordinates `41.350496, 21.564121` → *Увези*. You land on the Schedule.
3. In the Schedule:
   - Click *Групи* → *Позиции* → *Сè*.
   - Collapse А.
   - On А05, open **⋯** → *Додај подпозиција*. Type `1435000` into Budget and watch the dots appear. Save.
   - Delete the new row → *Врати*.
4. Open *Буџет и фактури* → *Нова фактура* → pick А07, switch to MKD, type `184500`. The EUR equivalent and a red "over budget" warning should appear.
5. Click МК/EN in the top bar.
6. Create *Нов проект* → template → check the Schedule shows 44 undated positions.

## 5. Not in this delivery (next phases)

- Dependency types SS/FF/SF with lag, working calendar with holidays, and the **critical path**, float and baselines. This is Phase A. Today the arrows are finish→start and durations count Mon–Sat.
- Separate `Payment` records per payment. Today "Record payment" adds to `amount_paid` with the last payment date.
- Roles (Admin / Project manager / Site-Viewer) and a private document bucket (S-02, S-03).
- Resource capacity and over-allocation (Phase B). The vendor lane is already shown.
- Drag-to-reschedule bars on the Gantt.
