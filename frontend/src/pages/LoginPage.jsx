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
    <div className="min-h-screen flex items-center justify-center bg-canvas px-4 blueprint-grid-bg relative overflow-hidden">
      <div className="w-full max-w-sm relative">
        <div className="relative flex items-center justify-center mb-10 login-fade-in">
          <div
            className="absolute w-64 h-64 rounded-full logo-pulse-glow pointer-events-none"
            style={{ background: 'radial-gradient(circle, rgba(21,171,169,0.35) 0%, rgba(21,171,169,0) 70%)' }}
          />
          <img src="/logo.webp" alt="United Build Group" className="h-24 w-auto relative" />
        </div>

        <form onSubmit={submit} className="bg-white border border-ink-100 rounded-xl2 shadow-panel p-6 login-fade-in-delay-1">
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

        <p className="text-xs text-ink-300 text-center mt-4 login-fade-in-delay-2">
          Use the account your admin created for you. No public sign-up.
        </p>
      </div>
    </div>
  )
}
