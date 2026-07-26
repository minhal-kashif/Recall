import { useState } from 'react'

const HOURS_12 = Array.from({ length: 12 }, (_, i) => i + 1)
const MINUTES = ['00', '15', '30', '45']

export function todayDateString() {
  const now = new Date()
  const month = String(now.getMonth() + 1).padStart(2, '0')
  const day = String(now.getDate()).padStart(2, '0')
  return `${now.getFullYear()}-${month}-${day}`
}

export function isFutureDateTime(value) {
  if (!value) return false
  const parsed = new Date(value)
  return !Number.isNaN(parsed.getTime()) && parsed.getTime() > Date.now()
}

// Splits a "YYYY-MM-DDTHH:mm" value (the same format the old datetime-local
// input used) into date/hour(12h)/minute/am-per-pm parts for the selects below.
function parseDueDateParts(value) {
  if (!value) return { date: '', hour12: '', minute: '', ampm: '' }
  const [date, time] = value.split('T')
  if (!time) return { date, hour12: '', minute: '', ampm: '' }
  const [hStr, mStr] = time.split(':')
  const h = Number(hStr)
  const ampm = h >= 12 ? 'PM' : 'AM'
  const hour12 = h % 12 || 12
  return { date, hour12: String(hour12), minute: mStr, ampm }
}

// Inverse of parseDueDateParts — empty unless all four parts are chosen, so
// callers can gate submit buttons on "is this actually a complete value" for
// free instead of relying on native input validation.
function composeDueDateValue({ date, hour12, minute, ampm }) {
  if (!date || !hour12 || !minute || !ampm) return ''
  let h = Number(hour12) % 12
  if (ampm === 'PM') h += 12
  return `${date}T${String(h).padStart(2, '0')}:${minute}`
}

// Date picker + explicit Hour/Minute/AM-PM dropdowns, instead of a native
// datetime-local input — that widget validates its internal segments on
// blur (producing a confusing "invalid" popup before the user ever submits)
// and makes AM/PM a type-to-set segment rather than something you pick.
//
// Holds the in-progress selection in its own state rather than deriving it
// fresh from `value` every render: composeDueDateValue only returns a
// non-empty string once all four parts are filled, so a naive "derive from
// value" approach would erase a just-picked date the instant it's reported
// upward, since the round-tripped value is still '' until hour/min/AM-PM
// are also chosen. Parent can still force a reset (e.g. after a successful
// submit) by changing this component's `key`.
function DueDateTimeInput({ value, onChange, minDate, label }) {
  const [parts, setParts] = useState(() => parseDueDateParts(value))
  const update = (patch) => {
    const next = { ...parts, ...patch }
    setParts(next)
    onChange(composeDueDateValue(next))
  }

  return (
    <span>
      <input
        type="date"
        aria-label={`${label} date`}
        value={parts.date}
        min={minDate}
        onChange={(e) => update({ date: e.target.value })}
      />{' '}
      <select aria-label={`${label} hour`} value={parts.hour12} onChange={(e) => update({ hour12: e.target.value })}>
        <option value="">Hour</option>
        {HOURS_12.map((h) => (
          <option key={h} value={h}>
            {h}
          </option>
        ))}
      </select>{' '}
      <select aria-label={`${label} minute`} value={parts.minute} onChange={(e) => update({ minute: e.target.value })}>
        <option value="">Min</option>
        {MINUTES.map((m) => (
          <option key={m} value={m}>
            {m}
          </option>
        ))}
      </select>{' '}
      <select aria-label={`${label} AM or PM`} value={parts.ampm} onChange={(e) => update({ ampm: e.target.value })}>
        <option value="">AM/PM</option>
        <option value="AM">AM</option>
        <option value="PM">PM</option>
      </select>
    </span>
  )
}

export default DueDateTimeInput
