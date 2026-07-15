const STATUSES = ['pending', 'done', 'snoozed'];
const DESCRIPTION_MAX_LENGTH = 500;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function isNonEmptyString(value) {
  return typeof value === 'string' && value.trim().length > 0;
}

function isValidDate(value) {
  if (!isNonEmptyString(value)) return false;
  const parsed = new Date(value);
  return !Number.isNaN(parsed.getTime());
}

// Parses due_date and requires it to be in the future — a follow-up
// reminder due in the past makes no sense. Pushes an error and returns
// undefined on failure so callers can just skip assigning the field.
function parseFutureDueDate(value, errors) {
  if (!isValidDate(value)) {
    errors.push('due_date must be a valid date');
    return undefined;
  }
  const parsed = new Date(value);
  if (parsed.getTime() <= Date.now()) {
    errors.push('due_date must be in the future');
    return undefined;
  }
  return parsed.toISOString();
}

// Validates a new-follow-up payload. Returns { errors, followUp }.
function validateFollowUpInput(body) {
  const errors = [];
  const followUp = {};

  if (!isNonEmptyString(body.contact_id) || !UUID_RE.test(body.contact_id.trim())) {
    errors.push('contact_id must be a valid id');
  } else {
    followUp.contact_id = body.contact_id.trim();
  }

  if (!isNonEmptyString(body.description)) {
    errors.push('description is required');
  } else {
    const description = body.description.trim();
    if (description.length > DESCRIPTION_MAX_LENGTH) {
      errors.push(`description must be ${DESCRIPTION_MAX_LENGTH} characters or fewer`);
    } else {
      followUp.description = description;
    }
  }

  const dueDate = parseFutureDueDate(body.due_date, errors);
  if (dueDate) followUp.due_date = dueDate;

  return { errors, followUp };
}

// Validates a follow-up update (mark done / snooze / reschedule). All fields
// optional, but at least one of status/due_date must be present.
function validateFollowUpUpdate(body) {
  const errors = [];
  const update = {};

  if (body.status !== undefined) {
    if (!STATUSES.includes(body.status)) {
      errors.push(`status must be one of: ${STATUSES.join(', ')}`);
    } else {
      update.status = body.status;
    }
  }

  if (body.due_date !== undefined) {
    const dueDate = parseFutureDueDate(body.due_date, errors);
    if (dueDate) update.due_date = dueDate;
  }

  if (body.description !== undefined) {
    if (!isNonEmptyString(body.description)) {
      errors.push('description cannot be empty');
    } else {
      const description = body.description.trim();
      if (description.length > DESCRIPTION_MAX_LENGTH) {
        errors.push(`description must be ${DESCRIPTION_MAX_LENGTH} characters or fewer`);
      } else {
        update.description = description;
      }
    }
  }

  if (Object.keys(update).length === 0 && errors.length === 0) {
    errors.push('at least one of status, due_date, description must be provided');
  }

  return { errors, update };
}

module.exports = { validateFollowUpInput, validateFollowUpUpdate, STATUSES };
