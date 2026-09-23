# 04 — UI/UX guidelines: from "gaming" to commercial

Target feel: sober, data-dense construction software used for hours a day, in the spirit of Procore, Oracle Primavera or MS Project Online. It should look trustworthy in front of an investor or a bank.

## 1. Why it currently reads as "gaming"

| Current | Effect |
|---|---|
| Bright teal accent (`#15ABA9`) on almost every button, tab and chart | Reads as a consumer or gaming app |
| Pulsing glow behind the logo and an animated drifting grid on the login page | Decorative motion with no purpose |
| Uppercase monospace "eyebrows" over every card (`01 — PROJECT`, `EXECUTE`, `ANALYZE`) | A "terminal/HUD" look |
| Monospace font for all tables and numbers | Feels technical and raw |
| Emoji as icons (🌐 3D, ⚠, 📄) | Inconsistent, looks informal |
| Browser `alert()` with raw JSON on errors | Looks broken |
| Big create-forms always open at the top of Setup | Busy, and looks like an admin panel |

## 2. Design direction

**Layout**
- **Left sidebar** (collapsible): the project switcher at the top, then Overview · Schedule (Gantt) · Budget & Invoices · Resources · Documents · Settings. The CRM/to-do view stays reachable as "Operations" lower down, unchanged.
- Top bar: breadcrumb (Portfolio / Идадија / Schedule), EUR|MKD switch, user menu (with sign out inside).
- The Gantt and wide tables use the **full width**; forms and overview keep a max width.

**Colour**: neutral first, colour only where it means something
- Base: white surfaces on a very light grey background, slate text.
- **One** primary colour: deep corporate blue (around `#1D4ED8` / navy `#1E3A5F` — final pick on a preview), for primary buttons, links and the selected nav item only.
- Status colours used **only for status**: green = on track, amber = watch, red = late/over budget/critical, muted and never neon.
- Critical path = red, used only for that on the Gantt.

**Typography**
- Inter throughout. Monospace removed. Numbers use `tabular-nums` so columns line up without a mono font.
- Sentence-case headings, no uppercase labels. Clear hierarchy: page title 20px, section 15px, body 13–14px.

**Components**
- Icons: `lucide-react` (one consistent line-icon set) in place of every emoji.
- **Toasts** for success and errors, and **inline field errors** on forms. `alert()` is removed completely.
- Custom **confirm dialog** for deletions, in place of `window.confirm`.
- **Create/edit in a drawer or modal** ("+ New task" button) instead of always-open forms.
- Tables: sticky header, compact rows, **numbers right-aligned**, a totals row at the bottom, sortable columns.
- Labels always visible above fields, never placeholder-only.
- Skeleton loaders in place of the word "Loading…".
- Motion: only 150ms fades and slides for drawers and toasts. No looping animations.

**Login page:** logo, a clean card, the company name. No glow or grid animation.

## 3. Formats (used everywhere)

| Type | Format | Example |
|---|---|---|
| Money EUR | `1.234.567,89 €` | `143.500,00 €` |
| Money MKD | `1.234.567 ден.` | `8.825.250 ден.` |
| Date | `dd.MM.yyyy` | `01.09.2026` |
| Date on Gantt header | month + week number | `Сеп 2026 · Нед. 1` |
| Percent | `0 %` | `33 %` |
| Duration | `N дена` / `N days` | `4 дена` |

(The separator style depends on decision **D-01**. The recommended option is shown.)

## 4. Amount input spec (`<MoneyInput>`)

The request: *a separator while typing, so the zeros don't get confusing.*

**Behaviour**
1. **Formats live while you type**: `1` → `1`, `1435` → `1.435`, `143500` → `143.500`. The cursor stays where it was, including when you edit in the middle of the number.
2. Decimal comma: typing `,` starts the decimals, with at most 2 decimal places. `143500,5` → `143.500,5`, and `143.500,50` when you leave the field.
3. **Paste is forgiving**: `143500`, `143.500`, `143.500,00`, `143,500.00` and `€ 143 500` all become 143500.00. Ambiguous input (`12,500` with no other clue) follows the chosen convention (D-01).
4. The `.` key on the **numeric keypad** types the decimal separator, which is what Excel users expect.
5. The currency suffix (`€` or `ден.`) sits inside the field and is not editable. **The field says which currency you are typing in.** When the display toggle is on MKD, the field accepts MKD and converts it to EUR on save at the fixed rate, with a hint below the field ("= 2.333,33 € at 61,5"). Alternative: always enter in EUR (decision D-04).
6. Optional **shorthands**: `150k` → `150.000`, `1.2m` → `1.200.000`. They cost little and help with round budget figures.
7. Only digits and separators are accepted. No scroll-wheel changes (a common accident with `type="number"`).
8. What goes to the API is a plain decimal string (`"143500.00"`), so no backend change is needed.
9. Accessibility: `inputmode="decimal"` (numeric keyboard on phones), with the label and error message linked to the field.

**Used in:** project budget, task planned cost, sub-task cost, invoice net/VAT/total, expense amount, amount paid, issue cost impact, unit list price and agreed price (CRM screens get the component too, because it is a drop-in replacement with no behaviour change). Quantities such as m² get the same component with no currency suffix.

## 5. How you'll review it

Before any page is converted, I'll send a **static preview** of 3 screens (Overview, Gantt, Budget & Invoices) in the new style, filled with Идадија data. You approve or adjust the look once, and then it rolls out across all pages.
