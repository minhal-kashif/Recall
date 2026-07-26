const CONTACT_TYPES = ['buyer', 'seller', 'lead', 'tenant'];
const PROPERTY_TYPES = ['house', 'apartment', 'plot'];
const NAME_MAX_LENGTH = 100;

function isNonEmptyString(value) {
  return typeof value === 'string' && value.trim().length > 0;
}

// Validates a new-saved-filter payload. Returns { errors, savedFilter }.
function validateSavedFilterInput(body) {
  const errors = [];
  const savedFilter = {};

  if (!isNonEmptyString(body.name)) {
    errors.push('name is required');
  } else {
    const name = body.name.trim();
    if (name.length > NAME_MAX_LENGTH) {
      errors.push(`name must be ${NAME_MAX_LENGTH} characters or fewer`);
    } else {
      savedFilter.name = name;
    }
  }

  if (body.q !== undefined) {
    savedFilter.q = isNonEmptyString(body.q) ? body.q.trim() : null;
  }

  if (body.type !== undefined) {
    if (body.type === '' || body.type === null) {
      savedFilter.type = null;
    } else if (!CONTACT_TYPES.includes(body.type)) {
      errors.push(`type must be one of: ${CONTACT_TYPES.join(', ')}`);
    } else {
      savedFilter.type = body.type;
    }
  }

  if (body.property_type !== undefined) {
    if (body.property_type === '' || body.property_type === null) {
      savedFilter.property_type = null;
    } else if (!PROPERTY_TYPES.includes(body.property_type)) {
      errors.push(`property_type must be one of: ${PROPERTY_TYPES.join(', ')}`);
    } else {
      savedFilter.property_type = body.property_type;
    }
  }

  if (body.area_of_interest !== undefined) {
    savedFilter.area_of_interest = isNonEmptyString(body.area_of_interest) ? body.area_of_interest.trim() : null;
  }

  if (body.stale_days !== undefined && body.stale_days !== null && body.stale_days !== '') {
    const days = Number(body.stale_days);
    if (!Number.isFinite(days) || days <= 0) {
      errors.push('stale_days must be a positive number');
    } else {
      savedFilter.stale_days = Math.round(days);
    }
  }

  return { errors, savedFilter };
}

module.exports = { validateSavedFilterInput };
