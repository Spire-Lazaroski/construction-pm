# 05 — Decisions (answered 23.09.2026)

| ID | Question | Decision |
|---|---|---|
| **D-00** | Scope and order | **Approved.** Old data deleted from admin, so we start clean with the real project (Идадија). |
| **D-01** | Separator | **`143.500,00`**: dot for thousands, comma for decimals. |
| **D-02** | Working calendar | **Required.** Per-project working calendar (details below). |
| **D-03** | UI language | **Both**, Macedonian and English, with a switch. |
| **D-04** | Entering amounts | **As on the invoice.** Each amount is entered in the invoice's currency (EUR or MKD, default EUR). The original amount and currency are kept, plus the EUR equivalent for reports. |
| **D-05** | Budget with or without VAT | **With VAT.** Budget and invoices compare gross against gross. VAT is still stored separately on each invoice (18% by default). |
| **D-06** | Payment process | **Recommended flow adopted** (below). |
| **D-07** | Import Идадија from the Excel | **Yes.** |
| **D-08** | Cesium 3D | **Keep**, since it's not for commercial use. Lazy-loaded so it doesn't slow the first page load. |
| **D-09** | Roles | Everyone sees everything **for now**. **3 role layers** planned (below). |
| **D-10** | CRM layer | **Hidden** from navigation (feature flag). Backend and data untouched. To be discussed later. |
| **D-11** | Critical path | **Most comprehensive version** (A.3 + A.5 combined, below). |
| **D-12** | Look and Gantt | Claude's call. The Gantt gets a **vendor column and vendor labels on the bars**. |

---

## D-02 Working calendar

- **Default for each project:** Mon–Sat working, Sunday off, plus Macedonian public holidays. The holiday list is pre-filled, can be edited by an admin, and will be checked against the official list when implemented.
- **Project-level exceptions:** extra non-working days (winter shutdown, bad weather) and extra working days (a Sunday pour).
- **Task-level override:** a task can use a 7-day calendar, e.g. concrete curing or permit waiting times that run on calendar days.
- Durations are shown in working days. Bars on the Gantt still span real calendar time, with non-working days shaded.

## D-06 Payment process (recommended)

Each invoice goes through four states:

1. **Received** — entered with its PDF, number, supplier, position, net, VAT and total, in its own currency.
2. **Approved** — the PM confirms the work was done. The app **warns** if the total invoiced for a position goes above its budget, or above *budget × reported progress %* (a guard against overbilling).
3. **Due** — due date set. It appears in "payables this week / overdue".
4. **Paid** — one or more **payments** (date, amount, method), so **partial payments** are supported.

The position's **"Interim payment paid"** (Платена времена ситуација) is **derived automatically** from its invoices: Unpaid / Partially paid / Paid, with the last payment date. Nobody has to keep a separate Yes/No flag in sync.

Optional, off by default: **retention**, i.e. a % held back until handover.

## D-09 Roles (implemented after Phase A)

| Role | Can |
|---|---|
| **Admin** | Everything, including users, calendars, deleting projects |
| **Project manager** | Plan, edit tasks, approve invoices, record payments, verify work |
| **Site / Viewer** | View everything, and report progress, actual dates and issues |

## D-11 Critical path (comprehensive)

- All four dependency types (FS/SS/FF/SF) with lag or lead, respecting working calendars.
- Uses actuals: started tasks use their actual start, finished tasks their actual finish, and remaining duration comes from progress.
- **Constraints:** start no earlier than, finish no later than, must start on.
- Output: early/late dates, **total and free float**, critical flag, **near-critical** (float ≤ 5 working days, adjustable), projected finish vs. planned, **driving path trace** ("why is this task late?").
- **Baselines:** save a snapshot of the plan; the Gantt shows baseline vs. current vs. actual, with the variance.
- **Reschedule with preview:** push successors after a slip, show the list of moved dates, then confirm or cancel.
