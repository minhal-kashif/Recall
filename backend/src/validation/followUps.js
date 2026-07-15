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

  if (!isValidDate(body.due_date)) {
    errors.push('due_date must be a valid date');
  } else {
    followUp.due_date = new Date(body.due_date).toISOString();
  }

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
    if (!isValidDate(body.due_date)) {
      errors.push('due_date must be a valid date');
    } else {
      update.due_date = new Date(body.due_date).toISOString();
    }
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
