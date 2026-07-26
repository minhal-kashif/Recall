const PROPERTY_TYPES = ['house', 'apartment', 'plot'];
const LISTING_STATUSES = ['available', 'under_offer', 'sold', 'rented'];

const MAX_LENGTHS = {
  property_address: 500,
  beds: 50,
  condition_notes: 5000,
};

function isNonEmptyString(value) {
  return typeof value === 'string' && value.trim().length > 0;
}

function checkMaxLength(value, field, errors) {
  const max = MAX_LENGTHS[field];
  if (max && typeof value === 'string' && value.trim().length > max) {
    errors.push(`${field} must be ${max} characters or fewer`);
    return false;
  }
  return true;
}

function toNumberOrUndefined(value, field, errors) {
  if (value === undefined || value === null || value === '') return undefined;
  const num = Number(value);
  if (!Number.isFinite(num)) {
    errors.push(`${field} must be a finite number`);
    return undefined;
  }
  return num;
}

// Validates and sanitizes a create/update listing payload. Returns
// { errors, listing } — errors is empty when valid. contact_id ownership
// (and that it's a seller-type contact) is checked in the route, not here.
function validateListingInput(body, { partial = false } = {}) {
  const errors = [];
  const listing = {};

  if (!partial || body.property_address !== undefined) {
    if (!isNonEmptyString(body.property_address)) errors.push('property_address is required');
    else {
      listing.property_address = body.property_address.trim();
      checkMaxLength(listing.property_address, 'property_address', errors);
    }
  }

  if (body.asking_price !== undefined) {
    const price = toNumberOrUndefined(body.asking_price, 'asking_price', errors);
    listing.asking_price = price === undefined ? null : price;
  }

  if (body.beds !== undefined) {
    const beds = isNonEmptyString(body.beds) ? body.beds.trim() : null;
    if (beds) checkMaxLength(beds, 'beds', errors);
    listing.beds = beds;
  }

  if (body.size_sqyd !== undefined) {
    const size = toNumberOrUndefined(body.size_sqyd, 'size_sqyd', errors);
    listing.size_sqyd = size === undefined ? null : size;
  }

  if (body.property_type !== undefined) {
    if (body.property_type === '' || body.property_type === null) {
      listing.property_type = null;
    } else if (!PROPERTY_TYPES.includes(body.property_type)) {
      errors.push(`property_type must be one of: ${PROPERTY_TYPES.join(', ')}`);
    } else {
      listing.property_type = body.property_type;
    }
  }

  if (body.condition_notes !== undefined) {
    const notes = isNonEmptyString(body.condition_notes) ? body.condition_notes.trim() : null;
    if (notes) checkMaxLength(notes, 'condition_notes', errors);
    listing.condition_notes = notes;
  }

  if (body.contact_id !== undefined) {
    if (body.contact_id === '' || body.contact_id === null) {
      listing.contact_id = null;
    } else if (!isNonEmptyString(body.contact_id)) {
      errors.push('contact_id must be a string');
    } else {
      listing.contact_id = body.contact_id.trim();
    }
  }

  if (body.is_featured !== undefined) {
    if (typeof body.is_featured !== 'boolean') {
      errors.push('is_featured must be a boolean');
    } else {
      listing.is_featured = body.is_featured;
    }
  }

  if (body.status !== undefined) {
    if (!LISTING_STATUSES.includes(body.status)) {
      errors.push(`status must be one of: ${LISTING_STATUSES.join(', ')}`);
    } else {
      listing.status = body.status;
    }
  }

  return { errors, listing };
}

module.exports = { validateListingInput, PROPERTY_TYPES, LISTING_STATUSES };
