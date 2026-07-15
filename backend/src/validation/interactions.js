const NOTE_TEXT_MAX_LENGTH = 5000;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function isNonEmptyString(value) {
  return typeof value === 'string' && value.trim().length > 0;
}

// Validates a new-interaction payload. Returns { errors, interaction }.
function validateInteractionInput(body) {
  const errors = [];
  const interaction = {};

  if (!isNonEmptyString(body.contact_id) || !UUID_RE.test(body.contact_id.trim())) {
    errors.push('contact_id must be a valid id');
  } else {
    interaction.contact_id = body.contact_id.trim();
  }

  if (!isNonEmptyString(body.note_text)) {
    errors.push('note_text is required');
  } else {
    const noteText = body.note_text.trim();
    if (noteText.length > NOTE_TEXT_MAX_LENGTH) {
      errors.push(`note_text must be ${NOTE_TEXT_MAX_LENGTH} characters or fewer`);
    } else {
      interaction.note_text = noteText;
    }
  }

  return { errors, interaction };
}

module.exports = { validateInteractionInput };
