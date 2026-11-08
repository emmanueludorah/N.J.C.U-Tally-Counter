import { useState, useEffect } from 'react'

export default function Calculator({ onBack, onNavigate }) {
  const [display, setDisplay] = useState('0')
  const [prevValue, setPrevValue] = useState(null)
  const [operation, setOperation] = useState(null)
  const [waitingForOperand, setWaitingForOperand] = useState(false)
  const [history, setHistory] = useState('')

  function handleDigit(digit) {
    if (waitingForOperand) {
      setDisplay(String(digit))
      setWaitingForOperand(false)
    } else {
      setDisplay(display === '0' ? String(digit) : display + digit)
    }
  }

  function handleDecimal() {
    if (waitingForOperand) {
      setDisplay('0.')
      setWaitingForOperand(false)
      return
    }

    if (!display.includes('.')) {
      setDisplay(display + '.')
    }
  }

  function handleClear() {
    setDisplay('0')
    setPrevValue(null)
    setOperation(null)
    setWaitingForOperand(false)
    setHistory('')
  }

  function handleToggleSign() {
    const value = parseFloat(display)
    if (value === 0) return
    setDisplay(String(-value))
  }

  function handlePercent() {
    const value = parseFloat(display)
    if (isNaN(value)) return
    setDisplay(String(value / 100))
  }

  function performCalculation(op, first, second) {
    switch (op) {
      case '+':
        return first + second
      case '−':
      case '-':
        return first - second
      case '×':
      case '*':
        return first * second
      case '÷':
      case '/':
        return second === 0 ? 'Error' : first / second
      default:
        return second
    }
  }

  function handleOperation(nextOperation) {
    const inputValue = parseFloat(display)

    if (prevValue == null) {
      setPrevValue(inputValue)
      setHistory(`${display} ${nextOperation}`)
    } else if (operation) {
      const currentValue = prevValue || 0
      const result = performCalculation(operation, currentValue, inputValue)

      if (result === 'Error') {
        setDisplay('Error')
        setPrevValue(null)
        setOperation(null)
        setWaitingForOperand(true)
        setHistory('')
        return
      }

      setPrevValue(result)
      setDisplay(String(Number(result.toFixed(8))))
      setHistory(`${Number(result.toFixed(8))} ${nextOperation}`)
    }

    setWaitingForOperand(true)
    setOperation(nextOperation)
  }

  function handleEquals() {
    const inputValue = parseFloat(display)

    if (operation && prevValue != null) {
      const result = performCalculation(operation, prevValue, inputValue)

      if (result === 'Error') {
        setDisplay('Error')
        setHistory('')
      } else {
        const formatted = String(Number(result.toFixed(8)))
        setHistory(`${prevValue} ${operation} ${inputValue} =`)
        setDisplay(formatted)
      }

      setPrevValue(null)
      setOperation(null)
      setWaitingForOperand(true)
    }
  }

  // Keyboard support
  useEffect(() => {
    function handleKeyDown(e) {
      const key = e.key
      if (/^[0-9]$/.test(key)) {
        handleDigit(parseInt(key, 10))
      } else if (key === '.') {
        handleDecimal()
      } else if (key === '+' || key === '-') {
        handleOperation(key === '-' ? '−' : '+')
      } else if (key === '*' || key === 'x' || key === 'X') {
        handleOperation('×')
      } else if (key === '/') {
        e.preventDefault()
        handleOperation('÷')
      } else if (key === 'Enter' || key === '=') {
        e.preventDefault()
        handleEquals()
      } else if (key === 'Escape' || key === 'c' || key === 'C') {
        handleClear()
      } else if (key === 'Backspace') {
        if (!waitingForOperand && display.length > 1) {
          setDisplay(display.slice(0, -1))
        } else {
          setDisplay('0')
        }
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  })

  return (
    <div className="min-h-screen bg-white text-blue-950">
      {/* Header */}
      <header className="border-b border-blue-200 bg-white">
        <div className="mx-auto flex max-w-5xl items-center justify-between gap-4 px-4 py-4 sm:px-6">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-blue-700 text-white font-bold text-lg">
              ±
            </div>
            <div>
              <h1 className="text-xl font-bold text-blue-950">Basic Calculator</h1>
              <p className="text-xs text-blue-500">Quick additions & calculations</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {onNavigate && (
              <button
                type="button"
                onClick={() => onNavigate('admin')}
                className="cursor-pointer rounded-lg border border-blue-300 bg-white px-3 py-2 text-sm font-semibold text-blue-700 transition-colors hover:bg-blue-50"
              >
                Admin
              </button>
            )}
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

      {/* Main calculator container */}
      <main className="mx-auto flex max-w-md flex-col px-4 py-8">
        <div className="overflow-hidden rounded-2xl border-2 border-blue-200 bg-white p-5 shadow-lg">
          {/* Display */}
          <div className="mb-4 rounded-xl border border-blue-100 bg-blue-50/70 p-4 text-right">
            <div className="h-5 text-xs font-semibold text-blue-500 overflow-hidden">
              {history || '\u00A0'}
            </div>
            <div
              className="mt-1 truncate text-4xl font-bold text-blue-950 tabular-nums sm:text-5xl"
              title={display}
            >
              {display}
            </div>
          </div>

          {/* Keypad Grid */}
          <div className="grid grid-cols-4 gap-2.5">
            {/* Row 1 */}
            <button
              type="button"
              onClick={handleClear}
              className="cursor-pointer rounded-xl bg-red-100 py-4 text-lg font-bold text-red-700 transition-colors hover:bg-red-200 active:scale-95"
            >
              C
            </button>
            <button
              type="button"
              onClick={handleToggleSign}
              className="cursor-pointer rounded-xl bg-blue-100 py-4 text-lg font-bold text-blue-900 transition-colors hover:bg-blue-200 active:scale-95"
            >
              ±
            </button>
            <button
              type="button"
              onClick={handlePercent}
              className="cursor-pointer rounded-xl bg-blue-100 py-4 text-lg font-bold text-blue-900 transition-colors hover:bg-blue-200 active:scale-95"
            >
              %
            </button>
            <button
              type="button"
              onClick={() => handleOperation('÷')}
              className={`cursor-pointer rounded-xl py-4 text-xl font-bold transition-colors active:scale-95 ${
                operation === '÷'
                  ? 'bg-blue-900 text-white'
                  : 'bg-blue-700 text-white hover:bg-blue-800'
              }`}
            >
              ÷
            </button>

            {/* Row 2 */}
            <button
              type="button"
              onClick={() => handleDigit(7)}
              className="cursor-pointer rounded-xl border border-blue-100 bg-white py-4 text-2xl font-semibold text-blue-950 shadow-sm transition-colors hover:bg-blue-50 active:scale-95"
            >
              7
            </button>
            <button
              type="button"
              onClick={() => handleDigit(8)}
              className="cursor-pointer rounded-xl border border-blue-100 bg-white py-4 text-2xl font-semibold text-blue-950 shadow-sm transition-colors hover:bg-blue-50 active:scale-95"
            >
              8
            </button>
            <button
              type="button"
              onClick={() => handleDigit(9)}
              className="cursor-pointer rounded-xl border border-blue-100 bg-white py-4 text-2xl font-semibold text-blue-950 shadow-sm transition-colors hover:bg-blue-50 active:scale-95"
            >
              9
            </button>
            <button
              type="button"
              onClick={() => handleOperation('×')}
              className={`cursor-pointer rounded-xl py-4 text-xl font-bold transition-colors active:scale-95 ${
                operation === '×'
                  ? 'bg-blue-900 text-white'
                  : 'bg-blue-700 text-white hover:bg-blue-800'
              }`}
            >
              ×
            </button>

            {/* Row 3 */}
            <button
              type="button"
              onClick={() => handleDigit(4)}
              className="cursor-pointer rounded-xl border border-blue-100 bg-white py-4 text-2xl font-semibold text-blue-950 shadow-sm transition-colors hover:bg-blue-50 active:scale-95"
            >
              4
            </button>
            <button
              type="button"
              onClick={() => handleDigit(5)}
              className="cursor-pointer rounded-xl border border-blue-100 bg-white py-4 text-2xl font-semibold text-blue-950 shadow-sm transition-colors hover:bg-blue-50 active:scale-95"
            >
              5
            </button>
            <button
              type="button"
              onClick={() => handleDigit(6)}
              className="cursor-pointer rounded-xl border border-blue-100 bg-white py-4 text-2xl font-semibold text-blue-950 shadow-sm transition-colors hover:bg-blue-50 active:scale-95"
            >
              6
            </button>
            <button
              type="button"
              onClick={() => handleOperation('−')}
              className={`cursor-pointer rounded-xl py-4 text-xl font-bold transition-colors active:scale-95 ${
                operation === '−'
                  ? 'bg-blue-900 text-white'
                  : 'bg-blue-700 text-white hover:bg-blue-800'
              }`}
            >
              −
            </button>

            {/* Row 4 */}
            <button
              type="button"
              onClick={() => handleDigit(1)}
              className="cursor-pointer rounded-xl border border-blue-100 bg-white py-4 text-2xl font-semibold text-blue-950 shadow-sm transition-colors hover:bg-blue-50 active:scale-95"
            >
              1
            </button>
            <button
              type="button"
              onClick={() => handleDigit(2)}
              className="cursor-pointer rounded-xl border border-blue-100 bg-white py-4 text-2xl font-semibold text-blue-950 shadow-sm transition-colors hover:bg-blue-50 active:scale-95"
            >
              2
            </button>
            <button
              type="button"
              onClick={() => handleDigit(3)}
              className="cursor-pointer rounded-xl border border-blue-100 bg-white py-4 text-2xl font-semibold text-blue-950 shadow-sm transition-colors hover:bg-blue-50 active:scale-95"
            >
              3
            </button>
            <button
              type="button"
              onClick={() => handleOperation('+')}
              className={`cursor-pointer rounded-xl py-4 text-xl font-bold transition-colors active:scale-95 ${
                operation === '+'
                  ? 'bg-blue-900 text-white'
                  : 'bg-blue-700 text-white hover:bg-blue-800'
              }`}
            >
              +
            </button>

            {/* Row 5 */}
            <button
              type="button"
              onClick={() => handleDigit(0)}
              className="col-span-2 cursor-pointer rounded-xl border border-blue-100 bg-white py-4 text-2xl font-semibold text-blue-950 shadow-sm transition-colors hover:bg-blue-50 active:scale-95"
            >
              0
            </button>
            <button
              type="button"
              onClick={handleDecimal}
              className="cursor-pointer rounded-xl border border-blue-100 bg-white py-4 text-2xl font-semibold text-blue-950 shadow-sm transition-colors hover:bg-blue-50 active:scale-95"
            >
              .
            </button>
            <button
              type="button"
              onClick={handleEquals}
              className="cursor-pointer rounded-xl bg-green-700 py-4 text-2xl font-bold text-white transition-colors hover:bg-green-800 active:scale-95"
            >
              =
            </button>
          </div>
        </div>
      </main>
    </div>
  )
}
