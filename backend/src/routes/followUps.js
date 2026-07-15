const express = require('express');
const requireAuth = require('../middleware/requireAuth');
const { getUserClient } = require('../supabaseClient');
const { validateFollowUpInput, validateFollowUpUpdate } = require('../validation/followUps');
const dbError = require('../utils/dbError');

const router = express.Router();

router.use(requireAuth);

// Must stay registered before GET /:contactId below — otherwise Express
// would match "today" as a contactId value instead of routing here.
router.get('/today', async (req, res) => {
  const db = getUserClient(req.userToken);
  const { data, error } = await db
    .from('follow_ups')
    .select('id, description, due_date, status, contact_id, contacts(name)')
    .eq('status', 'pending')
    .lte('due_date', new Date().toISOString())
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
