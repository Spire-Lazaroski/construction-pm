import React, { useEffect, useRef, useState } from 'react'
import { Calendar } from 'lucide-react'

/**
 * Date field that always shows dd.mm.yyyy (whatever the browser language is).
 * Type digits — the dots are added: 01092026 -> 01.09.2026. Paste 2026-09-01 or 1.9.2026 also works.
 * The calendar button opens the browser's native picker.
 * value / onChange use ISO strings ("2026-09-01") or "" — same as <input type="date">.
 */
export default function DateInput({ value, onChange, disabled, className = '', id, ariaLabel, required }) {
  const toText = (iso) => (iso ? `${iso.slice(8, 10)}.${iso.slice(5, 7)}.${iso.slice(0, 4)}` : '')
  const [text, setText] = useState(toText(value))
  const [focused, setFocused] = useState(false)
  const pickerRef = useRef(null)

  useEffect(() => { if (!focused) setText(toText(value)) }, [value, focused])

  const parse = (s) => {
    s = String(s || '').trim()
    let m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/)
    if (m) return iso(+m[1], +m[2], +m[3])
    m = s.match(/^(\d{1,2})[./\-\s](\d{1,2})[./\-\s](\d{2,4})$/)
    if (m) return iso(m[3].length === 2 ? 2000 + +m[3] : +m[3], +m[2], +m[1])
    m = s.match(/^(\d{2})(\d{2})(\d{4})$/)
    if (m) return iso(+m[3], +m[2], +m[1])
    return null
  }
  const iso = (y, mo, d) => {
    const dt = new Date(y, mo - 1, d)
    if (dt.getFullYear() !== y || dt.getMonth() !== mo - 1 || dt.getDate() !== d) return null
    return `${y}-${String(mo).padStart(2, '0')}-${String(d).padStart(2, '0')}`
  }

  const handleChange = (e) => {
    let raw = e.target.value
    const digits = raw.replace(/\D/g, '').slice(0, 8)
    // auto-insert dots while typing digits only
    if (/^[\d.]*$/.test(raw) && !raw.includes('..')) {
      raw = digits.length > 4 ? `${digits.slice(0, 2)}.${digits.slice(2, 4)}.${digits.slice(4)}`
        : digits.length > 2 ? `${digits.slice(0, 2)}.${digits.slice(2)}` : digits
    }
    setText(raw)
    const parsed = parse(raw)
    if (parsed) onChange?.(parsed)
    else if (raw === '') onChange?.('')
  }

  const handleBlur = () => {
    setFocused(false)
    const parsed = parse(text)
    if (parsed) { setText(toText(parsed)); onChange?.(parsed) }
    else if (text.trim() === '') onChange?.('')
    else setText(toText(value))
  }

  const openPicker = () => {
    const el = pickerRef.current
    if (!el) return
    try { el.showPicker() } catch { el.click() }
  }

  return (
    <div className={`relative flex items-center border rounded-lg bg-white h-10 transition ${focused ? 'border-blueprint-500 ring-2 ring-blueprint-100' : 'border-line'} ${disabled ? 'bg-ink-50' : ''} ${className}`}>
      <input
        id={id} type="text" inputMode="numeric" autoComplete="off" placeholder="дд.мм.гггг" aria-label={ariaLabel}
        value={text} disabled={disabled} required={required}
        onChange={handleChange} onFocus={() => setFocused(true)} onBlur={handleBlur}
        onPaste={(e) => { const p = parse(e.clipboardData.getData('text')); if (p) { e.preventDefault(); setText(toText(p)); onChange?.(p) } }}
        className="flex-1 min-w-0 bg-transparent outline-none focus-visible:outline-none px-3 text-sm tabular-nums text-ink-800 placeholder:text-ink-300 disabled:text-ink-400"
      />
      <button type="button" tabIndex={-1} onClick={openPicker} disabled={disabled} aria-label="Календар"
        className="h-full px-2.5 text-ink-300 hover:text-blueprint-600 disabled:opacity-40">
        <Calendar size={16} strokeWidth={1.75} />
      </button>
      <input ref={pickerRef} type="date" tabIndex={-1} aria-hidden="true" value={value || ''}
        onChange={(e) => onChange?.(e.target.value)}
        className="absolute right-0 bottom-0 w-0 h-0 opacity-0 pointer-events-none" />
    </div>
  )
}
