const countButton =
  'cursor-pointer rounded-lg font-bold transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 disabled:cursor-not-allowed disabled:opacity-40'

export default function TallyCard({
  name,
  count,
  isUnlocked,
  onIncrement,
  onDecrement,
  onReset,
  onDelete,
}) {
  return (
    <li className="flex flex-col rounded-xl border border-blue-200 bg-white p-5 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <h2 className="min-w-0 text-lg font-semibold break-words">{name}</h2>
        <button
          type="button"
          onClick={onDelete}
          aria-label={`Delete ${name}`}
          className="shrink-0 cursor-pointer rounded-md px-2 py-1 text-sm font-medium text-blue-700 underline-offset-2 hover:bg-blue-50 hover:underline focus-visible:outline-2 focus-visible:outline-blue-700"
        >
          Delete
        </button>
      </div>

      <p
        aria-live="polite"
        aria-label={`${name} count: ${count}`}
        className="my-4 text-center text-6xl font-bold text-blue-700 tabular-nums"
      >
        {count}
      </p>

      <div className="mt-auto grid grid-cols-2 gap-2">
        <button
          type="button"
          onClick={onDecrement}
          disabled={!isUnlocked || count === 0}
          aria-label={`Subtract 1 from ${name}`}
          className={`${countButton} bg-red-700 py-3 text-2xl leading-none text-white hover:bg-red-800 focus-visible:outline-red-700 disabled:hover:bg-red-700`}
        >
          −
        </button>
        <button
          type="button"
          onClick={onIncrement}
          disabled={!isUnlocked}
          aria-label={`Add 1 to ${name}`}
          className={`${countButton} bg-green-700 py-3 text-2xl leading-none text-white hover:bg-green-800 focus-visible:outline-green-700 disabled:hover:bg-green-700`}
        >
          +
        </button>
        <button
          type="button"
          onClick={onReset}
          disabled={!isUnlocked || count === 0}
          aria-label={`Reset ${name} to 0`}
          className={`${countButton} col-span-2 border-2 border-blue-200 bg-white py-2 text-sm font-semibold text-blue-800 hover:bg-blue-50 focus-visible:outline-blue-700 disabled:hover:bg-white`}
        >
          Reset
        </button>
      </div>
    </li>
  )
}
