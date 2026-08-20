import React, { createContext, useContext, useState } from 'react'
import { api } from './api.js'

const AuthContext = createContext(null)

export function AuthProvider({ children }) {
  const [token, setToken] = useState(() => {
    try { return localStorage.getItem('pm_token') } catch { return null }
  })
  const [username, setUsername] = useState(() => {
    try { return localStorage.getItem('pm_username') } catch { return null }
  })

  const login = async (user, pass) => {
    const res = await api.post('/auth/login/', { username: user, password: pass })
    setToken(res.data.token)
    setUsername(res.data.username)
    try {
      localStorage.setItem('pm_token', res.data.token)
      localStorage.setItem('pm_username', res.data.username)
    } catch {}
  }

  const logout = async () => {
    try { await api.post('/auth/logout/') } catch {}
    setToken(null)
    setUsername(null)
    try {
      localStorage.removeItem('pm_token')
      localStorage.removeItem('pm_username')
    } catch {}
  }

  return (
    <AuthContext.Provider value={{ token, username, login, logout }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used within an AuthProvider')
  return ctx
}
