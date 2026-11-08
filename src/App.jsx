import { useEffect, useRef, useState } from 'react'
import TallyCard from './components/TallyCard.jsx'
import AdminPage from './components/AdminPage.jsx'
import Calculator from './components/Calculator.jsx'
import { submitTallyToCloud } from './firebase.js'

const MIN_NAMES = 2
const MAX_NAME_LENGTH = 40
const STORAGE_KEY = 'tally-counter'
const SUBMISSIONS_KEY = 'tally-submissions'
const BROADCAST_CHANNEL = 'tally-counter-channel'

function isValidTally(tally) {
  return (
    typeof tally?.name === 'string' &&
    tally.name.trim() !== '' &&
    tally.name.length <= MAX_NAME_LENGTH &&
    Number.isSafeInteger(tally.count) &&
    tally.count >= 0
  )
}

// Saved data can be edited outside the app, so only well-formed, unique
// entries are accepted, and only the expected fields are kept.
function loadTallies() {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY))
    if (!Array.isArray(saved)) return []

    const seen = new Set()
    return saved.filter(isValidTally).flatMap(({ name, count }) => {
      const key = name.toLowerCase()
      if (seen.has(key)) return []
      seen.add(key)
      return [{ name, count }]
    })
  } catch {
    return []
  }
}

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

export default function App() {
  const [tallies, setTallies] = useState(loadTallies)
  const [name, setName] = useState('')
  const [error, setError] = useState('')
  const [showTotal, setShowTotal] = useState(false)
  const [page, setPage] = useState('counter') // 'counter' | 'admin' | 'calculator'
  const [menuOpen, setMenuOpen] = useState(false)
  const [submitterName, setSubmitterName] = useState('')
  const [submitterError, setSubmitterError] = useState('')
  const [showSubmitForm, setShowSubmitForm] = useState(false)
  const [submitSuccess, setSubmitSuccess] = useState(false)
  const inputRef = useRef(null)

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(tallies))
    } catch {
      // The counter still works for this visit if storage is unavailable.
    }
  }, [tallies])

  const namesNeeded = Math.max(MIN_NAMES - tallies.length, 0)
  const isUnlocked = namesNeeded === 0
  const total = tallies.reduce((sum, t) => sum + t.count, 0)

  function handleAdd(event) {
    event.preventDefault()
    const trimmed = name.trim().slice(0, MAX_NAME_LENGTH)

    if (!trimmed) {
      setError('Type a name first.')
    } else if (
      tallies.some((t) => t.name.toLowerCase() === trimmed.toLowerCase())
    ) {
      setError(`"${trimmed}" is already on your list.`)
    } else {
      setTallies([...tallies, { name: trimmed, count: 0 }])
      setName('')
      setError('')
    }
    inputRef.current.focus()
  }

  function changeCount(targetName, getNewCount) {
    setTallies((current) =>
      current.map((t) =>
        t.name === targetName ? { ...t, count: getNewCount(t.count) } : t,
      ),
    )
  }

  function handleDelete(targetName) {
    setTallies((current) => current.filter((t) => t.name !== targetName))
  }

  function handleSubmitToHOD(e) {
    e.preventDefault()
    const label = submitterName.trim()
    if (!label) {
      setSubmitterError('Please enter your name or station.')
      return
    }

    const submission = {
      id: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
      submittedBy: label,
      submittedAt: new Date().toISOString(),
      tallies: tallies.map(({ name, count }) => ({ name, count })),
    }

    const existing = loadSubmissions()
    const updated = [...existing, submission]
    saveSubmissions(updated)

    // Sync to Firestore cloud database (for cross-device access)
    submitTallyToCloud(submission).catch((err) => {
      console.warn('Could not sync to cloud:', err)
    })

    // Notify local admin tabs in real time
    try {
      const channel = new BroadcastChannel(BROADCAST_CHANNEL)
      channel.postMessage({ type: 'new-submission' })
      channel.close()
    } catch {}

    setShowSubmitForm(false)
    setSubmitterName('')
    setSubmitterError('')
    setSubmitSuccess(true)
    setTimeout(() => setSubmitSuccess(false), 4000)
  }

  if (page === 'admin') {
    return (
      <AdminPage
        onBack={() => setPage('counter')}
        onNavigate={(p) => setPage(p)}
      />
    )
  }

  if (page === 'calculator') {
    return (
      <Calculator
        onBack={() => setPage('counter')}
        onNavigate={(p) => setPage(p)}
      />
    )
  }

  return (
    <div className="min-h-screen bg-white text-blue-950">
      <header className="bg-blue-700 text-white">
        <div className="mx-auto flex max-w-5xl items-center justify-between gap-4 px-4 py-4 sm:gap-6 sm:px-6">
          <div className="flex items-center gap-3 sm:gap-5 min-w-0">
            <img
              src="/logo.png"
              alt="The Royal Usher, The Redeemed Christian Church of God"
              width="512"
              height="512"
              className="size-20 shrink-0 sm:size-28"
            />
            <div className="min-w-0">
              <h1 className="text-2xl sm:text-3xl font-bold tracking-tight">Tally Counter</h1>
              <p className="mt-0.5 text-xs sm:text-sm text-blue-100">
                Add at least {MIN_NAMES} names, then start counting.
              </p>
            </div>
          </div>

          {/* Desktop Menu Bar */}
          <nav aria-label="Main menu" className="hidden sm:flex items-center gap-2">
            <button
              type="button"
              onClick={() => setPage('counter')}
              className={`cursor-pointer rounded-lg px-4 py-2 text-sm font-semibold transition-colors ${
                page === 'counter'
                  ? 'bg-white text-blue-900 shadow-sm'
                  : 'text-blue-100 hover:bg-blue-800'
              }`}
            >
              Counter
            </button>
            <button
              type="button"
              onClick={() => setPage('calculator')}
              className="cursor-pointer rounded-lg border border-blue-400/60 bg-blue-800/40 px-4 py-2 text-sm font-semibold text-blue-100 transition-colors hover:bg-blue-800"
            >
              Calculator
            </button>
            <button
              type="button"
              onClick={() => setPage('admin')}
              className="cursor-pointer rounded-lg border border-blue-400/60 bg-blue-800/40 px-4 py-2 text-sm font-semibold text-blue-100 transition-colors hover:bg-blue-800"
            >
              Admin
            </button>
          </nav>

          {/* Mobile Hamburger Menu Button */}
          <div className="relative sm:hidden">
            <button
              type="button"
              onClick={() => setMenuOpen(!menuOpen)}
              aria-expanded={menuOpen}
              aria-label="Toggle navigation menu"
              className="cursor-pointer rounded-lg border border-blue-400/60 bg-blue-800/50 p-2.5 text-white hover:bg-blue-800 focus:outline-none"
            >
              <svg
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.5"
                strokeLinecap="round"
                className="h-6 w-6"
              >
                {menuOpen ? (
                  <path d="M18 6L6 18M6 6l12 12" />
                ) : (
                  <path d="M4 6h16M4 12h16M4 18h16" />
                )}
              </svg>
            </button>

            {/* Mobile Dropdown Menu */}
            {menuOpen && (
              <div
                className="absolute right-0 top-full mt-2 w-48 rounded-xl border border-blue-100 bg-white p-2 text-blue-950 shadow-2xl z-50 animate-in fade-in"
              >
                <button
                  type="button"
                  onClick={() => {
                    setPage('counter')
                    setMenuOpen(false)
                  }}
                  className={`w-full text-left rounded-lg px-3 py-2.5 text-sm font-semibold transition-colors ${
                    page === 'counter' ? 'bg-blue-50 text-blue-700 font-bold' : 'hover:bg-blue-50'
                  }`}
                >
                  Counter
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setPage('calculator')
                    setMenuOpen(false)
                  }}
                  className="w-full text-left rounded-lg px-3 py-2.5 text-sm font-semibold hover:bg-blue-50 transition-colors"
                >
                  Calculator
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setPage('admin')
                    setMenuOpen(false)
                  }}
                  className="w-full text-left rounded-lg px-3 py-2.5 text-sm font-semibold hover:bg-blue-50 transition-colors"
                >
                  Admin
                </button>
              </div>
            )}
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-5xl px-4 py-8 sm:px-6">
        <form onSubmit={handleAdd} noValidate>
          <label htmlFor="tally-name" className="block font-semibold">
            What do you want to count?
          </label>
          <div className="mt-2 flex flex-col gap-3 sm:flex-row">
            <input
              id="tally-name"
              ref={inputRef}
              type="text"
              value={name}
              maxLength={MAX_NAME_LENGTH}
              autoComplete="off"
              placeholder="eg Female Teenagers"
              aria-invalid={Boolean(error)}
              aria-describedby={error ? 'name-error' : undefined}
              onChange={(event) => {
                setName(event.target.value)
                setError('')
              }}
              className="min-w-0 flex-1 rounded-lg border-2 border-blue-200 bg-white px-4 py-3 outline-none placeholder:text-blue-400 focus:border-blue-700"
            />
            <button
              type="submit"
              className="cursor-pointer rounded-lg bg-green-700 px-6 py-3 font-semibold text-white transition-colors hover:bg-green-800 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-green-700"
            >
              Add name
            </button>
          </div>
          {error && (
            <p id="name-error" role="alert" className="mt-2 text-sm font-medium text-blue-800">
              {error}
            </p>
          )}
        </form>

        <section
          aria-live="polite"
          className={`mt-6 rounded-lg border px-4 py-3 ${
            isUnlocked
              ? 'border-green-200 bg-green-50 text-green-800'
              : 'border-blue-200 bg-blue-50 text-blue-800'
          }`}
        >
          <div className="flex items-center justify-between gap-4">
            <p className="font-medium">
              {isUnlocked
                ? 'Counting is on.'
                : `Add ${namesNeeded} more ${namesNeeded === 1 ? 'name' : 'names'} to start counting.`}
            </p>
            <p className="shrink-0 text-sm font-semibold tabular-nums">
              {tallies.length} {tallies.length === 1 ? 'name' : 'names'}
            </p>
          </div>
          <div
            className="mt-2 grid gap-1.5"
            style={{ gridTemplateColumns: `repeat(${MIN_NAMES}, 1fr)` }}
            aria-hidden="true"
          >
            {Array.from({ length: MIN_NAMES }, (_, index) => (
              <span
                key={index}
                className={`h-1.5 rounded-full ${
                  index < tallies.length ? 'bg-green-600' : 'bg-blue-200'
                }`}
              />
            ))}
          </div>
        </section>

        {tallies.length > 0 && (
          <ul className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {tallies.map((tally) => (
              <TallyCard
                key={tally.name}
                name={tally.name}
                count={tally.count}
                isUnlocked={isUnlocked}
                onIncrement={() => changeCount(tally.name, (c) => c + 1)}
                onDecrement={() =>
                  changeCount(tally.name, (c) => Math.max(c - 1, 0))
                }
                onReset={() => changeCount(tally.name, () => 0)}
                onDelete={() => handleDelete(tally.name)}
              />
            ))}
          </ul>
        )}

        {tallies.length > 0 && (
          <section className="mt-8 flex flex-col gap-4 sm:flex-row sm:items-start">
            {/* Total toggle */}
            <div className="flex-1">
              <button
                type="button"
                onClick={() => setShowTotal((shown) => !shown)}
                aria-expanded={showTotal}
                aria-controls="total-summary"
                className="w-full cursor-pointer rounded-lg bg-blue-700 px-6 py-3 font-semibold text-white transition-colors hover:bg-blue-800 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-700 sm:w-auto"
              >
                {showTotal ? 'Hide total' : 'Total'}
              </button>

              {showTotal && (
                <div
                  id="total-summary"
                  aria-live="polite"
                  className="mt-4 rounded-xl border border-blue-200 bg-blue-50 p-5"
                >
                  <table className="w-full text-left">
                    <caption className="sr-only">Count for each name and the total</caption>
                    <thead>
                      <tr className="border-b border-blue-200 text-sm text-blue-800">
                        <th scope="col" className="py-2 font-semibold">Name</th>
                        <th scope="col" className="py-2 text-right font-semibold">Count</th>
                      </tr>
                    </thead>
                    <tbody>
                      {tallies.map((tally) => (
                        <tr key={tally.name} className="border-b border-blue-100">
                          <td className="py-2 pr-4 wrap-break-word">{tally.name}</td>
                          <td className="py-2 text-right tabular-nums">{tally.count}</td>
                        </tr>
                      ))}
                    </tbody>
                    <tfoot>
                      <tr>
                        <th scope="row" className="pt-3 text-xl font-bold">Total</th>
                        <td className="pt-3 text-right text-3xl font-bold text-blue-700 tabular-nums">
                          {total}
                        </td>
                      </tr>
                    </tfoot>
                  </table>
                </div>
              )}
            </div>

            {/* Submit to HOD */}
            <div className="sm:shrink-0">
              {submitSuccess ? (
                <div
                  role="status"
                  aria-live="polite"
                  className="rounded-lg border border-green-300 bg-green-50 px-6 py-3 text-center font-semibold text-green-800"
                >
                  Submitted to HOD!
                </div>
              ) : showSubmitForm ? (
                <form
                  onSubmit={handleSubmitToHOD}
                  noValidate
                  className="rounded-xl border border-blue-200 bg-blue-50 p-4"
                >
                  <label htmlFor="submitter-name" className="block text-sm font-semibold text-blue-900">
                    Your name / station
                  </label>
                  <input
                    id="submitter-name"
                    type="text"
                    required
                    value={submitterName}
                    maxLength={40}
                    autoComplete="off"
                    placeholder="e.g. Gate A Usher"
                    aria-invalid={Boolean(submitterError)}
                    aria-describedby={submitterError ? 'submitter-error' : undefined}
                    onChange={(e) => {
                      setSubmitterName(e.target.value)
                      setSubmitterError('')
                    }}
                    className="mt-2 w-full rounded-lg border-2 border-blue-200 bg-white px-3 py-2 text-sm outline-none placeholder:text-blue-400 focus:border-blue-700"
                  />
                  {submitterError && (
                    <p id="submitter-error" role="alert" className="mt-1.5 text-xs font-semibold text-red-600">
                      {submitterError}
                    </p>
                  )}
                  <div className="mt-3 flex gap-2">
                    <button
                      type="submit"
                      className="flex-1 cursor-pointer rounded-lg bg-blue-700 py-2 text-sm font-semibold text-white transition-colors hover:bg-blue-800"
                    >
                      Confirm Submit
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setShowSubmitForm(false)
                        setSubmitterError('')
                      }}
                      className="cursor-pointer rounded-lg border-2 border-blue-200 px-4 py-2 text-sm font-semibold text-blue-700 transition-colors hover:bg-blue-100"
                    >
                      Cancel
                    </button>
                  </div>
                </form>
              ) : (
                <button
                  type="button"
                  onClick={() => setShowSubmitForm(true)}
                  className="w-full cursor-pointer rounded-lg bg-green-700 px-6 py-3 font-semibold text-white transition-colors hover:bg-green-800 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-green-700 sm:w-auto"
                >
                  Submit to HOD
                </button>
              )}
            </div>
          </section>
        )}
      </main>
    </div>
  )
}
