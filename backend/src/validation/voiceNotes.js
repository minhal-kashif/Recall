const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function isNonEmptyString(value) {
  return typeof value === 'string' && value.trim().length > 0;
}

// Validates a voice-note upload's metadata fields. Returns
// { errors, contact_id, duration_seconds }. duration_seconds is
// client-reported (used for display only, not a security control) but is
// still range-checked to keep obviously bogus values out of the DB.
function validateVoiceNoteInput(body) {
  const errors = [];
  let contact_id;
  let duration_seconds;

  if (!isNonEmptyString(body.contact_id) || !UUID_RE.test(body.contact_id.trim())) {
    errors.push('contact_id must be a valid id');
  } else {
    contact_id = body.contact_id.trim();
  }

  if (body.duration_seconds !== undefined && body.duration_seconds !== null && body.duration_seconds !== '') {
    const parsed = Number(body.duration_seconds);
    if (!Number.isFinite(parsed) || parsed <= 0 || parsed > 600) {
      errors.push('duration_seconds must be a finite number greater than 0 and at most 600');
    } else {
      duration_seconds = parsed;
    }
  }

  return { errors, contact_id, duration_seconds };
}

module.exports = { validateVoiceNoteInput };
