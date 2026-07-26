const express = require('express');
const requireAuth = require('../middleware/requireAuth');
const { getUserClient } = require('../supabaseClient');
const { validateFollowUpInput, validateFollowUpUpdate } = require('../validation/followUps');
const dbError = require('../utils/dbError');
const verifyContactOwnership = require('../utils/verifyContactOwnership');

const router = express.Router();

router.use(requireAuth);

// Must stay registered before GET /:contactId below — otherwise Express
// would match "today" as a contactId value instead of routing here.
//
// Returns overdue/due-today follow-ups plus a look-ahead window (default 7
// days) of upcoming ones — the frontend buckets these into Overdue / Today /
// Upcoming by comparing due_date to now, same way it already computes the
// overdue label. Kept as one endpoint/one bucketing source of truth instead
// of splitting into separate "today" and "upcoming" calls.
router.get('/today', async (req, res) => {
  const db = getUserClient(req.userToken);

  const windowDays = Number(req.query.upcoming_days);
  const lookahead = Number.isFinite(windowDays) && windowDays > 0 ? windowDays : 7;
  const upperBound = new Date(Date.now() + lookahead * 24 * 60 * 60 * 1000).toISOString();

  const { data, error } = await db
    .from('follow_ups')
    .select('id, description, due_date, status, contact_id, contacts(name)')
    .eq('status', 'pending')
    .lte('due_date', upperBound)
    .order('due_date', { ascending: true });

  if (error) return dbError(res, 'follow_ups:today', error);

  const shaped = data.map((f) => {
    const contact = Array.isArray(f.contacts) ? f.contacts[0] : f.contacts;
    return {
      id: f.id,
      description: f.description,
      due_date: f.due_date,
      status: f.status,
      contact_id: f.contact_id,
      contact_name: contact ? contact.name : null,
    };
  });

  res.json(shaped);
});

router.get('/:contactId', async (req, res) => {
  const db = getUserClient(req.userToken);

  if (!(await verifyContactOwnership(db, req.params.contactId))) {
    return res.status(404).json({ error: 'Contact not found' });
  }

  const { data, error } = await db
    .from('follow_ups')
    .select('id, description, due_date, status, created_at')
    .eq('contact_id', req.params.contactId)
    .order('due_date', { ascending: true });

  if (error) return dbError(res, 'follow_ups:list', error);
  res.json(data);
});

router.post('/', async (req, res) => {
  const { errors, followUp } = validateFollowUpInput(req.body);
  if (errors.length) return res.status(400).json({ errors });

  const db = getUserClient(req.userToken);

  if (!(await verifyContactOwnership(db, followUp.contact_id))) {
    return res.status(404).json({ error: 'Contact not found' });
  }

  const { data, error } = await db
    .from('follow_ups')
    .insert({ ...followUp, user_id: req.user.id })
    .select()
    .single();

  if (error) return dbError(res, 'follow_ups:create', error);
  res.status(201).json(data);
});

router.patch('/:id', async (req, res) => {
  const { errors, update } = validateFollowUpUpdate(req.body);
  if (errors.length) return res.status(400).json({ errors });

  // A due_date change (snooze/reschedule) means this is effectively a new
  // reminder — clear notified_at so the push job can fire again for it.
  if (update.due_date !== undefined) {
    update.notified_at = null;
  }

  const db = getUserClient(req.userToken);
  const { data, error } = await db
    .from('follow_ups')
    .update(update)
    .eq('id', req.params.id)
    .select()
    .maybeSingle();

  if (error) return dbError(res, 'follow_ups:update', error);
  if (!data) return res.status(404).json({ error: 'Follow-up not found' });
  res.json(data);
});

module.exports = router;
