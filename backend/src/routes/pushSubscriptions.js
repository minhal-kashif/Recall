const express = require('express');
const requireAuth = require('../middleware/requireAuth');
const { getUserClient } = require('../supabaseClient');
const { validatePushSubscriptionInput } = require('../validation/pushSubscriptions');
const dbError = require('../utils/dbError');

const router = express.Router();

router.use(requireAuth);

router.post('/', async (req, res) => {
  const { errors, endpoint, subscriptionJson } = validatePushSubscriptionInput(req.body);
  if (errors.length) return res.status(400).json({ errors });

  const db = getUserClient(req.userToken);
  const { data, error } = await db
    .from('push_subscriptions')
    .upsert(
      { user_id: req.user.id, endpoint, subscription_json: subscriptionJson },
      { onConflict: 'user_id,endpoint' },
    )
    .select('id')
    .single();

  if (error) return dbError(res, 'push_subscriptions:create', error);
  res.status(201).json(data);
});

module.exports = router;
