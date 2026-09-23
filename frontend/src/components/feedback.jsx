import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react'
import { X, CheckCircle2, AlertCircle } from 'lucide-react'
import { Button, Modal } from './ui.jsx'
import { useT } from '../lib/i18n.jsx'

/* Toasts (in place of alert()) and a confirm dialog (in place of window.confirm). */

const FeedbackContext = createContext(null)

export function FeedbackProvider({ children }) {
  const { t } = useT()
  const [toasts, setToasts] = useState([])
  const [confirmState, setConfirmState] = useState(null)
  const idRef = useRef(0)

  const dismiss = useCallback((id) => setToasts(ts => ts.filter(x => x.id !== id)), [])

  const toast = useCallback((text, { tone = 'info', action, duration = 6000 } = {}) => {
    const id = ++idRef.current
    setToasts(ts => [...ts.slice(-2), { id, text, tone, action }])
    if (duration) setTimeout(() => dismiss(id), duration)
    return id
  }, [dismiss])

  const confirm = useCallback((opts) => new Promise(resolve => {
    setConfirmState({ ...opts, resolve })
  }), [])

  useEffect(() => {
    const onErr = (e) => toast(e.detail, { tone: 'error', duration: 9000 })
    window.addEventListener('api-error', onErr)
    return () => window.removeEventListener('api-error', onErr)
  }, [toast])

  const close = (answer) => { confirmState?.resolve(answer); setConfirmState(null) }

  return (
    <FeedbackContext.Provider value={{ toast, confirm }}>
      {children}
      <div className="fixed left-1/2 bottom-6 z-[60] flex flex-col gap-2 items-center" style={{ transform: 'translateX(-50%)' }} aria-live="polite">
        {toasts.map(ts => (
          <div key={ts.id} role="status"
            className={`toast-in flex items-center gap-3 rounded-xl px-4 py-3 text-sm shadow-pop max-w-[640px] ${ts.tone === 'error' ? 'bg-safety-700 text-white' : 'bg-ink-800 text-white'}`}
            style={{ transform: 'none' }}>
            {ts.tone === 'error' ? <AlertCircle size={18} /> : ts.tone === 'success' ? <CheckCircle2 size={18} className="text-emerald-300" /> : null}
            <span className="flex-1">{ts.text}</span>
            {ts.action && (
              <button type="button" className="font-semibold text-blueprint-200 hover:text-white"
                onClick={() => { ts.action.onClick(); dismiss(ts.id) }}>{ts.action.label}</button>
            )}
            <button type="button" aria-label={t('common.close')} onClick={() => dismiss(ts.id)} className="opacity-70 hover:opacity-100"><X size={16} /></button>
          </div>
        ))}
      </div>
      <Modal open={!!confirmState} onClose={() => close(false)} title={confirmState?.title}
        footer={<>
          <Button variant="secondary" onClick={() => close(false)}>{confirmState?.cancelLabel || t('common.cancel')}</Button>
          <Button variant={confirmState?.danger ? 'danger' : 'primary'} onClick={() => close(true)}>{confirmState?.confirmLabel || t('common.confirm')}</Button>
        </>}>
        {confirmState?.message && <p className="text-sm text-ink-600 leading-relaxed">{confirmState.message}</p>}
        {confirmState?.note && <p className="text-[13px] text-ink-400 leading-relaxed mt-2">{confirmState.note}</p>}
      </Modal>
    </FeedbackContext.Provider>
  )
}

export function useFeedback() {
  const ctx = useContext(FeedbackContext)
  if (!ctx) throw new Error('useFeedback must be used within FeedbackProvider')
  return ctx
}
