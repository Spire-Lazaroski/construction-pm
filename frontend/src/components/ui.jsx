import React from 'react'

export function Card({ children, className = '', padded = true }) {
  return (
    <div className={`bg-white border border-ink-100 rounded-xl2 shadow-panel ${padded ? 'p-5 md:p-6' : ''} ${className}`}>
      {children}
    </div>
  )
}

export function SectionCard({ eyebrow, title, action, children, className = '' }) {
  return (
    <Card className={`mb-6 ${className}`}>
      <div className="flex items-start justify-between mb-4 gap-3">
        <div>
          {eyebrow && <Eyebrow>{eyebrow}</Eyebrow>}
          <h2 className="font-semibold text-ink-800 text-[15px] mt-0.5">{title}</h2>
        </div>
        {action}
      </div>
      {children}
    </Card>
  )
}

export function Eyebrow({ children, tone = 'blueprint' }) {
  const toneClass = tone === 'safety' ? 'text-safety-600' : 'text-blueprint-600'
  return (
    <div className={`font-mono text-[10px] font-semibold tracking-[0.14em] uppercase ${toneClass}`}>
      {children}
    </div>
  )
}

export function PageHeader({ eyebrow, title, subtitle, action }) {
  return (
    <div className="flex items-start justify-between mb-6 gap-4 flex-wrap">
      <div className="min-w-0">
        {eyebrow && <Eyebrow>{eyebrow}</Eyebrow>}
        <h1 className="text-xl font-semibold text-ink-900 mt-0.5">{title}</h1>
        {subtitle && <p className="text-sm text-ink-400 mt-1">{subtitle}</p>}
      </div>
      {action}
    </div>
  )
}

export function EmptyState({ title, subtitle }) {
  return (
    <div className="text-center py-10 px-4">
      <div className="text-sm font-medium text-ink-500">{title}</div>
      {subtitle && <div className="text-xs text-ink-300 mt-1">{subtitle}</div>}
    </div>
  )
}

const buttonBase = "inline-flex items-center justify-center gap-1.5 rounded-lg text-sm font-medium transition disabled:opacity-50 disabled:cursor-not-allowed"
const buttonSizes = { sm: "px-3 py-1.5 text-xs", md: "px-4 py-2", lg: "px-5 py-2.5" }
const buttonVariants = {
  primary: "bg-blueprint-600 text-white hover:bg-blueprint-700",
  secondary: "bg-white border border-ink-200 text-ink-700 hover:bg-ink-50",
  danger: "bg-safety-600 text-white hover:bg-safety-700",
  ghost: "text-blueprint-600 hover:bg-blueprint-50",
}

export function Button({ variant = 'primary', size = 'md', className = '', ...props }) {
  return <button className={`${buttonBase} ${buttonSizes[size]} ${buttonVariants[variant]} ${className}`} {...props} />
}

const badgeTones = {
  slate: "bg-ink-100 text-ink-600",
  green: "bg-emerald-50 text-status-green",
  amber: "bg-amber-50 text-status-amber",
  red: "bg-orange-50 text-status-red",
  blue: "bg-blueprint-50 text-blueprint-700",
}

export function Badge({ tone = 'slate', children, className = '' }) {
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-medium ${badgeTones[tone]} ${className}`}>
      {children}
    </span>
  )
}

export function Dot({ tone = 'slate' }) {
  const colorMap = { green: 'bg-status-green', amber: 'bg-status-amber', red: 'bg-status-red', slate: 'bg-ink-300', blue: 'bg-blueprint-500' }
  return <span className={`inline-block w-2 h-2 rounded-full ${colorMap[tone]}`} />
}

export function StatCard({ label, value, tone = 'default', hint }) {
  const toneClass = tone === 'green' ? 'text-status-green' : tone === 'red' ? 'text-status-red' : tone === 'amber' ? 'text-status-amber' : 'text-ink-900'
  return (
    <Card className="!p-4">
      <div className="text-[11px] font-medium text-ink-400 uppercase tracking-wide mb-1.5">{label}</div>
      <div className={`text-2xl font-semibold font-mono tabular-nums ${toneClass}`}>{value}</div>
      {hint && <div className="text-xs text-ink-300 mt-1">{hint}</div>}
    </Card>
  )
}

export const inputClass = "border border-ink-200 rounded-lg px-3 py-2 text-sm w-full bg-white placeholder:text-ink-300 focus:outline-none focus:ring-2 focus:ring-blueprint-200 focus:border-blueprint-400 transition"

export function Field({ label, children, className = '' }) {
  return (
    <label className={`block ${className}`}>
      {label && <span className="text-xs font-medium text-ink-400 block mb-1">{label}</span>}
      {children}
    </label>
  )
}

export function Input(props) {
  return <input {...props} className={`${inputClass} ${props.className || ''}`} />
}

export function Select(props) {
  return <select {...props} className={`${inputClass} ${props.className || ''}`} />
}

export function TextArea(props) {
  return <textarea {...props} className={`${inputClass} ${props.className || ''}`} />
}

export function money(n) {
  return new Intl.NumberFormat(undefined, { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 }).format(n || 0)
}
