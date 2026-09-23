# 02 — Sample data analysis: Идадија workbook + invoices

Source: `Sample/Гантограм_Идадија_со_фактури (posledna).xlsx` and 21 PDFs (`ф-ра А01…Б15`).
Purpose: to learn how you actually run a project today, so the app matches it and can import it.

---

## 1. How the workbook is structured

**Sheet "Daily Gantt Chart Template"**: 48 positions over the period 01.09.2026 → 15.10.2027, in weekly columns (Недела 1 = 31.08.2026).

Each position takes **two rows**:

| Row | Columns used | Meaning |
|---|---|---|
| Row 1 (plan) | ID, activity, start, end, **planned price (€)**, paid interim payment Yes/No + date, duration | Plan (baseline) |
| Row 2 (actual) | activity, actual start/end, **realized %**, **realized price** = SUMIF of invoices by ID | Actual (realization) |

The IDs form a **3-level WBS** with three cost groups:

| Group | Positions | Budget (€) | My reading of it — please confirm |
|---|---|---|---|
| **А** | А01–А07 (+ А01.1, А02.1, А05.1, А06.1) | 220.500 | Underground part: demolition, excavation, piles, retaining wall, drainage, waterproofing |
| **Б** | Б01–Б30 | 756.500 | Above-ground part and finishing works: frame, installations, finishes, lift, facade, connections |
| **Ц** | Ц01–Ц07 | 191.500 | Design, permits, fees, supervision (no site work) |
| | **Total** | **1.168.500** | |

Sub-positions such as `А01.1 "рушење плус"` are extra work under a parent position. **This is exactly the WBS nesting in Phase A.**

**Sheet "Фактури"** (invoice register): date, number, contractor, position ID, description, net, VAT 18%, total with VAT, paid Yes/No, payment date, path to the PDF.

**Invoices (PDF)**: one per position. Each has the contractor, position ID, description, amount **with VAT** and a date.

## 2. How this maps to the app

| Excel | App today | Change needed |
|---|---|---|
| ID (А01, А01.1) | none | New `Task.wbs_code` field |
| А / Б / Ц groups | `PhaseCategory` (global) | Import as top-level **summary tasks** (WBS level 1) |
| Plan row: start/end/price | `estimated_start/end/cost` | none |
| Actual row: start/end/% | `actual_start/end`, `progress_pct` | none |
| Realized price = SUMIF of invoices | `Task.actual_cost` + `Expense` (two sources, see R-03) | Actual = sum of linked invoices |
| Difference (€) | `cost_variance` | none |
| Interim payment paid Yes/No + date | none | New "interim payment certificate" concept, **or** reuse the invoice's paid status (decision D-06) |
| Invoice register row | `Expense(entry_type=actual)` + `Document` | Add `invoice_number`, `net_amount`, `vat_rate`, `gross_amount`. Link the PDF to the expense. |
| Contractor | `Vendor` | none (created automatically on import) |
| Weekly Gantt columns | Gantt with day/week/month zoom | Add "Недела N" week numbering to the header |

**Proposed:** an **Excel import** for this workbook format (positions + invoices + PDF matching by file name `ф-ра <ID>.pdf`). It would set up Идадија in the app in one step and prove the data model. It fits at the end of Phase A.

## 3. Data problems found in the sample

These are problems in your working file today. The app's validation would catch them.

| # | Where | Problem |
|---|---|---|
| 1 | А01.1 | End date is **03.03.2026**, before the start date **03.09.2026**. Probably meant 03.09.2026. |
| 2 | Column G (realized price) | The formula is copied onto **both** rows of each position, and every copy looks up the ID in the row above. On the actual rows that ID is correct. On the plan rows it points at an empty cell and returns blank. The result is right today, but it depends on the exact two-row rhythm: insert one row and the lookups shift without any warning. |
| 3 | Column H (Difference) | Filled only on some rows (H7, H11), so the total difference is incomplete. |
| 4 | Dates | Stored as **text** (`"01.09.2026"`) and taken apart with `DATE(RIGHT(…))`. One typo breaks the duration and the Gantt bar without any warning. |
| 5 | "Фактури" sheet | Invoice date = the **task's start date**, not the invoice date. For example А01 is 01.09.2026 in the sheet but 01.11.2026 on the PDF, and А02 is 05.09 vs 04.11.2026. Number, contractor, net and VAT are empty; only the total is filled in. |
| 6 | Invoice Б03 (Електроелемент) | The description reads **"Водовод, одвод и ППЗ"** (plumbing), but Б03 is electrical works. Copy-paste error. The contractor name "Елтртроелемент" is also misspelled. |
| 7 | Invoice Б04 | The PDF is **empty**: only the contractor name, with no amount or date. |
| 8 | Б14, Б15 | Invoices dated 20.11 and 30.11.2027, after the planned end of the project (15.10.2027). |
| 9 | Budget vs. invoices | Over budget: А02 +300, А03 +1.500, А06 +500, Б01 +1.250. Under budget: А04 −4.800, А05 −200. Net across the invoiced positions: **696.550 invoiced vs. 698.000 budget**. |
| 10 | А03 (piles) | Actual end 05.10 vs. planned 30.09 (+5 days). А04 starts on 06.10, so this is a **real dependency slip**, the kind of case the critical path in Phase A should flag. |

## 4. What this tells us for the design

1. **Budget amounts are large, round numbers** (143.500, 181.750). A thousands separator is needed when typing them, confirming F-02.
2. Invoices are **with VAT (18%)**. We need to know whether the planned prices in the budget include VAT (decision D-05), or budget vs. invoice will always be off by 18%.
3. **One invoice ↔ one position** is the normal case, but the register allows several invoices per position. The model has to support 1:N.
4. The team thinks in **weeks** and **dd.mm.yyyy**, in Macedonian. This affects the UI language decision (D-03).
5. The А03 → А04 slip is a clean real-world test case for the critical path.
