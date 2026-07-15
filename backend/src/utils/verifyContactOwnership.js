// Confirms contactId is a contact the caller actually owns before letting
// them attach an interaction/follow-up to it (SECURITY_AUDIT.md M7). Reuses
// RLS itself as the source of truth: a user-scoped client can only ever see
// its own contacts, so a miss here means "not found or not yours" — both of
// which should read as 404 to the caller.
async function verifyContactOwnership(db, contactId) {
  const { data } = await db.from('contacts').select('id').eq('id', contactId).maybeSingle();
  return Boolean(data);
}

module.exports = verifyContactOwnership;
