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

  return { errors, endpoint: sub.endpoint.trim(), subscriptionJson: sub };
}

module.exports = { validatePushSubscriptionInput };
