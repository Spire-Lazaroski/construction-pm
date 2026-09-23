// One place for every number and date the app shows.
// Convention (approved): 143.500,00 — dot for thousands, comma for decimals; dates dd.MM.yyyy.

export const RATE_MKD_PER_EUR = 61.5

const nf2 = new Intl.NumberFormat('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
const nf0 = new Intl.NumberFormat('de-DE', { maximumFractionDigits: 0 })

export function toNumber(v) {
  if (v === null || v === undefined || v === '') return 0
  const n = typeof v === 'number' ? v : parseFloat(v)
  return Number.isFinite(n) ? n : 0
}

/** 143500 -> "143.500,00 €" (EUR) or "8.825.250 ден." (MKD). */
export function formatMoney(amountEur, currency = 'EUR', { decimals } = {}) {
  const n = toNumber(amountEur)
  if (currency === 'MKD') return `${nf0.format(Math.round(n * RATE_MKD_PER_EUR))} ден.`
  const s = decimals === 0 ? nf0.format(n) : nf2.format(n)
  return `${s} €`
}

export function formatNumber(n, decimals = 0) {
  return new Intl.NumberFormat('de-DE', { minimumFractionDigits: decimals, maximumFractionDigits: decimals }).format(toNumber(n))
}

export function formatPct(n) {
  return `${Math.round(toNumber(n))} %`
}

/** Parse "YYYY-MM-DD" as a LOCAL date (new Date("2026-09-01") would be UTC midnight). */
export function parseISODate(s) {
  if (!s) return null
  if (s instanceof Date) return new Date(s.getFullYear(), s.getMonth(), s.getDate())
  const [y, m, d] = String(s).slice(0, 10).split('-').map(Number)
  if (!y || !m || !d) return null
  return new Date(y, m - 1, d)
}

export function toISODate(d) {
  if (!d) return null
  const p = (n) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`
}

export function formatDate(s) {
  const d = parseISODate(s)
  if (!d) return '—'
  const p = (n) => String(n).padStart(2, '0')
  return `${p(d.getDate())}.${p(d.getMonth() + 1)}.${d.getFullYear()}`
}

export function todayLocal() {
  const n = new Date()
  return new Date(n.getFullYear(), n.getMonth(), n.getDate())
}

export function addDays(d, n) {
  const x = new Date(d)
  x.setDate(x.getDate() + n)
  return x
}

/** Whole days between two local dates (b - a). */
export function daysBetween(a, b) {
  const A = parseISODate(a), B = parseISODate(b)
  if (!A || !B) return 0
  return Math.round((Date.UTC(B.getFullYear(), B.getMonth(), B.getDate()) - Date.UTC(A.getFullYear(), A.getMonth(), A.getDate())) / 86400000)
}

/** Inclusive working days, Mon–Sat (Sunday off). Holidays arrive with the calendar in Phase A. */
export function workingDays(start, end) {
  const s = parseISODate(start), e = parseISODate(end)
  if (!s || !e || e < s) return null
  let n = 0
  for (let d = new Date(s); d <= e; d.setDate(d.getDate() + 1)) if (d.getDay() !== 0) n++
  return n
}

/** Natural sort for WBS codes: А2 < А10, А01 < А01.1 < А02. */
export function compareCodes(a = '', b = '') {
  return String(a).localeCompare(String(b), 'mk', { numeric: true, sensitivity: 'base' })
}

/* ---------- live money input helpers (used by <MoneyInput>) ---------- */

/** Keep digits and ONE decimal comma; group thousands with dots; max 2 decimals. */
export function formatMoneyTyping(raw) {
  let s = String(raw ?? '').replace(/[^\d,]/g, '')
  const i = s.indexOf(',')
  let intPart = i >= 0 ? s.slice(0, i) : s
  const dec = i >= 0 ? s.slice(i + 1).replace(/,/g, '').slice(0, 2) : null
  intPart = intPart.replace(/^0+(?=\d)/, '')
  if (intPart === '' && dec !== null) intPart = '0'
  intPart = intPart.replace(/\B(?=(\d{3})+(?!\d))/g, '.')
  return dec === null ? intPart : `${intPart},${dec}`
}

/** Pasted or typed text in any common format -> number (or null). */
export function parseMoneyInput(raw) {
  if (raw === null || raw === undefined) return null
  let s = String(raw).trim().toLowerCase().replace(/\s|€|eur|ден\.?|mkd/g, '')
  if (!s) return null
  let mult = 1
  if (/[kк]$/.test(s)) { mult = 1e3; s = s.slice(0, -1) }
  else if (/(m|мил)$/.test(s)) { mult = 1e6; s = s.replace(/(m|мил)$/, '') }
  const hasC = s.includes(','), hasD = s.includes('.')
  if (hasC && hasD) {
    s = s.lastIndexOf(',') > s.lastIndexOf('.') ? s.replace(/\./g, '').replace(',', '.') : s.replace(/,/g, '')
  } else if (hasC) {
    const tail = s.split(',').pop()
    s = (s.split(',').length > 2 || (tail.length === 3 && mult === 1)) ? s.replace(/,/g, '') : s.replace(',', '.')
  } else if (hasD) {
    const parts = s.split('.')
    if (parts.length > 2 || (parts[parts.length - 1].length === 3 && mult === 1)) s = s.replace(/\./g, '')
  }
  const n = parseFloat(s)
  return Number.isFinite(n) ? Math.round(n * mult * 100) / 100 : null
}

/** Number -> display string for an input that is not focused: 143500 -> "143.500,00". */
export function formatMoneyField(n) {
  if (n === null || n === undefined || n === '') return ''
  return nf2.format(toNumber(n))
}
