# 10 — Market comparison: what's missing and where we're ahead

Status: **discussion document, 11.10.2026.** No code.
Purpose: compare the app with established construction and project-management tools, find the gaps that matter for **United Build Group** (a developer and builder running residential projects in North Macedonia), and pick what to build next.

> Feature descriptions are based on these products' publicly known capabilities. Pricing changes often, so the descriptions below are qualitative. Check vendor sites before any buy-vs-build decision.

---

## 1. The tools we compare against

| Tool | Type | Strength | Typical user |
|---|---|---|---|
| **Oracle Primavera P6 / Primavera Cloud** | Enterprise scheduling | The CPM reference: resources, EVM, multi-project | Large contractors, infrastructure |
| **Microsoft Project** | Desktop/online scheduling | Familiar Gantt, CPM, resources | Planners at every scale |
| **Asta Powerproject** | Construction scheduling | Construction-focused Gantt, line-of-balance | UK/EU contractors |
| **Procore** | Construction management platform | Field + financials + documents + RFIs, huge ecosystem | Mid-to-large general contractors |
| **Autodesk Construction Cloud (Build)** | Construction management + BIM | Drawings, BIM models, issues, RFIs, cost | Contractors working with Revit/BIM |
| **Oracle Aconex** | Document control | Formal transmittals and correspondence, audit | Large projects, many parties |
| **PlanRadar** | Field documentation (Austria, strong in Central and SE Europe) | Defects/tasks pinned on plans, photos, mobile, reports | Developers, site managers |
| **Fieldwire** | Field task management | Plans + tasks + punch lists on mobile | Foremen, subcontractors |
| **Buildertrend / CoConstruct** | Residential builder suite | Schedule, selections, change orders, client portal, sales | Home builders (US) |
| **Smartsheet / monday.com** | Generic work management | Flexible sheets, automations | Teams without a construction tool |

## 2. Capability matrix

✔ = has it · ◐ = partly · — = no · 🅿 = planned in our roadmap

| Capability | **Ours** | P6 | MS Project | Procore | ACC Build | PlanRadar | Buildertrend |
|---|---|---|---|---|---|---|---|
| **Scheduling** | | | | | | | |
| WBS tree, summaries rolled up | ✔ | ✔ | ✔ | ◐ | ◐ | — | ◐ |
| FS/SS/FF/SF + lag, CPM, float | ✔ | ✔ | ✔ | ◐ | ◐ | — | ◐ |
| Working calendars + holidays | ✔ (MK built-in) | ✔ | ✔ | ◐ | ◐ | — | ◐ |
| Constraints, driving path, "why late" | ✔ | ✔ | ◐ | — | — | — | — |
| Baselines + reschedule preview | ✔ | ✔ | ✔ | ◐ | ◐ | — | ◐ |
| Drag bars on the Gantt | — | ✔ | ✔ | ◐ | ◐ | — | ✔ |
| Resources / over-allocation | 🅿 B | ✔ | ✔ | ◐ | ◐ | — | ◐ |
| Import/export MS Project XML, P6 XER | — | ✔ | ✔ | ✔ | ✔ | — | ◐ |
| Look-ahead (2–6 week) schedule | — | ◐ | ◐ | ✔ | ✔ | ◐ | ✔ |
| **Cost** | | | | | | | |
| Budget per position, invoices linked | ✔ | ◐ | ◐ | ✔ | ✔ | — | ✔ |
| Multi-currency, VAT split | ✔ (EUR/MKD, 18 %) | ◐ | — | ✔ | ✔ | — | ◐ |
| Invoice approval + payment status | ✔ | — | — | ✔ | ✔ | — | ✔ |
| Partial payments as records | 🅿 A.4 | — | — | ✔ | ✔ | — | ✔ |
| **Commitments** (contract value per subcontractor) | — | ◐ | — | ✔ | ✔ | — | ✔ |
| **Change orders / variations** | — | ◐ | — | ✔ | ✔ | — | ✔ |
| Retention | ◐ (planned option) | — | — | ✔ | ✔ | — | ◐ |
| **Interim payment certificates** (situations) | ◐ (derived status only) | — | — | ✔ | ✔ | — | ◐ |
| Cash-flow forecast / S-curve | — | ✔ | ◐ | ✔ | ✔ | — | ◐ |
| Earned value (CPI/SPI, EAC) | — | ✔ | ✔ | ◐ | ◐ | — | — |
| Accounting integration | — | ◐ | — | ✔ | ✔ | — | ✔ |
| **Field** | | | | | | | |
| Mobile app, offline | — (responsive web only) | ◐ | ◐ | ✔ | ✔ | ✔ | ✔ |
| Photos with date/location, on the task | ◐ (documents) | — | — | ✔ | ✔ | ✔ | ✔ |
| **Site diary** (daily log: weather, crews, work done) | — | — | — | ✔ | ✔ | ✔ | ✔ |
| **Defects / punch list pinned on drawings** | ◐ (issues, not on plans) | — | — | ✔ | ✔ | ✔ | ✔ |
| Inspections / checklists | ◐ (verification) | — | — | ✔ | ✔ | ✔ | ✔ |
| **Documents** | | | | | | | |
| Drawing viewer with versions, markup | — | — | — | ✔ | ✔ | ✔ | ◐ |
| BIM model viewer | — (3D site view only) | — | — | ◐ | ✔ | ◐ | — |
| RFIs / submittals / transmittals | — | — | — | ✔ | ✔ | ◐ | ◐ |
| Private, permissioned documents | 🅿 SEC-1 | ✔ | ✔ | ✔ | ✔ | ✔ | ✔ |
| **People & access** | | | | | | | |
| Roles and permissions | 🅿 SEC-3 | ✔ | ✔ | ✔ | ✔ | ✔ | ✔ |
| External users (subcontractor, investor, buyer portals) | — | ◐ | ◐ | ✔ | ✔ | ✔ | ✔ |
| Notifications (e-mail/push), digests | ◐ (feed) | ◐ | ◐ | ✔ | ✔ | ✔ | ✔ |
| **Reporting** | | | | | | | |
| Dashboards, portfolio view, map | ✔ | ◐ | ◐ | ✔ | ✔ | ◐ | ✔ |
| Exports (PDF/Excel), monthly investor/bank report | ◐ (task log PDF) | ✔ | ✔ | ✔ | ✔ | ✔ | ✔ |
| Audit trail | ◐ (tasks only) | ✔ | — | ✔ | ✔ | ✔ | ✔ |
| **Developer side** | | | | | | | |
| Unit sales, buyers, installments | ✔ (parked CRM) | — | — | — | — | — | ◐ |
| **Project margin: sales income vs. construction cost** | — (data exists in both halves) | — | — | — | — | — | ◐ |
| **Local fit** | | | | | | | |
| Macedonian UI, `143.500,00`, `dd.mm.yyyy`, MK holidays | ✔ | — | ◐ | — | — | ◐ | — |
| Import of *your* Excel Gantt + invoice PDFs | ✔ | — | — | — | — | — | — |

## 3. Where we are ahead

1. **Local fit by design.** Macedonian UI, MKD/EUR with the original invoice currency kept, 18 % VAT, MK holidays in the calendar, local number and date formats. None of the big platforms offers this out of the box.
2. **Your workflow, not a generic one.** The Excel import reads your actual workbook (two-row plan/actual layout, А/Б/Ц, `ф-ра <ID>.pdf`). Onboarding a new project costs minutes, not a consultant.
3. **P6-grade scheduling with a simple UI.** Four link types, calendars, constraints, float, driving path and "why is this late?" in plain language. Field-oriented tools (Procore, PlanRadar, Fieldwire, Buildertrend) have far weaker CPM. P6 has the power but needs a trained planner.
4. **Schedule and money in one place.** Every invoice belongs to a position, so "work done vs. invoiced vs. time" and overbilling warnings come for free. In most companies this needs P6 *plus* Procore *plus* Excel.
5. **Developer + builder in one system.** The parked CRM already has units, buyers and installments. Combined with construction cost, it can show **margin per project and cash in vs. cash out**. That is a view Procore/P6 don't have and Buildertrend only partly.
6. **Cost and ownership.** No per-seat or per-construction-volume licence, your data in your own database, and features shaped by your requests.

## 4. What's missing: ranked by value for United Build Group

| # | Gap | Why it matters here | Size | Suggest |
|---|---|---|---|---|
| G-1 | **Commitments + change orders** (contract per subcontractor; variations such as А01.1 "рушење плус" approved as a change, not just a new row) | Today budget = plan and invoices = actual; there is no "what we have *committed* to pay". Over-runs show up only when the invoice arrives. Every serious tool has this. | M–L | **Next after security** |
| G-2 | **Site diary + photos from the phone** (date, weather, crews per vendor, work done, photos tied to a position) | Field record and evidence for disputes. Also feeds Phase B (actual crews). **North Macedonia's construction law requires a construction diary and construction book (градежен дневник / градежна книга); verify what form an electronic version may take.** | M | High |
| G-3 | **Cash-flow forecast / S-curve** (planned spend per month from the schedule × budget, vs. actual invoices and payments; later + sales installments) | Banks and investors ask for it. The data is already there. | S–M | High, cheap |
| G-4 | **Reports & exports**: monthly progress report PDF (KPIs, Gantt snapshot, photos, invoices), Excel export of positions/invoices, Gantt print to A3 | You need to show progress to the bank and the investor. Today only the task-log PDF exists. | M | High |
| G-5 | **Defects / punch list on drawings** (upload plan PDF, pin issue with photo, assign vendor, close with photo) | PlanRadar's core feature and the most-used one at handover. Our `Issue` model is a good base. | M–L | Medium |
| G-6 | **Mobile-first field mode** (big buttons: progress %, actual dates, photo, issue), PWA with offline queue | Site staff won't use a desktop Gantt on a phone. | M | Medium, pairs with G-2 |
| G-7 | **Interim payment certificates (ситуации)**: quantity/percentage per position per period → certificate → invoice | How subcontractors in MK are actually paid; the payment status is derived today but the certificate itself isn't produced. | M | Medium (discuss) |
| G-8 | **Earned value** (PV/EV/AC, CPI/SPI, EAC) | Needs only data we have plus the S-curve (G-3). A strong signal of seriousness for banks. | S | After G-3 |
| G-9 | **Notifications** (e-mail digest: payables due, late positions, critical-path changes) | Today you have to open the app to notice anything. | S–M | Medium |
| G-10 | MS Project XML / P6 XER **import & export** | Exchange with external planners, investors or lenders who ask for a P6/MSP file. | M | Low, on request |
| G-11 | Drag bars on the Gantt; look-ahead view | Convenience; reschedule-with-preview already covers the need. | M | Low |
| G-12 | Drawings register with versions | Useful, but a large area (viewer, revisions, transmittals). Use a simple "document type = drawing + revision" first. | S → L | Low |
| G-13 | External portals (subcontractor uploads invoices; buyer sees progress of their unit) | Strong differentiator later, but only after roles (SEC-3) and the private bucket (SEC-1). | L | Later |
| — | BIM, RFIs/submittals, accounting integration | Matter for large GCs. Low value for this team now. | — | Not now |

## 5. What we should *not* copy

- **Breadth over depth.** Procore/ACC cover 30+ modules for large contractors. Each module we add must earn its place with this team's daily use.
- **Planner-only complexity** (P6 activity codes, EPS/OBS, resource curves). Keep the "explain it in plain words" approach.
- **Generic boards** (Smartsheet/monday-style). The construction-specific model (plan vs actual, positions, invoices, calendars) is the advantage.

## 6. Suggested sequence (for discussion)

1. **Security** (doc 09): needed before anything else is used with more people.
2. **Money integrity:** R-03 single source of actual cost, A.4 `Payment` records, **G-1 commitments + change orders**.
3. **Reporting quick wins:** **G-3 cash-flow / S-curve**, then **G-4 monthly report + exports**, then G-8 EVM.
4. **Field:** **G-2 site diary + photos** with **G-6 mobile mode**, then G-5 defects on plans.
5. **Phase B resources**: it gets better input once the site diary records actual crews.
6. Later: G-7 certificates, G-9 notifications, G-13 portals, then the CRM brought back with **project margin** (advantage 5).

## 7. Questions for you

1. Which pain is biggest **today**: knowing what you've committed to pay (G-1), showing progress to the bank/investor (G-3/G-4), or recording what happens on site (G-2)?
2. Do subcontractors bill against **ситуации** (measured progress), or a fixed amount per position? This decides G-7.
3. Does a site manager need to work **offline** on site (poor signal), or is mobile web enough?
4. Is the e-diary meant to replace the paper **градежен дневник**, or only to complement it?
5. Are any of these tools already in use, or were any evaluated? (If PlanRadar is already used for defects, an integration could beat building G-5.)
