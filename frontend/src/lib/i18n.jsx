import React, { createContext, useContext, useState, useCallback } from 'react'
import STRINGS from './strings.js'

const I18nContext = createContext(null)

export function I18nProvider({ children }) {
  const [lang, setLangState] = useState(() => {
    try { return localStorage.getItem('pm_lang') || 'mk' } catch { return 'mk' }
  })
  const setLang = (l) => {
    setLangState(l)
    try { localStorage.setItem('pm_lang', l) } catch {}
    document.documentElement.lang = l
  }
  const t = useCallback((key, vars) => {
    const entry = STRINGS[key]
    let s = entry ? (lang === 'en' ? entry[1] : entry[0]) : key
    if (vars) for (const [k, v] of Object.entries(vars)) s = s.replaceAll(`{${k}}`, v)
    return s
  }, [lang])
  return <I18nContext.Provider value={{ lang, setLang, t }}>{children}</I18nContext.Provider>
}

export function useT() {
  const ctx = useContext(I18nContext)
  if (!ctx) throw new Error('useT must be used within I18nProvider')
  return ctx
}
