import React, { useState } from 'react'
import { useAuth } from '../lib/auth.jsx'
import { useT } from '../lib/i18n.jsx'
import { Segmented } from '../components/ui.jsx'

export default function LoginPage() {
  const { login } = useAuth()
  const { t, lang, setLang } = useT()
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  const submit = async (e) => {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      await login(username, password)
    } catch (err) {
      setError(err.response?.status === 400 ? t('login.invalid') : t('login.failed'))
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen flex bg-canvas">
      <div className="hidden lg:flex w-[44%] bg-navy text-white flex-col justify-between p-12">
        <img src="/logo-white.png" alt="United Build Group" className="h-16 w-auto self-start" />
        <div>
          <h2 className="text-3xl font-semibold leading-tight max-w-md">{t('login.tagline')}</h2>
          <p className="text-[#A9B7C9] mt-4 max-w-md leading-relaxed">{t('login.taglineSub')}</p>
        </div>
        <div className="text-xs text-[#8FA0B5]">© {new Date().getFullYear()} United Build Group</div>
      </div>
      <div className="flex-1 flex items-center justify-center px-6">
        <div className="w-full max-w-sm">
          <img src="/logo-dark.png" alt="United Build Group" className="h-14 w-auto mb-10 lg:hidden" />
          <div className="flex items-center justify-between mb-6">
            <h1 className="text-2xl font-semibold text-ink-800">{t('login.title')}</h1>
            <Segmented size="sm" label={t('top.language')} value={lang} onChange={setLang} options={[{ value: 'mk', label: 'МК' }, { value: 'en', label: 'EN' }]} />
          </div>
          <form onSubmit={submit} className="space-y-4">
            {error && <div className="bg-status-redBg text-status-red text-[13px] rounded-lg px-3 py-2.5">{error}</div>}
            <label className="block">
              <span className="text-[13px] font-medium text-ink-600 block mb-1.5">{t('login.username')}</span>
              <input className="border border-line rounded-lg px-3 h-11 text-sm w-full bg-white focus:outline-none focus:ring-2 focus:ring-blueprint-100 focus:border-blueprint-500"
                value={username} onChange={e => setUsername(e.target.value)} autoFocus autoComplete="username" required />
            </label>
            <label className="block">
              <span className="text-[13px] font-medium text-ink-600 block mb-1.5">{t('login.password')}</span>
              <input type="password" className="border border-line rounded-lg px-3 h-11 text-sm w-full bg-white focus:outline-none focus:ring-2 focus:ring-blueprint-100 focus:border-blueprint-500"
                value={password} onChange={e => setPassword(e.target.value)} autoComplete="current-password" required />
            </label>
            <button type="submit" disabled={loading}
              className="w-full h-11 bg-blueprint-600 text-white rounded-lg text-sm font-medium hover:bg-blueprint-700 transition disabled:opacity-50">
              {loading ? t('login.signingIn') : t('login.signIn')}
            </button>
          </form>
          <p className="text-[13px] text-ink-400 mt-6">{t('login.note')}</p>
        </div>
      </div>
    </div>
  )
}
