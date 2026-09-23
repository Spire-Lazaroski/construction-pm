# 07 — Phase A delivery: critical path, dependency types, calendar, baselines

Builds on Phase 0 (doc 06). Everything below is in the working copy for you to review, commit and push.

## 1. What you can do now

| Area | What's new |
|---|---|
| **Links between positions** | In the position editor each predecessor has a **type** (FS finish→start, SS start→start, FF finish→finish, SF start→finish) and a **lag** in working days (negative = overlap). Saving a link that closes a loop is refused, and the message names the positions in the loop. Links to a group (e.g. А05) apply to all its sub-positions. |
| **Working calendar** | *Settings → Working calendar*: pick the working days (default Mon–Sat), see the MK national holidays for 2026–2027 (with the substitute Mondays), and add days for this project only, either non-working (e.g. bad weather) or extra working (e.g. a Sunday concrete pour). A position can instead use a **7-day calendar** (curing, drying), where Sundays and holidays count. |
| **Constraints** | Per position: *As soon as possible* (default), *Start no earlier than*, *Finish no later than*, *Must start on*. A broken constraint shows an amber badge on the row and an explanation in the detail panel. |
| **Critical path** | The Schedule computes the forecast from the links, the calendar, the constraints, the actual dates and today's date. A position not yet started cannot be forecast before today. New **Float** column (working days). Critical bars and arrows are red. New *Critical path* filter. The header shows the planned finish (with the contract deadline if it differs), the **forecast finish ± working days**, and the number of critical positions. |
| **Why is it late?** | The detail panel has a *Schedule* section: forecast start/finish, latest finish, total/free float, the slip against plan, **what drives the start** (a link with its type and lag, the plan, today, or a constraint), and the chain back to the start. |
| **Baselines** | *Save baseline* snapshots every position's dates and budget. The *Compare with* list shows the grey line under each bar from a saved baseline or from the planned dates. |
| **Reschedule** | *Reschedule* shows a preview (old plan → new dates) for positions not yet started. Nothing changes until you press *Apply*. Started and finished positions are never moved. Every change goes into the history. |

## 2. Backend

- **Migration `0009`:**
  - Adds `TaskDependency` (type + lag), `ProjectCalendar`, `CalendarException` (national holidays have no project), `Baseline` and `BaselineTask`.
  - Adds three fields to Task: `calendar_mode`, `constraint_type` and `constraint_date`.
  - Copies every existing link as FS with lag 0, seeds the MK holidays, then drops the old `predecessors` field. Nothing is lost.
- `core/scheduling.py` holds the calendar and the CPM:
  - Forward/backward pass over the four link types with lags.
  - Actual dates override the plan (progress override).
  - Total and free float, a near-critical band of 5 working days, and the driving links.
  - Summaries are rolled up from their children.
- Endpoints:
  - `GET /projects/{id}/schedule/?baseline=&status_date=` (returns 409 with the loop when there is a cycle).
  - `POST /projects/{id}/reschedule/ {apply}`.
  - `GET/POST /projects/{id}/baselines/`.
  - `GET/PUT /projects/{id}/calendar/`.
  - `/dependencies/`, `/calendar-exceptions/`, `/baselines/`.
- Task API: `dependencies` (read) and `dependency_specs` (write: `[{predecessor, type, lag_days}]`). `predecessors` is still returned as a list of ids.
- Tests: 11 in `core/tests.py`. They cover the chain, float, holidays, slip, reschedule, actual dates, FF, FNLT, loop detection, baseline and the calendar endpoint.

## 3. Deploy

1. Push, and let Railway and Vercel build.
2. On Railway, run `python manage.py migrate`. This applies 0008 if it has not run yet, plus 0009.
3. `DJANGO_SECRET_KEY` must be set (see doc 06).

## 4. Test (5 minutes)

1. Open Идадија → *Распоред*. Open А05.3 → **⋯ → Edit**. Add А05.2 as predecessor, FS, lag 2 → Save. The arrow shows `FS+2`.
2. Turn on the *Critical path* filter, then open a red row. Read *Start driven by* and the chain.
3. Press *Save baseline*, change an end date, and pick the baseline in *Compare with*.
4. Press *Reschedule*, check the preview, then *Cancel* or *Apply*.
5. Go to *Settings → Working calendar*. Add a non-working day in the next weeks and check that the forecast moves.

## 5. Next

- Separate `Payment` records for partial payments.
- Roles (Admin / Project manager / Site-Viewer).
- Phase B: resources and over-allocation.
- Drag bars on the Gantt to reschedule.
