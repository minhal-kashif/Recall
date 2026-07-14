const CONTACT_TYPES = ['buyer', 'seller', 'lead'];
const PROPERTY_TYPES = ['house', 'apartment'];

function isNonEmptyString(value) {
  return typeof value === 'string' && value.trim().length > 0;
}

function toNumberOrUndefined(value, field, errors) {
  if (value === undefined || value === null || value === '') return undefined;
  const num = Number(value);
  if (Number.isNaN(num)) {
    errors.push(`${field} must be a number`);
    return undefined;
  }
  return num;
}

function validateBuyerDetails(body, errors) {
  const details = body.buyer_details || {};

  if (
    details.property_type_wanted !== undefined &&
    details.property_type_wanted !== null &&
    details.property_type_wanted !== '' &&
    !PROPERTY_TYPES.includes(details.property_type_wanted)
  ) {
    errors.push(`buyer_details.property_type_wanted must be one of: ${PROPERTY_TYPES.join(', ')}`);
  }

  return {
    budget: toNumberOrUndefined(details.budget, 'buyer_details.budget', errors),
    beds_wanted: isNonEmptyString(details.beds_wanted) ? details.beds_wanted.trim() : null,
    size_wanted_sqyd: toNumberOrUndefined(details.size_wanted_sqyd, 'buyer_details.size_wanted_sqyd', errors),
    property_type_wanted: details.property_type_wanted || null,
    area_of_interest: isNonEmptyString(details.area_of_interest) ? details.area_of_interest.trim() : null,
  };
}

function validateSellerDetails(body, errors) {
  const details = body.seller_details || {};

  if (
    details.property_type !== undefined &&
    details.property_type !== null &&
    details.property_type !== '' &&
    !PROPERTY_TYPES.includes(details.property_type)
  ) {
    errors.push(`seller_details.property_type must be one of: ${PROPERTY_TYPES.join(', ')}`);
  }

  return {
    property_address: isNonEmptyString(details.property_address) ? details.property_address.trim() : null,
    asking_price: toNumberOrUndefined(details.asking_price, 'seller_details.asking_price', errors),
    beds: isNonEmptyString(details.beds) ? details.beds.trim() : null,
    size_sqyd: toNumberOrUndefined(details.size_sqyd, 'seller_details.size_sqyd', errors),
    property_type: details.property_type || null,
    condition_notes: isNonEmptyString(details.condition_notes) ? details.condition_notes.trim() : null,
  };
}

// Validates and sanitizes a create/update contact payload. Returns
// { errors, contact, buyerDetails, sellerDetails } — errors is empty when valid.
// existingType is used as a fallback on partial updates that don't resend `type`.
function validateContactInput(body, { partial = false, existingType = null } = {}) {
  const errors = [];
  const contact = {};

  if (!partial || body.name !== undefined) {
    if (!isNonEmptyString(body.name)) errors.push('name is required');
    else contact.name = body.name.trim();
  }

  if (!partial || body.phone !== undefined) {
    if (!isNonEmptyString(body.phone)) errors.push('phone is required');
    else contact.phone = body.phone.trim();
  }

  if (!partial || body.type !== undefined) {
    if (!CONTACT_TYPES.includes(body.type)) {
      errors.push(`type must be one of: ${CONTACT_TYPES.join(', ')}`);
    } else {
      contact.type = body.type;
    }
  }

  if (body.notes !== undefined) {
    contact.notes = isNonEmptyString(body.notes) ? body.notes.trim() : null;
  }

  let buyerDetails = null;
  let sellerDetails = null;

  const effectiveType = contact.type || body.type || existingType;
  if (effectiveType === 'buyer' || effectiveType === 'lead') {
    buyerDetails = validateBuyerDetails(body, errors);
  } else if (effectiveType === 'seller') {
    sellerDetails = validateSellerDetails(body, errors);
  }

  return { errors, contact, buyerDetails, sellerDetails };
}

module.exports = { validateContactInput, CONTACT_TYPES, PROPERTY_TYPES };
