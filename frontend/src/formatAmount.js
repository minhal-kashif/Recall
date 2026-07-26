// Amounts are stored as absolute PKR numbers; display them the way the
// agent thinks — in Lakhs/Crores — rather than a long raw number.
function trim(n) {
  return Number(n.toFixed(2)).toString()
}

export function formatAmount(n) {
  if (n === null || n === undefined || n === '') return '—'
  const num = Number(n)
  if (num >= 1e7) return `${trim(num / 1e7)} Crore`
  if (num >= 1e5) return `${trim(num / 1e5)} Lakh`
  return num.toLocaleString()
}
