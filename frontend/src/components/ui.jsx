import React, { useEffect, useRef, useState } from 'react'
import { X } from 'lucide-react'
import { formatMoney } from '../lib/format.js'

/* Building blocks for every screen. Quiet surfaces, one accent colour, status colours only for status. */

export function Card({ children, className = '', padded = true, ...rest }) {
  return (
    <section className={`bg-white border border-line rounded-xl2 ${padded ? 'p-5' : ''} ${className}`} {...rest}>
      {children}
    </section>
  )
}

export function SectionCard({ eyebrow, title, action, children, className = '' }) {
  return (
    <Card className={`mb-5 ${className}`}>
      <div className="flex items-start justify-between mb-4 gap-3">
        <div>
          {eyebrow && <Eyebrow>{eyebrow}</Eyebrow>}
          <h2 className="font-semibold text-ink-800 text-[15px]">{title}</h2>
        </div>
        {action}
      </div>
      {children}
    </Card>
  )
}

/** Small grey caption above a heading. Sentence case, no uppercase "HUD" labels. */
export function Eyebrow({ children }) {
  return <div className="text-xs text-ink-400 mb-0.5">{children}</div>
}

export function PageHeader({ eyebrow, title, subtitle, action }) {
  return (
    <div className="flex items-end justify-between mb-5 gap-4 flex-wrap">
      <div className="min-w-0">
        {eyebrow && <Eyebrow>{eyebrow}</Eyebrow>}
        <h1 className="text-[22px] font-semibold text-ink-800 tracking-[-0.01em]">{title}</h1>
        {subtitle && <p className="text-sm text-ink-400 mt-1">{subtitle}</p>}
      </div>
      {action && <div className="flex items-center gap-2 flex-wrap">{action}</div>}
    </div>
  )
}

export function EmptyState({ title, subtitle, action, icon: Icon }) {
  return (
    <div className="text-center py-10 px-4">
      {Icon && <Icon className="mx-auto mb-3 text-ink-300" size={28} strokeWidth={1.5} />}
      <div className="text-sm font-medium text-ink-600">{title}</div>
      {subtitle && <div className="text-[13px] text-ink-400 mt-1">{subtitle}</div>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  )
}

const buttonBase = "inline-flex items-center justify-center gap-2 rounded-lg font-medium transition disabled:opacity-50 disabled:cursor-not-allowed whitespace-nowrap"
const buttonSizes = { sm: "h-8 px-3 text-[13px]", md: "h-10 px-4 text-sm", lg: "h-11 px-5 text-sm" }
const buttonVariants = {
  primary: "bg-blueprint-600 text-white hover:bg-blueprint-700",
  secondary: "bg-white border border-line text-ink-600 hover:bg-ink-50",
  danger: "bg-safety-600 text-white hover:bg-safety-700",
  ghost: "text-blueprint-600 hover:bg-blueprint-50",
  quiet: "text-ink-500 hover:bg-ink-50",
}

export function Button({ variant = 'primary', size = 'md', className = '', icon: Icon, children, ...props }) {
  return (
    <button type="button" className={`${buttonBase} ${buttonSizes[size]} ${buttonVariants[variant]} ${className}`} {...props}>
      {Icon && <Icon size={size === 'sm' ? 15 : 16} strokeWidth={2} />}
      {children}
    </button>
  )
}

export function IconButton({ label, icon: Icon, className = '', size = 18, ...props }) {
  return (
    <button type="button" aria-label={label} title={label}
      className={`inline-flex items-center justify-center w-9 h-9 rounded-lg text-ink-400 hover:text-ink-700 hover:bg-ink-50 transition ${className}`} {...props}>
      <Icon size={size} strokeWidth={1.75} />
    </button>
  )
}

const badgeTones = {
  slate: "bg-ink-50 text-ink-600",
  gray: "bg-ink-50 text-ink-600",
  green: "bg-status-greenBg text-status-green",
  amber: "bg-status-amberBg text-status-amber",
  red: "bg-status-redBg text-status-red",
  blue: "bg-blueprint-50 text-blueprint-700",
}

export function Badge({ tone = 'slate', children, className = '' }) {
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium whitespace-nowrap ${badgeTones[tone] || badgeTones.slate} ${className}`}>
      {children}
    </span>
  )
}

export function Dot({ tone = 'slate' }) {
  const colorMap = { green: 'bg-status-green', amber: 'bg-status-amber', red: 'bg-status-red', slate: 'bg-ink-300', blue: 'bg-blueprint-500' }
  return <span className={`inline-block w-2 h-2 rounded-full shrink-0 ${colorMap[tone] || colorMap.slate}`} />
}

export function StatCard({ label, value, tone = 'default', hint, badge }) {
  const toneClass = tone === 'green' ? 'text-status-green' : tone === 'red' ? 'text-status-red' : tone === 'amber' ? 'text-status-amber' : 'text-ink-800'
  return (
    <Card className="!p-4">
      <div className="flex items-center gap-2">
        <span className="text-[13px] text-ink-400">{label}</span>
        {badge && <span className="ml-auto">{badge}</span>}
      </div>
      <div className={`text-[22px] font-semibold mt-2 tracking-[-0.01em] tabular-nums ${toneClass}`}>{value}</div>
      {hint && <div className="text-[13px] text-ink-400 mt-1">{hint}</div>}
    </Card>
  )
}

export const inputClass = "border border-line rounded-lg px-3 h-10 text-sm w-full bg-white text-ink-800 placeholder:text-ink-300 focus:outline-none focus:ring-2 focus:ring-blueprint-100 focus:border-blueprint-500 transition disabled:bg-ink-50 disabled:text-ink-400"

export function Field({ label, hint, error, required, children, className = '' }) {
  return (
    <label className={`block ${className}`}>
      {label && (
        <span className="text-[13px] font-medium text-ink-600 block mb-1.5">
          {label}{required && <span className="text-status-red"> *</span>}
        </span>
      )}
      {children}
      {error ? <span className="block text-xs text-status-red mt-1.5">{error}</span>
        : hint ? <span className="block text-xs text-ink-400 mt-1.5">{hint}</span> : null}
    </label>
  )
}

export function Input(props) {
  return <input {...props} className={`${inputClass} ${props.className || ''}`} />
}

export function Select(props) {
  return <select {...props} className={`${inputClass} pr-8 ${props.className || ''}`} />
}

export function TextArea(props) {
  return <textarea {...props} className={`${inputClass} h-auto py-2 ${props.className || ''}`} />
}

/** Segmented control: options = [{ value, label }]. */
export function Segmented({ options, value, onChange, label, size = 'md' }) {
  return (
    <div role="group" aria-label={label} className="inline-flex border border-line rounded-lg overflow-hidden bg-white">
      {options.map(o => (
        <button key={o.value} type="button" onClick={() => onChange(o.value)} aria-pressed={value === o.value}
          className={`${size === 'sm' ? 'px-2.5 h-8 text-xs' : 'px-3 h-9 text-[13px]'} font-medium transition border-r border-line last:border-r-0 ${
            value === o.value ? 'bg-blueprint-50 text-blueprint-700' : 'text-ink-400 hover:text-ink-700 hover:bg-ink-50'}`}>
          {o.label}
        </button>
      ))}
    </div>
  )
}

/** Right-side panel for create/edit. */
export function Drawer({ open, onClose, title, subtitle, children, footer, width = 480 }) {
  useEffect(() => {
    if (!open) return
    const onKey = (e) => { if (e.key === 'Escape') onClose?.() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onClose])
  if (!open) return null
  return (
    <div className="fixed inset-0 z-40 flex justify-end">
      <div className="absolute inset-0 bg-ink-800/25" onClick={onClose} />
      <aside className="relative bg-white h-full shadow-pop flex flex-col drawer-in" style={{ width, maxWidth: '100vw' }} role="dialog" aria-label={title}>
        <div className="flex items-start justify-between gap-3 px-6 pt-5 pb-4 border-b border-line">
          <div className="min-w-0">
            {subtitle && <div className="text-xs text-ink-400">{subtitle}</div>}
            <h2 className="text-lg font-semibold text-ink-800 truncate">{title}</h2>
          </div>
          <IconButton label="Close" icon={X} onClick={onClose} />
        </div>
        <div className="flex-1 overflow-y-auto px-6 py-5">{children}</div>
        {footer && <div className="px-6 py-4 border-t border-line flex gap-2">{footer}</div>}
      </aside>
    </div>
  )
}

export function Modal({ open, onClose, title, children, footer, width = 460 }) {
  useEffect(() => {
    if (!open) return
    const onKey = (e) => { if (e.key === 'Escape') onClose?.() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onClose])
  if (!open) return null
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-ink-800/35" onClick={onClose} />
      <div className="relative bg-white rounded-xl shadow-pop w-full p-6" style={{ maxWidth: width }} role="dialog" aria-label={title}>
        {title && <h2 className="text-[17px] font-semibold text-ink-800 mb-2">{title}</h2>}
        {children}
        {footer && <div className="flex justify-end gap-2 mt-5">{footer}</div>}
      </div>
    </div>
  )
}

/** Small popover menu anchored to a trigger. items = [{ label, icon, onClick, danger, divider }] */
export function Menu({ trigger, items, align = 'right', width = 230 }) {
  const [open, setOpen] = useState(false)
  const ref = useRef(null)
  useEffect(() => {
    if (!open) return
    const onDoc = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false) }
    const onKey = (e) => { if (e.key === 'Escape') setOpen(false) }
    document.addEventListener('mousedown', onDoc)
    window.addEventListener('keydown', onKey)
    return () => { document.removeEventListener('mousedown', onDoc); window.removeEventListener('keydown', onKey) }
  }, [open])
  return (
    <div className="relative" ref={ref} onClick={(e) => e.stopPropagation()}>
      {trigger({ open, toggle: () => setOpen(o => !o) })}
      {open && (
        <div role="menu" className={`absolute z-30 mt-1 bg-white border border-line rounded-xl shadow-pop p-1.5 ${align === 'right' ? 'right-0' : 'left-0'}`} style={{ width }}>
          {items.filter(Boolean).map((it, i) => it.divider
            ? <div key={i} className="h-px bg-line my-1" />
            : (
              <button key={i} type="button" role="menuitem" disabled={it.disabled}
                onClick={() => { setOpen(false); it.onClick?.() }}
                className={`w-full flex items-center gap-2.5 px-2.5 py-2 rounded-md text-[13px] text-left transition disabled:opacity-40 ${it.danger ? 'text-status-red hover:bg-status-redBg' : 'text-ink-700 hover:bg-ink-50'}`}>
                {it.icon && <it.icon size={15} strokeWidth={1.75} />}
                <span>{it.label}</span>
              </button>
            ))}
        </div>
      )}
    </div>
  )
}

export function Skeleton({ className = '' }) {
  return <div className={`animate-pulse bg-ink-50 rounded ${className}`} />
}

export function Loading({ rows = 4 }) {
  return (
    <div className="space-y-3">
      {Array.from({ length: rows }).map((_, i) => <Skeleton key={i} className="h-10" />)}
    </div>
  )
}

/** Legacy helper kept for older screens. */
export function money(n) {
  return formatMoney(n, 'EUR', { decimals: 0 })
}
