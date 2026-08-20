import React, { createContext, useContext, useState } from 'react'

export const RATE_MKD_PER_EUR = 61.5

const CurrencyContext = createContext(null)

export function CurrencyProvider({ children }) {
  const [currency, setCurrency] = useState(() => {
    try { return localStorage.getItem('pm_currency') || 'EUR' } catch { return 'EUR' }
  })

  const toggle = () => {
    setCurrency(prev => {
      const next = prev === 'EUR' ? 'MKD' : 'EUR'
      try { localStorage.setItem('pm_currency', next) } catch {}
      return next
    })
  }

  // All amounts are entered and stored in EUR (the base currency). Display-only conversion.
  const convert = (amountEur) => {
    const n = parseFloat(amountEur) || 0
    return currency === 'MKD' ? n * RATE_MKD_PER_EUR : n
  }

  const format = (amountEur) => {
    const converted = convert(amountEur)
    if (currency === 'MKD') {
      return `${new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 }).format(converted)} ден`
    }
    return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 }).format(converted)
  }

  return (
    <CurrencyContext.Provider value={{ currency, toggle, format, convert }}>
      {children}
    </CurrencyContext.Provider>
  )
}

export function useCurrency() {
  const ctx = useContext(CurrencyContext)
  if (!ctx) throw new Error('useCurrency must be used within a CurrencyProvider')
  return ctx
}
