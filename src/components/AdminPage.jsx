import { useEffect, useState, useCallback } from 'react'
import {
  supabase,
  subscribeToSubmissions,
  deleteSubmissionFromCloud,
  clearAllSubmissionsFromCloud,
  signInAdmin,
  signOutAdmin,
  hasAdminSession,
  isPasswordRecovery,
  getRecoveryLinkError,
  sendPasswordReset,
  setNewPassword,
} from '../supabase.js'

const MIN_PASSWORD_LENGTH = 8

// Admin accounts are managed in Supabase (Authentication -> Users, plus the
// admins table). No password is stored in this code.

// The four categories counters may use, shown as separate totals.
const CATEGORIES = [
  'Male Teenagers',
  'Female Teenagers',
  'Male Teachers',
  'Female Teachers',
]

// Names outside the four categories (from older submissions).
function isCategory(name) {
  return CATEGORIES.some((c) => c.toLowerCase() === name.trim().toLowerCase())
}

// The calendar day (in this device's time zone) a submission was made, as
// YYYY-MM-DD, so submissions can be grouped by day.
function dayKey(date) {
  if (!date) return 'unknown'
  const d = new Date(date)
  return isNaN(d.getTime()) ? 'unknown' : d.toLocaleDateString('en-CA')
}

function formatDay(key) {
  if (!key || key === 'unknown') return 'Unknown Date'
  const parts = key.split('-')
  if (parts.length !== 3) return key
  const [y, m, d] = parts.map(Number)
  const date = new Date(y, m - 1, d)
  if (isNaN(date.getTime())) return key
  return date.toLocaleDateString(undefined, {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  })
}

const ALL_DAYS = 'all'

export default function AdminPage({ onBack, onNavigate }) {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loggedIn, setLoggedIn] = useState(false)
  const [checkingSession, setCheckingSession] = useState(true)
  const [signingIn, setSigningIn] = useState(false)
  const [error, setError] = useState('')
  // 'login' | 'forgot' (ask for a reset email) | 'reset' (set a new password)
  const [mode, setMode] = useState(() => (isPasswordRecovery() ? 'reset' : 'login'))
  const [resetNotice, setResetNotice] = useState('')
  const [newPassword, setNewPasswordValue] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [submissions, setSubmissions] = useState([])
  const [flash, setFlash] = useState(false)
  const [isCloudConnected, setIsCloudConnected] = useState(false)
  const [copied, setCopied] = useState(false)
  const [selectedDay, setSelectedDay] = useState(() => dayKey(Date.now()))

  // Stay logged in on this device if an admin session already exists.
  useEffect(() => {
    let active = true
    // A reset link signs the user in, but they must set a new password first.
    if (isPasswordRecovery()) {
      const linkError = getRecoveryLinkError()
      if (linkError) {
        setMode('forgot')
        setError(linkError)
      } else {
        setMode('reset')
      }
      setCheckingSession(false)
      return
    }

    hasAdminSession().then((ok) => {
      if (!active) return
      setLoggedIn(ok)
      setCheckingSession(false)
    })

    // Listen for auth state changes (e.g. password recovery or logout)
    let authSubscription = null
    if (supabase) {
      const { data } = supabase.auth.onAuthStateChange((event) => {
        if (!active) return
        if (event === 'PASSWORD_RECOVERY') {
          setMode('reset')
          setError('')
        } else if (event === 'SIGNED_OUT') {
          setLoggedIn(false)
        }
      })
      authSubscription = data?.subscription
    }

    return () => {
      active = false
      authSubscription?.unsubscribe()
    }
  }, [])

  // Only admins can read submissions; the database enforces this.
  useEffect(() => {
    if (!loggedIn) return

    const unsubscribe = subscribeToSubmissions(
      (items) => {
        setIsCloudConnected(true)
        setSubmissions(items)
        setFlash(true)
        setTimeout(() => setFlash(false), 800)
      },
      (err) => {
        setIsCloudConnected(false)
        console.warn('Live cloud sync warning:', err)
      },
    )

    return () => {
      if (typeof unsubscribe === 'function') unsubscribe()
    }
  }, [loggedIn])

  // Days that have submissions, newest first. Today is always offered.
  const today = dayKey(Date.now())
  const days = [...new Set([today, ...submissions.map((s) => dayKey(s.submittedAt))])]
    .sort()
    .reverse()

  // The submissions for the chosen day (or every day).
  const shown =
    selectedDay === ALL_DAYS
      ? submissions
      : submissions.filter((s) => dayKey(s.submittedAt) === selectedDay)
  const shownLabel = selectedDay === ALL_DAYS ? 'All days' : formatDay(selectedDay)

  // Build aggregated totals across the shown submissions
  const aggregated = useCallback(() => {
    const map = new Map()
    for (const submission of shown) {
      for (const tally of submission?.tallies || []) {
        if (!tally?.name) continue
        const count = Number(tally.count) || 0
        map.set(tally.name, (map.get(tally.name) ?? 0) + count)
      }
    }
    return [...map.entries()].map(([name, count]) => ({ name, count }))
  }, [shown])

  const grandTotal = aggregated().reduce((sum, t) => sum + t.count, 0)

  // Sums of the named categories, e.g. Male Teachers + Male Teenagers.
  function sumOf(names) {
    const wanted = names.map((n) => n.toLowerCase())
    return aggregated()
      .filter((t) => wanted.includes(t.name.trim().toLowerCase()))
      .reduce((sum, t) => sum + t.count, 0)
  }
  const categoryTotals = CATEGORIES.map((name) => ({ name, count: sumOf([name]) }))
  const maleTotal = sumOf(['Male Teachers', 'Male Teenagers'])
  const femaleTotal = sumOf(['Female Teachers', 'Female Teenagers'])

  async function handleLogin(e) {
    e.preventDefault()
    if (signingIn) return
    if (!email.trim() || !password) {
      setError('Please enter your email and password.')
      return
    }
    setSigningIn(true)
    setError('')
    try {
      await signInAdmin(email.trim(), password)
      setPassword('')
      setLoggedIn(true)
    } catch (err) {
      setError(err.message || 'Could not log in. Please try again.')
    } finally {
      setSigningIn(false)
    }
  }

  async function handleForgot(e) {
    e.preventDefault()
    if (signingIn) return
    if (!email.trim()) {
      setError('Please enter your admin email.')
      return
    }
    setSigningIn(true)
    setError('')
    try {
      await sendPasswordReset(email.trim())
      setResetNotice(
        'A password reset link has been sent to your email. Please check your inbox (and spam folder) and click the link to reset your password.',
      )
    } catch (err) {
      setError(err.message || 'Could not send reset link. Please try again.')
    } finally {
      setSigningIn(false)
    }
  }

  async function handleSetNewPassword(e) {
    e.preventDefault()
    if (signingIn) return
    if (newPassword.length < MIN_PASSWORD_LENGTH) {
      setError(`Use at least ${MIN_PASSWORD_LENGTH} characters.`)
      return
    }
    if (newPassword !== confirmPassword) {
      setError('The two passwords do not match.')
      return
    }
    setSigningIn(true)
    setError('')
    try {
      await setNewPassword(newPassword)
      setNewPasswordValue('')
      setConfirmPassword('')
      setMode('login')
      setLoggedIn(true)
    } catch (err) {
      setError(err.message || 'Could not change password. Please try again.')
    } finally {
      setSigningIn(false)
    }
  }

  function switchMode(next) {
    setMode(next)
    setError('')
    setResetNotice('')
    setPassword('')
  }

  async function handleLogout() {
    await signOutAdmin()
    setSubmissions([])
    setIsCloudConnected(false)
    setLoggedIn(false)
  }

  async function handleClearAll() {
    if (!window.confirm('Clear ALL submissions? This cannot be undone.')) return
    setSubmissions([])
    try {
      await clearAllSubmissionsFromCloud()
    } catch (err) {
      console.warn('Could not clear cloud submissions:', err)
    }
  }

  async function handleRemoveSubmission(id) {
    setSubmissions((current) => current.filter((s) => s.id !== id))
    try {
      await deleteSubmissionFromCloud(id)
    } catch (err) {
      console.warn('Could not remove from cloud:', err)
    }
  }

  function handleCopyReport() {
    const aggList = aggregated()
    const lines = [
      'Attendance Summary Report',
      `Date: ${new Date().toLocaleString()}`,
      `Totals for: ${shownLabel}`,
      '---------------------------------',
      ...categoryTotals.map((t) => `${t.name}: ${t.count}`),
      ...aggList.filter((t) => !isCategory(t.name)).map((t) => `${t.name}: ${t.count}`),
      '---------------------------------',
      `Male Total (Teachers + Teenagers): ${maleTotal}`,
      `Female Total (Teachers + Teenagers): ${femaleTotal}`,
      '---------------------------------',
      `Grand Total: ${grandTotal}`,
      '',
      `Submissions (${shown.length}):`,
      ...[...shown].reverse().map((s) => {
        const subTotal = (s?.tallies || []).reduce((sum, t) => sum + (Number(t?.count) || 0), 0)
        const service = s.service ? ` (${s.service})` : ''
        return `- ${s.submittedBy || 'Counter'}${service}: ${subTotal}`
      }),
    ]

    navigator.clipboard.writeText(lines.join('\n')).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 3000)
    })
  }

  function handlePrint() {
    window.print()
  }

  if (checkingSession) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-blue-950 text-white">
        Loading…
      </div>
    )
  }

  if (!loggedIn && mode !== 'login') {
    const isReset = mode === 'reset'
    return (
      <div className="flex min-h-screen flex-col items-center justify-center bg-blue-950 px-4">
        <div className="w-full max-w-sm rounded-2xl bg-white p-8 shadow-2xl">
          <div className="mb-6 text-center">
            <h2 className="text-2xl font-bold text-blue-950">
              {isReset ? 'Set New Password' : 'Forgot Password'}
            </h2>
            <p className="mt-1 text-sm text-blue-600">
              {isReset
                ? 'Choose a new password for your admin account.'
                : 'Enter your admin email and we will send you a reset link.'}
            </p>
          </div>

          {isReset ? (
            <form onSubmit={handleSetNewPassword} noValidate>
              <label htmlFor="new-password" className="block text-sm font-semibold text-blue-900">
                New password
              </label>
              <input
                id="new-password"
                type="password"
                value={newPassword}
                autoComplete="new-password"
                onChange={(e) => {
                  setNewPasswordValue(e.target.value)
                  setError('')
                }}
                placeholder={`At least ${MIN_PASSWORD_LENGTH} characters`}
                aria-invalid={Boolean(error)}
                className="mt-2 w-full rounded-lg border-2 border-blue-200 px-4 py-3 outline-none placeholder:text-blue-300 focus:border-blue-700 mb-4"
              />
              <label htmlFor="confirm-password" className="block text-sm font-semibold text-blue-900">
                Confirm new password
              </label>
              <input
                id="confirm-password"
                type="password"
                value={confirmPassword}
                autoComplete="new-password"
                onChange={(e) => {
                  setConfirmPassword(e.target.value)
                  setError('')
                }}
                placeholder="Type it again"
                aria-invalid={Boolean(error)}
                className="mt-2 w-full rounded-lg border-2 border-blue-200 px-4 py-3 outline-none placeholder:text-blue-300 focus:border-blue-700"
              />
              {error && (
                <p role="alert" className="mt-2 text-sm font-medium text-red-600">
                  {error}
                </p>
              )}
              <button type="submit" disabled={signingIn} className="mt-4 w-full cursor-pointer rounded-lg bg-blue-700 py-3 font-semibold text-white transition-colors hover:bg-blue-800 disabled:cursor-wait disabled:opacity-60">
                {signingIn ? 'Saving…' : 'Save New Password'}
              </button>
            </form>
          ) : resetNotice ? (
            <p role="status" className="rounded-lg border border-green-300 bg-green-50 p-4 text-sm font-medium text-green-800">
              {resetNotice}
            </p>
          ) : (
            <form onSubmit={handleForgot} noValidate>
              <label htmlFor="reset-email" className="block text-sm font-semibold text-blue-900">
                Email
              </label>
              <input
                id="reset-email"
                type="email"
                value={email}
                autoComplete="username"
                onChange={(e) => {
                  setEmail(e.target.value)
                  setError('')
                }}
                placeholder="Enter admin email"
                aria-invalid={Boolean(error)}
                className="mt-2 w-full rounded-lg border-2 border-blue-200 px-4 py-3 outline-none placeholder:text-blue-300 focus:border-blue-700"
              />
              {error && (
                <p role="alert" className="mt-2 text-sm font-medium text-red-600">
                  {error}
                </p>
              )}
              <button type="submit" disabled={signingIn} className="mt-4 w-full cursor-pointer rounded-lg bg-blue-700 py-3 font-semibold text-white transition-colors hover:bg-blue-800 disabled:cursor-wait disabled:opacity-60">
                {signingIn ? 'Sending…' : 'Send Reset Link'}
              </button>
            </form>
          )}

          <button type="button" onClick={() => switchMode('login')} className="mt-4 block w-full cursor-pointer text-center text-sm font-semibold text-blue-700 underline-offset-2 hover:underline">
            Back to Login
          </button>
        </div>
      </div>
    )
  }

  if (!loggedIn) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center bg-blue-950 px-4">
        <div className="w-full max-w-sm rounded-2xl bg-white p-8 shadow-2xl">
          <div className="mb-6 text-center">
            <div className="mx-auto mb-3 flex h-16 w-16 items-center justify-center rounded-full bg-blue-700">
              <svg
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                className="h-8 w-8 text-white"
              >
                <circle cx="12" cy="8" r="4" />
                <path d="M4 20c0-4 3.6-7 8-7s8 3 8 7" />
              </svg>
            </div>
            <h2 className="text-2xl font-bold text-blue-950">Admin Login</h2>
            <p className="mt-1 text-sm text-blue-600">Head of Department access only</p>
          </div>

          <form onSubmit={handleLogin} noValidate>
            <label htmlFor="admin-email" className="block text-sm font-semibold text-blue-900">
              Email
            </label>
            <input
              id="admin-email"
              type="email"
              value={email}
              autoComplete="username"
              onChange={(e) => {
                setEmail(e.target.value)
                setError('')
              }}
              placeholder="Enter admin email"
              aria-invalid={Boolean(error)}
              className="mt-2 mb-4 w-full rounded-lg border-2 border-blue-200 px-4 py-3 outline-none placeholder:text-blue-300 focus:border-blue-700"
            />
            <label htmlFor="admin-password" className="block text-sm font-semibold text-blue-900">
              Password
            </label>
            <input
              id="admin-password"
              type="password"
              value={password}
              autoComplete="current-password"
              onChange={(e) => {
                setPassword(e.target.value)
                setError('')
              }}
              placeholder="Enter admin password"
              aria-invalid={Boolean(error)}
              className="mt-2 w-full rounded-lg border-2 border-blue-200 px-4 py-3 outline-none placeholder:text-blue-300 focus:border-blue-700"
            />
            {error && (
              <p role="alert" className="mt-2 text-sm font-medium text-red-600">
                {error}
              </p>
            )}
            <button
              type="submit"
              disabled={signingIn}
              className="mt-4 w-full cursor-pointer rounded-lg bg-blue-700 py-3 font-semibold text-white transition-colors hover:bg-blue-800 disabled:cursor-wait disabled:opacity-60"
            >
              {signingIn ? 'Logging in…' : 'Login'}
            </button>
          </form>

          <button type="button" onClick={() => switchMode('forgot')} className="mt-4 block w-full cursor-pointer text-center text-sm font-semibold text-blue-700 underline-offset-2 hover:underline">
            Forgot password?
          </button>

          <button
            type="button"
            onClick={onBack}
            className="mt-4 w-full cursor-pointer rounded-lg border-2 border-blue-200 py-3 text-sm font-semibold text-blue-700 transition-colors hover:bg-blue-50"
          >
            Back to Counter
          </button>
        </div>
      </div>
    )
  }

  const otherTotals = aggregated().filter((t) => !isCategory(t.name))

  return (
    <div className="min-h-screen bg-white text-blue-950">
      {/* Header */}
      <header className="border-b border-blue-200 bg-white">
        <div className="mx-auto flex max-w-5xl items-center justify-between gap-4 px-4 py-4 sm:px-6">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-blue-700">
              <svg
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                className="h-5 w-5 text-white"
              >
                <circle cx="12" cy="8" r="4" />
                <path d="M4 20c0-4 3.6-7 8-7s8 3 8 7" />
              </svg>
            </div>
            <div>
              <h1 className="text-xl font-bold text-blue-950">Admin Dashboard</h1>
              <p className="text-xs text-blue-500">Live aggregated counts</p>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {submissions.length > 0 && (
              <button
                type="button"
                onClick={handleClearAll}
                className="cursor-pointer rounded-lg border border-red-300 px-4 py-2 text-sm font-semibold text-red-600 transition-colors hover:bg-red-50"
              >
                Clear All
              </button>
            )}
            {onNavigate && (
              <button
                type="button"
                onClick={() => onNavigate('calculator')}
                className="cursor-pointer rounded-lg border border-blue-300 bg-white px-3 py-2 text-sm font-semibold text-blue-700 hover:bg-blue-50 transition-colors"
              >
                Calculator
              </button>
            )}
            <button
              type="button"
              onClick={handleLogout}
              className="cursor-pointer rounded-lg bg-red-600 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-red-700"
            >
              Logout
            </button>
            <button
              type="button"
              onClick={onBack}
              className="cursor-pointer rounded-lg bg-green-700 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-green-800"
            >
              Counter
            </button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-5xl px-4 py-8 sm:px-6">
        {/* Live indicator */}
        <div className="mb-6 flex flex-wrap items-center justify-between gap-2 text-sm">
          <div className="flex items-center gap-2 text-blue-700">
            <span
              className={`h-2.5 w-2.5 rounded-full transition-colors duration-300 ${flash ? 'bg-yellow-400' : isCloudConnected ? 'bg-green-500' : 'bg-blue-400'} animate-pulse`}
            />
            <span className="font-medium">
              {isCloudConnected
                ? 'Cloud Sync Active — updating live across all devices'
                : 'Live — updates automatically when counters submit'}
            </span>
          </div>
          <span className="text-xs text-blue-500 font-medium">
            {isCloudConnected ? 'Connected to Supabase' : 'Sync ready'}
          </span>
        </div>

        {submissions.length === 0 ? (
          <div className="rounded-xl border border-blue-200 bg-blue-50 p-12 text-center">
            <p className="text-lg font-medium text-blue-700">No submissions yet.</p>
            <p className="mt-1 text-sm text-blue-500">
              Waiting for counters to submit their tallies…
            </p>
          </div>
        ) : (
          <>
            {/* Grand total summary */}
            <section
              aria-live="polite"
              className={`mb-8 rounded-xl border p-6 transition-colors duration-300 ${
                flash ? 'border-yellow-400 bg-yellow-50' : 'border-blue-200 bg-blue-50'
              }`}
            >
              <div className="mb-4 flex flex-wrap items-center gap-2">
                <label htmlFor="day-select" className="text-sm font-semibold text-blue-900">
                  Show totals for
                </label>
                <select
                  id="day-select"
                  value={selectedDay}
                  onChange={(e) => setSelectedDay(e.target.value)}
                  className="cursor-pointer rounded-lg border-2 border-blue-200 bg-white px-3 py-1.5 text-sm font-semibold text-blue-900 outline-none focus:border-blue-700"
                >
                  {days.map((d) => (
                    <option key={d} value={d}>
                      {d === today ? `Today (${formatDay(d)})` : formatDay(d)}
                    </option>
                  ))}
                  <option value={ALL_DAYS}>All days</option>
                </select>
              </div>
              <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
                <h2 className="text-lg font-bold text-blue-900">
                  Day Total [{shownLabel}]
                </h2>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={handleCopyReport}
                    className="cursor-pointer rounded-lg border border-blue-300 bg-white px-3 py-1.5 text-xs font-semibold text-blue-800 transition-colors hover:bg-blue-100"
                  >
                    {copied ? 'Copied to Clipboard!' : 'Copy Report'}
                  </button>
                  <button
                    type="button"
                    onClick={handlePrint}
                    className="cursor-pointer rounded-lg border border-blue-300 bg-white px-3 py-1.5 text-xs font-semibold text-blue-800 transition-colors hover:bg-blue-100"
                  >
                    Print / PDF
                  </button>
                </div>
              </div>
              <ul className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
                {categoryTotals.map((t) => (
                  <li
                    key={t.name}
                    className="rounded-lg border border-blue-200 bg-white p-4 text-center shadow-sm"
                  >
                    <p className="text-sm font-semibold text-blue-800">{t.name}</p>
                    <p className="mt-1 text-3xl font-bold text-green-700 tabular-nums">{t.count}</p>
                  </li>
                ))}
              </ul>
              <table className="w-full text-left">
                <caption className="sr-only">Aggregated count totals across all submissions</caption>
                {otherTotals.length > 0 && (
                <thead>
                  <tr className="border-b border-blue-200 text-sm text-blue-600">
                    <th scope="col" className="py-2 font-semibold">
                      Category
                    </th>
                    <th scope="col" className="py-2 text-right font-semibold">
                      Total Count
                    </th>
                  </tr>
                </thead>
                )}
                <tbody>
                  {otherTotals.map((t) => (
                    <tr key={t.name} className="border-b border-blue-100">
                      <td className="py-2.5 pr-4 font-medium text-blue-950">{t.name}</td>
                      <td className="py-2.5 text-right tabular-nums text-xl font-bold text-green-700">
                        {t.count}
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="border-b border-blue-100">
                    <th scope="row" className="pt-4 pb-2.5 text-base font-bold text-blue-950">
                      Male Total
                    </th>
                    <td className="pt-4 pb-2.5 text-right text-2xl font-bold text-blue-800 tabular-nums">
                      {maleTotal}
                    </td>
                  </tr>
                  <tr className="border-b-2 border-blue-200">
                    <th scope="row" className="py-2.5 text-base font-bold text-blue-950">
                      Female Total
                    </th>
                    <td className="py-2.5 text-right text-2xl font-bold text-blue-800 tabular-nums">
                      {femaleTotal}
                    </td>
                  </tr>
                  <tr>
                    <th scope="row" className="pt-4 text-xl font-bold text-blue-950">
                      Grand Total
                    </th>
                    <td className="pt-4 text-right text-4xl font-bold text-blue-700 tabular-nums">
                      {grandTotal}
                    </td>
                  </tr>
                </tfoot>
              </table>
            </section>

            {/* Individual submissions */}
            <section>
              <h2 className="mb-4 text-lg font-bold text-blue-900">
                Individual Submissions [{shownLabel}] ({shown.length})
              </h2>
              {shown.length === 0 && (
                <p className="rounded-xl border border-blue-200 bg-blue-50 p-6 text-center text-blue-700">
                  No submissions on this day.
                </p>
              )}
              <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {[...shown].reverse().map((sub) => {
                  const subTotal = (sub?.tallies || []).reduce((s, t) => s + (Number(t?.count) || 0), 0)
                  const subDate = new Date(sub.submittedAt)
                  const formattedDate = isNaN(subDate.getTime()) ? 'Date unavailable' : subDate.toLocaleString()
                  return (
                    <li
                      key={sub.id}
                      className="rounded-xl border border-blue-200 bg-white p-4 shadow-sm"
                    >
                      <div className="mb-3 flex items-start justify-between gap-2">
                        <div>
                          <p className="font-semibold text-blue-950">{sub.submittedBy || 'Counter'}</p>
                          {sub.service && (
                            <p className="text-sm font-medium text-blue-800">Service: {sub.service}</p>
                          )}
                          <p className="text-xs text-blue-500">
                            {formattedDate}
                          </p>
                        </div>
                        <button
                          type="button"
                          onClick={() => handleRemoveSubmission(sub.id)}
                          aria-label={`Remove submission from ${sub.submittedBy}`}
                          className="shrink-0 cursor-pointer rounded px-2 py-1 text-xs font-medium text-red-600 hover:bg-red-50"
                        >
                          Remove
                        </button>
                      </div>
                      <table className="w-full text-sm">
                        <tbody>
                          {sub.tallies.map((t) => (
                            <tr key={t.name} className="border-b border-blue-100">
                              <td className="py-1.5 pr-3 text-blue-700">{t.name}</td>
                              <td className="py-1.5 text-right font-bold tabular-nums text-blue-950">
                                {t.count}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                        <tfoot>
                          <tr>
                            <td className="pt-2 text-xs font-semibold text-blue-500">Subtotal</td>
                            <td className="pt-2 text-right font-bold text-green-700 tabular-nums">
                              {subTotal}
                            </td>
                          </tr>
                        </tfoot>
                      </table>
                    </li>
                  )
                })}
              </ul>
            </section>
          </>
        )}
      </main>
    </div>
  )
}
