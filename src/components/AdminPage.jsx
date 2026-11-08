import { useEffect, useState, useCallback } from 'react'
import {
  subscribeToSubmissions,
  deleteSubmissionFromCloud,
  clearAllSubmissionsFromCloud,
} from '../firebase.js'

const ADMIN_PASSWORD = 'hod1234' // Change this to your preferred password
const SUBMISSIONS_KEY = 'tally-submissions'
const BROADCAST_CHANNEL = 'tally-counter-channel'

function loadSubmissions() {
  try {
    const saved = JSON.parse(localStorage.getItem(SUBMISSIONS_KEY))
    return Array.isArray(saved) ? saved : []
  } catch {
    return []
  }
}

function saveSubmissions(submissions) {
  try {
    localStorage.setItem(SUBMISSIONS_KEY, JSON.stringify(submissions))
  } catch {}
}

export default function AdminPage({ onBack, onNavigate }) {
  const [password, setPassword] = useState('')
  const [loggedIn, setLoggedIn] = useState(false)
  const [error, setError] = useState('')
  const [submissions, setSubmissions] = useState([])
  const [flash, setFlash] = useState(false)
  const [isCloudConnected, setIsCloudConnected] = useState(false)
  const [copied, setCopied] = useState(false)

  // Load submissions initially and subscribe to Firestore cloud updates
  useEffect(() => {
    if (!loggedIn) return

    // Load locally cached submissions immediately
    setSubmissions(loadSubmissions())

    // Connect to Firestore live updates
    const unsubscribe = subscribeToSubmissions(
      (items) => {
        setIsCloudConnected(true)
        setSubmissions(items)
        saveSubmissions(items)
        setFlash(true)
        setTimeout(() => setFlash(false), 800)
      },
      (err) => {
        setIsCloudConnected(false)
        console.warn('Live cloud sync warning:', err)
      },
    )

    // Also listen locally via BroadcastChannel/storage for immediate same-device events
    function refreshLocal() {
      setSubmissions(loadSubmissions())
      setFlash(true)
      setTimeout(() => setFlash(false), 800)
    }

    let channel = null
    if (typeof BroadcastChannel !== 'undefined') {
      channel = new BroadcastChannel(BROADCAST_CHANNEL)
      channel.onmessage = refreshLocal
    }
    window.addEventListener('storage', refreshLocal)

    return () => {
      if (typeof unsubscribe === 'function') unsubscribe()
      channel?.close()
      window.removeEventListener('storage', refreshLocal)
    }
  }, [loggedIn])

  // Build aggregated totals across all submissions
  const aggregated = useCallback(() => {
    const map = new Map()
    for (const submission of submissions) {
      for (const tally of submission.tallies) {
        map.set(tally.name, (map.get(tally.name) ?? 0) + tally.count)
      }
    }
    return [...map.entries()].map(([name, count]) => ({ name, count }))
  }, [submissions])

  const grandTotal = aggregated().reduce((sum, t) => sum + t.count, 0)

  function handleLogin(e) {
    e.preventDefault()
    if (password === ADMIN_PASSWORD) {
      setLoggedIn(true)
      setError('')
    } else {
      setError('Incorrect password. Please try again.')
    }
  }

  async function handleClearAll() {
    if (!window.confirm('Clear ALL submissions? This cannot be undone.')) return
    saveSubmissions([])
    setSubmissions([])
    try {
      await clearAllSubmissionsFromCloud()
    } catch (err) {
      console.warn('Could not clear cloud submissions:', err)
    }
  }

  async function handleRemoveSubmission(id) {
    const updated = submissions.filter((s) => s.id !== id)
    saveSubmissions(updated)
    setSubmissions(updated)
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
      '---------------------------------',
      ...aggList.map((t) => `${t.name}: ${t.count}`),
      '---------------------------------',
      `Grand Total: ${grandTotal}`,
      '',
      `Submissions (${submissions.length}):`,
      ...[...submissions].reverse().map((s) => {
        const subTotal = s.tallies.reduce((sum, t) => sum + t.count, 0)
        return `- ${s.submittedBy || 'Counter'}: ${subTotal}`
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
            <h2 className="text-2xl font-bold text-blue-950">HOD Admin Login</h2>
            <p className="mt-1 text-sm text-blue-600">Head of Department access only</p>
          </div>

          <form onSubmit={handleLogin} noValidate>
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
              className="mt-4 w-full cursor-pointer rounded-lg bg-blue-700 py-3 font-semibold text-white transition-colors hover:bg-blue-800"
            >
              Login
            </button>
          </form>

          <button
            type="button"
            onClick={onBack}
            className="mt-4 w-full cursor-pointer rounded-lg border-2 border-blue-200 py-3 text-sm font-semibold text-blue-700 transition-colors hover:bg-blue-50"
          >
            ← Back to Counter
          </button>
        </div>
      </div>
    )
  }

  const agg = aggregated()

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
              <h1 className="text-xl font-bold text-blue-950">HOD Admin Dashboard</h1>
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
              onClick={() => setLoggedIn(false)}
              className="cursor-pointer rounded-lg bg-red-600 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-red-700"
            >
              Logout
            </button>
            <button
              type="button"
              onClick={onBack}
              className="cursor-pointer rounded-lg bg-green-700 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-green-800"
            >
              ← Counter
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
            {isCloudConnected ? 'Connected to Firebase' : 'Sync ready'}
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
              <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
                <h2 className="text-lg font-bold text-blue-900">
                  Grand Total — All Submissions
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
              <table className="w-full text-left">
                <caption className="sr-only">Aggregated count totals across all submissions</caption>
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
                <tbody>
                  {agg.map((t) => (
                    <tr key={t.name} className="border-b border-blue-100">
                      <td className="py-2.5 pr-4 font-medium text-blue-950">{t.name}</td>
                      <td className="py-2.5 text-right tabular-nums text-xl font-bold text-green-700">
                        {t.count}
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
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
                Individual Submissions ({submissions.length})
              </h2>
              <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {[...submissions].reverse().map((sub) => {
                  const subTotal = sub.tallies.reduce((s, t) => s + t.count, 0)
                  return (
                    <li
                      key={sub.id}
                      className="rounded-xl border border-blue-200 bg-white p-4 shadow-sm"
                    >
                      <div className="mb-3 flex items-start justify-between gap-2">
                        <div>
                          <p className="font-semibold text-blue-950">{sub.submittedBy || 'Counter'}</p>
                          <p className="text-xs text-blue-500">
                            {new Date(sub.submittedAt).toLocaleString()}
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
