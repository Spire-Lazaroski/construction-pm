# 01 — Project Review (state as of 23.09.2026)

Scope: every source file in `backend/` and `frontend/src/`, plus the sample workbook and 21 invoices in `Sample/`.
Nothing has been changed yet. Each finding has an ID so you can approve or reject it on its own.

Severity: **P0** = wrong numbers or a security risk · **P1** = broken or misleading behaviour · **P2** = quality / tidy-up

---

## 1. Correctness: numbers the app can get wrong

| ID | Sev | Where | Finding | Fix |
|---|---|---|---|---|
| R-01 | P0 | `lib/api.js` (all `.list()`) | The API is paginated (`PAGE_SIZE 100`), but the frontend only reads `r.data.results`, so it sees the first page only. The Идадија workbook alone has ~48 positions. With subtasks and expenses you pass 100 fast, and anything after that silently drops out of the Gantt, the totals and the lists. | Add a `listAll()` helper that follows `next`, or turn pagination off for the scoped (`?project=`) endpoints. |
| R-02 | P0 | `views._compute_financial_totals`, `overview` | `projected_cost` and cost-weighted completion add up **every** task, parents and subtasks alike. Once WBS nesting is used, a phase and its children are counted twice. | Aggregate over leaf tasks only. Summary values are always computed from children (see Phase A). |
| R-03 | P0 | `Task.actual_cost` vs `Expense(actual)` | There are two sources of truth for actual cost: a manual override field on the task, and the sum of the expenses logged on it. Analytics uses the expenses and the task panel shows both, so the two can disagree. | Actual cost = sum of the invoices/expenses linked to the task. Drop the manual field, or keep it as an explicit "adjustment" line. |
| R-04 | P1 | `GanttPage.daysBetween` | Durations are end-exclusive, so a task from 01.09 to 04.09 draws as 3 days. Your Excel counts it as 4 (`…+1`). A one-day task draws with zero width. | Use inclusive durations everywhere (end + 1 day) and parse dates as local dates, not UTC. |
| R-05 | P1 | Gantt, Setup hint | A task becomes a **milestone** whenever start = end. That turns every one-day activity into a diamond. | Add an explicit `is_milestone` flag. |
| R-06 | P1 | `UnitViewSet.mark_sold` | "Mark sold" stamps **every unpaid installment as paid today, in full**. That creates revenue that never arrived. | Mark the unit sold and leave the installments alone, or ask for confirmation. (This is in the CRM layer, which is parked, so I will flag it only unless you want it fixed.) |
| R-07 | P1 | `IssueViewSet.spawn_remediation_task` | If no start/end date is sent, the insert fails with a 500 error (the dates are NOT NULL). | Validate, or default the dates to today → today + estimated delay. |
| R-08 | P1 | `TaskSerializer.predecessors` | A predecessor can belong to **another project**. There is no cycle check and no self-link check. A loop would break any critical-path calculation. | Validate same project, no self-link and no cycle. Replaced anyway by the new dependency model in Phase A. |
| R-09 | P1 | `Task.health`, `overview`, `feed` | "Today" comes from the server clock in `TIME_ZONE = "UTC"`. Just after midnight in Skopje, tasks flip overdue a day late. | Set `TIME_ZONE = "Europe/Skopje"` and use `timezone.localdate()`. |
| R-10 | P2 | `Task.progress_pct` | No 0–100 validation on the server. | Add validators. |

## 2. Security and deployment

| ID | Sev | Finding | Fix |
|---|---|---|---|
| S-01 | P0 | `DEBUG` defaults to **on**, `SECRET_KEY` falls back to a hard-coded value, and `ALLOWED_HOSTS` defaults to `*`. If one environment variable is missing on Railway, production runs in debug mode with a known key. | Make the safe values the defaults: DEBUG off, and refuse to start without a secret key. |
| S-02 | P0 | Documents go to a **public** Supabase bucket. Invoices, contracts and permits are readable by anyone who has or guesses the URL. | Use a private bucket with short-lived signed URLs served through the API. |
| S-03 | P1 | There are no roles. Any logged-in user can delete projects and tasks and verify their own work. | Add simple roles (Admin / PM / Site / Read-only). This can come after Phase A, but should be planned now. |
| S-04 | P1 | Uploads have no size or type limits. | Whitelist file types (pdf, jpg, png, dwg, xlsx) and cap the size. |
| S-05 | P2 | Stray files in the repo: `backend/cd` (empty), `.idea/` folders in `backend/config` and `frontend/src/lib`. | Delete them and add `.idea/` to `.gitignore`. |
| S-06 | P2 | The README says any user can log in and there is no role separation. This is accurate, but it should be closed before real client data goes in. | See S-03. |

## 3. Frontend quality

| ID | Sev | Finding |
|---|---|---|
| F-01 | P1 | Every API error pops up as a browser `alert()` showing raw JSON (see `api.js`). That is the single biggest reason the app feels unfinished. It needs toasts and inline field errors instead. |
| F-02 | P1 | **Amount entry:** about 20 `type="number"` inputs show no thousands separator (for example `143500` instead of `143.500`). This is the request you raised. The spec is in doc 03. |
| F-03 | P1 | Amounts are always entered in EUR, even when the header toggle is on MKD. Nothing on screen says so. |
| F-04 | P1 | Two money formatters disagree: `currency.format` uses `de-DE` and `ui.money()` uses the browser locale. |
| F-05 | P2 | `SalesPage.jsx` (11 KB) is imported nowhere, so it is dead code. Its content lives in `OperationalPage`. |
| F-06 | P2 | Cesium (~several MB) is imported directly by `OverviewPage`, so every user downloads it on first load even if they never open the 3D view. It needs lazy loading. |
| F-07 | P2 | Most forms use placeholders instead of labels, and date fields have no label at all (Setup shows two unlabeled date boxes). |
| F-08 | P2 | Dates are shown as ISO (`2026-09-01`) in tables and `Sep 1` on the Gantt. Your team works in `01.09.2026`. |
| F-09 | P2 | There is no loading or skeleton state beyond the word "Loading…", and every list refreshes the whole page. |

## 4. Scope drift vs. the agreed plan

- **Satellite toggle already exists.** `OverviewPage` has a Street/Satellite layer switch (Esri World Imagery), so Phase C's "satellite now" is mostly done. What's left is polish (labels overlay, a clearer toggle) and **checking Esri's terms for commercial use**.
- **The 3D flythrough is already in the code.** `ProjectFlythrough.jsx` and the `cesium` dependencies were added on 23.09. The plan said "later, only if Cesium commercial terms check out", so this went in ahead of that check. Recommendation: put it behind a feature flag (off by default) and lazy-load it until the licensing is confirmed.
- **The CRM/to-do layer stays untouched,** as agreed. The only exception is R-06, which I've flagged but will leave alone unless you say otherwise.

## 5. What is solid, and what we keep

- The data model already separates **planned vs. actual** dates and cost per task. That matches your Excel's two-row layout exactly.
- `Task.parent` already exists, so WBS nesting needs UI and roll-up logic, not a new table.
- The audit trail (`TaskAuditLog`), the verification workflow and issue → remediation task are good construction-specific features and stay.
- The token auth and the Railway + Vercel + Supabase setup are fine for this stage.

## 6. What I could not verify

- The shell on your computer did not start this session, so I read the files directly. I **could not run** `git status`, the build or the backend. I'll run them before the first commit.
- I did not read `backend/.env` or `frontend/.env`, on purpose, because they hold secrets. I only confirmed that `.gitignore` excludes them.
