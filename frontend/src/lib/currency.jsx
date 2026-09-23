import React, { createContext, useContext, useState } from 'react'
import { formatMoney, toNumber, RATE_MKD_PER_EUR } from './format.js'

export { RATE_MKD_PER_EUR }

const CurrencyContext = createContext(null)

/** Display currency only. All amounts are stored in EUR; MKD is shown at the fixed rate. */
export function CurrencyProvider({ children }) {
  const [currency, setCurrencyState] = useState(() => {
    try { return localStorage.getItem('pm_currency') || 'EUR' } catch { return 'EUR' }
  })
  const setCurrency = (c) => {
    setCurrencyState(c)
    try { localStorage.setItem('pm_currency', c) } catch {}
  }
  const toggle = () => setCurrency(currency === 'EUR' ? 'MKD' : 'EUR')
  const convert = (eur) => (currency === 'MKD' ? toNumber(eur) * RATE_MKD_PER_EUR : toNumber(eur))
  const format = (eur, opts) => formatMoney(eur, currency, opts)
  return (
    <CurrencyContext.Provider value={{ currency, setCurrency, toggle, format, convert }}>
      {children}
    </CurrencyContext.Provider>
  )
}

export function useCurrency() {
  const ctx = useContext(CurrencyContext)
  if (!ctx) throw new Error('useCurrency must be used within a CurrencyProvider')
  return ctx
}
