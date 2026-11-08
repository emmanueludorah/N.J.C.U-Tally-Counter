import { useEffect, useRef, useState } from 'react'
import TallyCard from './components/TallyCard.jsx'

const MIN_NAMES = 2
const MAX_NAME_LENGTH = 40
const STORAGE_KEY = 'tally-counter'

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

export default function App() {
  const [tallies, setTallies] = useState(loadTallies)
  const [name, setName] = useState('')
  const [error, setError] = useState('')
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

  return (
    <div className="min-h-screen bg-white text-blue-950">
      <header className="bg-blue-700 text-white">
        <div className="mx-auto flex max-w-5xl items-center gap-4 px-4 py-4 sm:gap-6 sm:px-6">
          <img
            src="/logo.png"
            alt="The Royal Usher, The Redeemed Christian Church of God"
            width="512"
            height="512"
            className="size-24 shrink-0 sm:size-32"
          />
          <div className="min-w-0">
            <h1 className="text-3xl font-bold tracking-tight">Tally Counter</h1>
            <p className="mt-1 text-blue-100">
              Add at least {MIN_NAMES} names, then start counting.
            </p>
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
      </main>
    </div>
  )
}
