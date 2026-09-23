# 03 — Roadmap: Phase 0 → A → B → C

> Updated 23.09.2026 with the answers in doc 05. Changes: CRM hidden, MK/EN UI, working calendars, invoice currency + payment flow, comprehensive CPM, vendor lane on the Gantt, 3 roles after Phase A.

Focus: the building/task/schedule core. The CRM, to-do and notification layer stays exactly as it is: usable, but not where this round of effort goes.

Size: **S** ≈ ½–1 day · **M** ≈ 2–3 days · **L** ≈ 4–6 days (rough, for comparison between items).
Every phase goes on its own branch and ends in a PR you review before it merges. **No commits before you approve.**

---

## Phase 0 — Foundation: fixes + professional UI + amount entry

Why first: Phase A adds more tables, numbers and Gantt detail. Building those on the current styling and the `alert()` error handling would mean doing the UI work twice.

| # | Item | Size | Covers |
|---|---|---|---|
| 0.1 | **Amount input with separators** (`<MoneyInput>`), used in all ~20 money fields. Spec in doc 04 §4. | M | F-02, F-03 |
| 0.2 | Single formatting module: money, dates `dd.MM.yyyy`, percentages. Drop the second formatter. | S | F-04, F-08 |
| 0.3 | **Visual redesign** per doc 04: sidebar layout, restrained palette, labeled forms, lucide icons, toasts in place of `alert()`, custom confirm dialog. | L | F-01, F-07, F-09 |
| 0.4 | Correctness: fetch all pages (R-01); inclusive durations + local dates on the Gantt (R-04); explicit milestone flag (R-05); 0–100 validation (R-10); `Europe/Skopje` time zone (R-09). | M | R-01, 04, 05, 09, 10 |
| 0.5 | Security: safe defaults (DEBUG off, required secret key); upload type and size limits. | S | S-01, S-04 |
| 0.7 | **MK/EN language switch** (react-i18next); Macedonian labels for every screen. | M | D-03 |
| 0.8 | **Hide the CRM layer** (Operations/Sales) behind a feature flag. | S | D-10 |
| 0.6 | Housekeeping: delete `SalesPage.jsx`, the `backend/cd` file and the `.idea` folders; lazy-load Cesium (stays enabled, D-08). | S | F-05, F-06, S-05 |

**Done when:** no raw `alert()` anywhere; every amount field shows `143.500,00` while you type; the Gantt draws 01.09 → 04.09 as 4 days; Lighthouse initial JS drops noticeably (Cesium no longer loaded up front).

**Deferred to a separate security PR (needs your go-ahead):** private document bucket with signed URLs (S-02) and user roles (S-03). Both touch deployment config on Railway and Supabase.

---

## Phase A — Scheduling core

> **Status 23.09.2026:** A.1–A.5 delivered (see doc 07). Open: separate `Payment` records for partial payments (A.4), vendor colour/filter mode (A.5), roles (A.6).

### A.1 WBS nesting (phases → tasks → sub-tasks)
- Add `Task.wbs_code` (e.g. `А01`, `А01.1`) and `Task.is_milestone`. `parent` already exists.
- **Summary tasks are computed, never typed in.** Start = earliest child start, end = latest child end, planned cost = sum of children, actual cost = sum of children, progress = cost-weighted average of children.
- Server rule: a task that has children cannot carry its own cost. This fixes R-02 (double counting).
- Gantt: a tree with expand/collapse, indent by level, and summary bars drawn as brackets. Expand/collapse state is remembered per user in the browser.
- Setup: "Add sub-task" on any row; move a task under another parent.
- **Size: L**

### A.2 Real dependency types
- Replace the plain M2M `predecessors` with a `TaskDependency` table: `predecessor`, `successor`, `type` ∈ **FS / SS / FF / SF**, `lag_days` (can be negative = lead).
- A data migration turns every existing link into FS with lag 0, so nothing is lost.
- Validation: same project, no self-link, **no cycles** (checked when saving, with an error that names the loop).
- Gantt arrows attach to the right end for each type (FS end→start, SS start→start, FF end→end, SF start→end), and the tooltip shows the type and lag.
- Dependency editor in the task panel: pick a predecessor, a type and a lag.
- **Size: M**

### A.3 Critical path (CPM)
- Backend service `scheduling.py`: forward and backward pass over the leaf tasks, honouring all four dependency types and lags, **using the working calendar from decision D-02**.
- Output per task: early/late start and finish, **total float** and **free float**, `is_critical`.
- Actuals count: a task that has started uses its actual start, and a finished task uses its actual end. The critical path therefore reflects reality. The А03 piles slip of +5 days would push А04 and show whether the finish date moves.
- Endpoint `GET /projects/{id}/schedule/`, computed on request (48–200 tasks is instant, so nothing is cached).
- Gantt: critical bars and arrows highlighted, a "Critical path only" filter, float shown in the tooltip, and a projected finish date compared with the planned one in the header.
- **Analysis only in A.3:** it **shows** the impact and never moves your dates on its own. An optional "Reschedule successors" action (preview → confirm) comes as A.5 if you want it.
- **Extended per D-11:** constraints (start no earlier than / finish no later than / must start on), near-critical band, driving-path trace, **baselines** (snapshot + variance) and **reschedule with preview**. A.5 is merged into this.
- **Working calendars (D-02):** per-project Mon–Sat + MK holidays, exceptions, and a 7-day calendar override per task.
- **Size: L + M** (calendar and baselines)

### A.4 Invoice model + Excel import
- `Expense` gains `invoice_number`, `net_amount`, `vat_rate` (default 18%), `gross_amount`, **`currency` + `amount_eur`** (D-04) and a link to the PDF `Document`.
- **Payment flow (D-06):** Received → Approved → Due → Paid, with a `Payment` table for partial payments. Position payment status is derived. Overbilling warnings.
- Import wizard for the Идадија workbook format: upload .xlsx (+ PDFs) → preview table with the validation problems (doc 02 §3) → confirm. Creates the А/Б/Ц summary tasks, positions, sub-positions, vendors and invoices, and matches `ф-ра <ID>.pdf`.
- **Size: M–L**

### A.5 Gantt: vendor lane
- Vendor column in the task tree, vendor name on or next to each bar, and a vendor filter/colour mode. (This depends on B's `TaskAssignment`; until then it uses the invoice/contract vendor.)
- **Size: S**

### A.6 Roles (D-09)
- Admin / Project manager / Site-Viewer, enforced in the API and reflected in the UI.
- **Size: M**

**Phase A done when:** Идадија imported from your workbook; tree Gantt with А/Б/Ц collapsible; FS/SS/FF/SF with lag working; critical path highlighted and explained by float; totals match the Excel (1.168.500 budget).

---

## Phase B — Resource management

- `Vendor.capacity` (crews or workers available per day; default 1 crew) plus an optional unavailability calendar.
- `TaskAssignment(task, vendor, units, note)`: several vendors per task, `units` = crews or people.
- **Allocation calculation across all projects** (the same contractor, e.g. Мива градба, can be on two sites at once): load per day/week = sum of assigned units on overlapping tasks, compared with capacity.
- Flags: over-allocation badge on the Gantt bar and in the task panel, and a **Resources** page with a heat map per vendor per week (green / amber ≥ 90% / red > 100%) that drills into the conflicting tasks.
- No automatic levelling in this phase. It shows the conflict and you decide. Levelling suggestions can follow later.
- **Size: L**

---

## Phase C — Map polish

- **C.1 Satellite (already in the code):** make it a visible toggle button instead of the corner layer control, add a place-names/roads overlay on the satellite view, and remember the choice. **Check Esri World Imagery's terms for commercial use**, or switch provider. **Size: S**
- **C.2 3D flythrough:** kept and on (D-08: non-commercial use). Lazy-loaded; visual polish only. **Size: S**

---

## Recommended order and PRs

1. `phase-0/ui-foundation` (0.1–0.3, 0.7, 0.8) → review on a preview deploy
2. `phase-0/correctness-security` (0.4–0.6)
3. `phase-a/wbs` → `phase-a/dependencies` → `phase-a/cpm` → `phase-a/import`
4. `phase-b/resources`
5. `phase-c/map`

Each PR comes with: migrations (with data migration where needed), a short "what changed / how to test" note, and screenshots of the UI changes.
