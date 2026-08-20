import React, { useState } from 'react'
import { useAuth } from '../lib/auth.jsx'

export default function LoginPage() {
  const { login } = useAuth()
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
      setError(err.response?.data?.detail || 'Login failed. Check your username and password.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-canvas px-4">
      <div className="w-full max-w-sm">
        <div className="flex items-center gap-3 justify-center mb-6">
          <div className="w-9 h-9 rounded-md bg-blueprint-700 flex items-center justify-center text-white font-mono text-xs font-semibold">CP</div>
          <div>
            <div className="font-semibold text-ink-900 text-[15px] leading-none">Construction PM</div>
            <div className="font-mono text-[10px] tracking-[0.14em] text-ink-300 uppercase mt-0.5">Site &amp; Ledger</div>
          </div>
        </div>

        <form onSubmit={submit} className="bg-white border border-ink-100 rounded-xl2 shadow-panel p-6">
          <h1 className="text-sm font-semibold text-ink-800 mb-4">Sign in</h1>

          {error && (
            <div className="bg-orange-50 border border-orange-200 text-safety-700 text-xs rounded-lg px-3 py-2 mb-4">
              {error}
            </div>
          )}

          <label className="block mb-3">
            <span className="text-xs font-medium text-ink-400 block mb-1">Username</span>
            <input
              className="border border-ink-200 rounded-lg px-3 py-2 text-sm w-full focus:outline-none focus:ring-2 focus:ring-blueprint-200 focus:border-blueprint-400"
              value={username}
              onChange={e => setUsername(e.target.value)}
              autoFocus
              required
            />
          </label>

          <label className="block mb-5">
            <span className="text-xs font-medium text-ink-400 block mb-1">Password</span>
            <input
              type="password"
              className="border border-ink-200 rounded-lg px-3 py-2 text-sm w-full focus:outline-none focus:ring-2 focus:ring-blueprint-200 focus:border-blueprint-400"
              value={password}
              onChange={e => setPassword(e.target.value)}
              required
            />
          </label>

          <button
            type="submit"
            disabled={loading}
            className="w-full bg-blueprint-600 text-white rounded-lg py-2.5 text-sm font-medium hover:bg-blueprint-700 transition disabled:opacity-50"
          >
            {loading ? 'Signing in…' : 'Sign in'}
          </button>
        </form>

        <p className="text-xs text-ink-300 text-center mt-4">
          Use the account your admin created for you. No public sign-up.
        </p>
      </div>
    </div>
  )
}
