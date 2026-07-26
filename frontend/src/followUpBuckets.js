function isSameCalendarDay(a, b) {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate()
}

// Buckets a follow-up by comparing its due_date to now: overdue (already
// past), today (due later today), or upcoming (a future calendar day) —
// mirrors how FUB/Salesforce split a follow-up feed instead of only
// showing what's already due.
export function bucketFor(dueDate) {
  const due = new Date(dueDate)
  const now = new Date()
  if (due.getTime() < now.getTime()) return 'overdue'
  if (isSameCalendarDay(due, now)) return 'today'
  return 'upcoming'
}

export function whenLabel(dueDate, bucket) {
  const due = new Date(dueDate)
  if (bucket === 'overdue') {
    const days = Math.max(1, Math.round((Date.now() - due.getTime()) / (1000 * 60 * 60 * 24)))
    return `${days} day${days === 1 ? '' : 's'} overdue`
  }
  if (bucket === 'today') {
    return due.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })
  }
  return due.toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' })
}
