// Never forward raw DB error text to the client — it leaks schema/constraint
// internals (see SECURITY_AUDIT.md M1). Log the real error server-side only.
function dbError(res, label, error) {
  console.error(label, error);
  return res.status(500).json({ error: 'Something went wrong. Please try again.' });
}

module.exports = dbError;
