const CONTACT_TYPES = ['buyer', 'seller', 'lead'];
const PROPERTY_TYPES = ['house', 'apartment'];

const MAX_LENGTHS = {
  name: 255,
  phone: 50,
  notes: 5000,
  beds_wanted: 50,
  area_of_interest: 255,
  property_address: 500,
  beds: 50,
  condition_notes: 5000,
};

function isNonEmptyString(value) {
  return typeof value === 'string' && value.trim().length > 0;
}

// Enforces a max length on an already-known-non-empty string field, pushing
// an error rather than throwing so multiple validation failures can be
// reported together (see SECURITY_AUDIT.md M4 — unbounded text was a gap).
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

  const bedsWanted = isNonEmptyString(details.beds_wanted) ? details.beds_wanted.trim() : null;
  if (bedsWanted) checkMaxLength(bedsWanted, 'beds_wanted', errors);

  const areaOfInterest = isNonEmptyString(details.area_of_interest) ? details.area_of_interest.trim() : null;
  if (areaOfInterest) checkMaxLength(areaOfInterest, 'area_of_interest', errors);

  return {
    budget: toNumberOrUndefined(details.budget, 'buyer_details.budget', errors),
    beds_wanted: bedsWanted,
    size_wanted_sqyd: toNumberOrUndefined(details.size_wanted_sqyd, 'buyer_details.size_wanted_sqyd', errors),
    property_type_wanted: details.property_type_wanted || null,
    area_of_interest: areaOfInterest,
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

  const propertyAddress = isNonEmptyString(details.property_address) ? details.property_address.trim() : null;
  if (propertyAddress) checkMaxLength(propertyAddress, 'property_address', errors);

  const beds = isNonEmptyString(details.beds) ? details.beds.trim() : null;
  if (beds) checkMaxLength(beds, 'beds', errors);

  const conditionNotes = isNonEmptyString(details.condition_notes) ? details.condition_notes.trim() : null;
  if (conditionNotes) checkMaxLength(conditionNotes, 'condition_notes', errors);

  return {
    property_address: propertyAddress,
    asking_price: toNumberOrUndefined(details.asking_price, 'seller_details.asking_price', errors),
    beds,
    size_sqyd: toNumberOrUndefined(details.size_sqyd, 'seller_details.size_sqyd', errors),
    property_type: details.property_type || null,
    condition_notes: conditionNotes,
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
    else {
      contact.name = body.name.trim();
      checkMaxLength(contact.name, 'name', errors);
    }
  }

  if (!partial || body.phone !== undefined) {
    if (!isNonEmptyString(body.phone)) errors.push('phone is required');
    else {
      contact.phone = body.phone.trim();
      checkMaxLength(contact.phone, 'phone', errors);
    }
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
    if (contact.notes) checkMaxLength(contact.notes, 'notes', errors);
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
