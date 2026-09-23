import { compareCodes, parseISODate, toNumber, workingDays } from './format.js'

/**
 * Build the position tree from a flat task list and compute roll-ups.
 * Cost rule (same as the Excel): each task's estimated_cost is its OWN amount;
 * a parent's total = own + all descendants. Groups normally have 0 of their own.
 */
export function buildTree(tasks) {
  const byId = new Map(tasks.map(t => [t.id, { ...t, children: [] }]))
  const roots = []
  for (const n of byId.values()) {
    const p = n.parent && byId.get(n.parent)
    if (p) p.children.push(n)
    else roots.push(n)
  }
  const sortSiblings = (arr) => arr.sort((a, b) => {
    if (a.wbs_code && b.wbs_code) return compareCodes(a.wbs_code, b.wbs_code)
    if (a.wbs_code && !b.wbs_code) return -1
    if (!a.wbs_code && b.wbs_code) return 1
    return (a.order - b.order) || String(a.name).localeCompare(String(b.name))
  })
  const walk = (nodes, depth, parentPath) => {
    sortSiblings(nodes)
    for (const n of nodes) {
      n.depth = depth
      n.path = [...parentPath, n.id]
      walk(n.children, depth + 1, n.path)
      rollup(n)
    }
  }
  walk(roots, 0, [])
  return { roots, byId }
}

function minDate(a, b) { if (!a) return b; if (!b) return a; return a < b ? a : b }
function maxDate(a, b) { if (!a) return b; if (!b) return a; return a > b ? a : b }

function rollup(n) {
  const own = toNumber(n.estimated_cost)
  n.ownCost = own
  if (n.children.length === 0) {
    n.totalCost = own
    n.rollStart = n.estimated_start || null
    n.rollEnd = n.estimated_end || null
    n.rollActualStart = n.actual_start || null
    n.rollActualEnd = n.actual_end || (n.progress_pct >= 100 ? n.actual_start : null)
    n.rollProgress = toNumber(n.progress_pct)
    n.leafCount = 1
    return
  }
  let total = own, weighted = own * toNumber(n.progress_pct), start = n.estimated_start || null, end = n.estimated_end || null
  let aStart = n.actual_start || null, aEnd = null, leaves = 0, allDone = true
  for (const c of n.children) {
    total += c.totalCost
    weighted += c.totalCost * c.rollProgress
    start = minDate(start, c.rollStart)
    end = maxDate(end, c.rollEnd)
    aStart = minDate(aStart, c.rollActualStart)
    aEnd = maxDate(aEnd, c.rollActualEnd)
    if (c.rollProgress < 100) allDone = false
    leaves += c.leafCount
  }
  n.totalCost = total
  n.rollStart = start
  n.rollEnd = end
  n.rollActualStart = aStart
  n.rollActualEnd = allDone ? aEnd : null
  n.rollProgress = total > 0 ? weighted / total
    : (n.children.reduce((s, c) => s + c.rollProgress, 0) / n.children.length)
  n.leafCount = leaves
}

/** Depth-first list of nodes. */
export function flatten(roots) {
  const out = []
  const walk = (nodes) => nodes.forEach(n => { out.push(n); walk(n.children) })
  walk(roots)
  return out
}

/** Suggest the next code under a parent: Б01..Б30 -> Б31, А01 -> А01.1 / А01.2 ... */
export function suggestCode(parent, siblings) {
  const codes = siblings.map(s => s.wbs_code).filter(Boolean)
  if (!parent) return ''
  const base = parent.wbs_code || ''
  if (!base) return ''
  const isGroup = /^[^\d]+$/.test(base) // "А", "Б", "Ц"
  if (isGroup) {
    const nums = codes.map(c => parseInt(c.slice(base.length), 10)).filter(Number.isFinite)
    const next = (nums.length ? Math.max(...nums) : 0) + 1
    return `${base}${String(next).padStart(2, '0')}`
  }
  const nums = codes.map(c => parseInt(c.split('.').pop(), 10)).filter(Number.isFinite)
  return `${base}.${(nums.length ? Math.max(...nums) : 0) + 1}`
}

export function taskDuration(t) {
  return workingDays(t.rollStart ?? t.estimated_start, t.rollEnd ?? t.estimated_end)
}

export function isLate(n, today) {
  if (n.rollProgress >= 100) return false
  const end = parseISODate(n.rollEnd)
  return !!end && end < today
}
