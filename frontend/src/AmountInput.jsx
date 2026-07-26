import { useState } from 'react'

const UNIT_MULTIPLIERS = { exact: 1, lakh: 100000, crore: 10000000 }

// Amounts (budget, asking price) are stored as absolute PKR numbers, but the
// agent thinks in lakhs/crores. This lets them type in whichever unit is
// convenient while the stored value stays absolute.
function AmountInput({ value, onChange, label }) {
  const initial = (() => {
    if (value === '' || value === null || value === undefined) {
      return { amount: '', unit: 'lakh' }
    }
    const num = Number(value)
    const unit = num >= 1e7 ? 'crore' : num >= 1e5 ? 'lakh' : 'exact'
    return { amount: String(num / UNIT_MULTIPLIERS[unit]), unit }
  })()

  const [amount, setAmount] = useState(initial.amount)
  const [unit, setUnit] = useState(initial.unit)

  const emit = (nextAmount, nextUnit) => {
    if (nextAmount === '') {
      onChange('')
      return
    }
    const absolute = Number(nextAmount) * UNIT_MULTIPLIERS[nextUnit]
    if (Number.isFinite(absolute) && absolute >= 0) {
      onChange(absolute)
    }
  }

  const handleAmountChange = (e) => {
    const next = e.target.value
    setAmount(next)
    emit(next, unit)
  }

  const handleUnitChange = (e) => {
    const next = e.target.value
    setUnit(next)
    emit(amount, next)
  }

  return (
    <span className="amount-input">
      <input
        type="number"
        step="any"
        min="0"
        aria-label={`${label} amount`}
        value={amount}
        onChange={handleAmountChange}
      />
      <select aria-label={`${label} unit`} value={unit} onChange={handleUnitChange}>
        <option value="exact">Exact</option>
        <option value="lakh">Lakh</option>
        <option value="crore">Crore</option>
      </select>
    </span>
  )
}

export default AmountInput
