// Real browser PushSubscription JSON (endpoint URL + two base64 keys) runs a
// few hundred bytes; this leaves generous headroom while still bounding
// storage abuse via an oversized/padded payload (same pattern as the
// MAX_LENGTHS check in validation/contacts.js).
const MAX_SUBSCRIPTION_JSON_LENGTH = 4000;

function isNonEmptyString(value) {
  return typeof value === 'string' && value.trim().length > 0;
}

// Validates a browser PushSubscription.toJSON() payload. Returns
// { errors, endpoint, subscriptionJson }.
function validatePushSubscriptionInput(body) {
  const errors = [];
  const sub = body && body.subscription;

  if (!sub || typeof sub !== 'object') {
    errors.push('subscription is required');
    return { errors };
  }

  if (!isNonEmptyString(sub.endpoint)) {
    errors.push('subscription.endpoint is required');
  }

  if (!sub.keys || !isNonEmptyString(sub.keys.p256dh) || !isNonEmptyString(sub.keys.auth)) {
    errors.push('subscription.keys.p256dh and subscription.keys.auth are required');
  }

  if (errors.length) return { errors };

  if (JSON.stringify(sub).length > MAX_SUBSCRIPTION_JSON_LENGTH) {
    errors.push('subscription payload is too large');
    return { errors };
  }

  return { errors, endpoint: sub.endpoint.trim(), subscriptionJson: sub };
}

module.exports = { validatePushSubscriptionInput };
