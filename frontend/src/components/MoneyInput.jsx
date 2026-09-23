import React, { useEffect, useRef, useState } from 'react'
import { formatMoneyTyping, formatMoneyField, parseMoneyInput, RATE_MKD_PER_EUR } from '../lib/format.js'

/**
 * Amount field that groups thousands while you type: 1435000 -> 1.435.000
 *  - comma starts decimals (max 2); the numeric-keypad "." also types the decimal comma
 *  - paste accepts 143500 / 143.500,00 / 143,500.00 / "€ 143 500" / 150k
 *  - caret stays put when dots are inserted
 *  - value/onChange use plain numbers (or null) — the API gets "143500.00"
 *  - currency: suffix shown inside the field; `currency="MKD"` shows the EUR equivalent below
 */
export default function MoneyInput({
  value, onChange, currency = 'EUR', placeholder = '0,00', className = '', size = 'md',
  id, name, disabled, required, autoFocus, showEquivalent = true, ariaLabel,
}) {
  const [text, setText] = useState(() => formatMoneyField(value))
  const [focused, setFocused] = useState(false)
  const ref = useRef(null)
  const pendingCaret = useRef(null)

  // Follow outside changes while not typing.
  useEffect(() => {
    if (!focused) setText(value === null || value === undefined || value === '' ? '' : formatMoneyField(value))
  }, [value, focused])

  useEffect(() => {
    if (pendingCaret.current !== null && ref.current) {
      ref.current.setSelectionRange(pendingCaret.current, pendingCaret.current)
      pendingCaret.current = null
    }
  })

  const commit = (formatted) => {
    const n = parseMoneyInput(formatted.replace(/\./g, '').replace(',', '.'))
    onChange?.(formatted === '' ? null : n)
  }

  const handleChange = (e) => {
    const el = e.target
    const raw = el.value
    const caret = el.selectionStart ?? raw.length
    // how many digits/commas are left of the caret — keep that count after reformatting
    const significantLeft = raw.slice(0, caret).replace(/[^\d,]/g, '').length
    const next = formatMoneyTyping(raw)
    let pos = 0, seen = 0
    while (pos < next.length && seen < significantLeft) {
      if (/[\d,]/.test(next[pos])) seen++
      pos++
    }
    pendingCaret.current = pos
    setText(next)
    commit(next)
  }

  const handleKeyDown = (e) => {
    // The numeric keypad's decimal key types the decimal comma (Excel habit).
    // A plain "." is ignored: thousands dots are inserted automatically.
    if ((e.code === 'NumpadDecimal' || e.key === 'Decimal') && !text.includes(',')) {
      e.preventDefault()
      const el = e.target
      const s = el.selectionStart ?? text.length, en = el.selectionEnd ?? text.length
      const raw = text.slice(0, s) + ',' + text.slice(en)
      handleChange({ target: { value: raw, selectionStart: s + 1 } })
    }
  }

  const handlePaste = (e) => {
    const pasted = e.clipboardData.getData('text')
    const n = parseMoneyInput(pasted)
    if (n === null) return
    e.preventDefault()
    const next = formatMoneyField(n)
    setText(next)
    pendingCaret.current = next.length
    onChange?.(n)
  }

  const handleBlur = () => {
    setFocused(false)
    const n = parseMoneyInput(text.replace(/\./g, '').replace(',', '.'))
    setText(text === '' ? '' : formatMoneyField(n))
  }

  const h = size === 'lg' ? 'h-11 text-[17px] font-semibold' : size === 'sm' ? 'h-8 text-[13px]' : 'h-10 text-sm'
  const eurEquivalent = currency === 'MKD' && value ? value / RATE_MKD_PER_EUR : null

  return (
    <div className={className}>
      <div className={`flex items-center border rounded-lg bg-white px-3 transition ${focused ? 'border-blueprint-500 ring-2 ring-blueprint-100' : 'border-line'} ${disabled ? 'bg-ink-50' : ''}`}>
        <input
          ref={ref} id={id} name={name} type="text" inputMode="decimal" autoComplete="off"
          aria-label={ariaLabel} disabled={disabled} required={required} autoFocus={autoFocus}
          value={text} placeholder={placeholder}
          onChange={handleChange} onKeyDown={handleKeyDown} onPaste={handlePaste}
          onFocus={() => setFocused(true)} onBlur={handleBlur}
          className={`flex-1 min-w-0 bg-transparent outline-none focus-visible:outline-none text-right tabular-nums text-ink-800 placeholder:text-ink-300 ${h}`}
        />
        <span className="ml-2 text-sm text-ink-400 select-none">{currency === 'MKD' ? 'ден.' : '€'}</span>
      </div>
      {showEquivalent && eurEquivalent !== null && (
        <div className="text-xs text-ink-400 mt-1 text-right tabular-nums">
          = {formatMoneyField(eurEquivalent)} € ({RATE_MKD_PER_EUR} ден./€)
        </div>
      )}
    </div>
  )
}
