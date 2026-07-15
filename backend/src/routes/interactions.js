const express = require('express');
const requireAuth = require('../middleware/requireAuth');
const { getUserClient } = require('../supabaseClient');
const { validateInteractionInput } = require('../validation/interactions');
const dbError = require('../utils/dbError');

const router = express.Router();

router.use(requireAuth);

router.get('/:contactId', async (req, res) => {
  const db = getUserClient(req.userToken);
  const { data, error } = await db
    .from('interactions')
    .select('id, note_text, interaction_date, source')
    .eq('contact_id', req.params.contactId)
    .order('interaction_date', { ascending: false });

  if (error) return dbError(res, 'interactions:list', error);
  res.json(data);
});

router.post('/', async (req, res) => {
  const { errors, interaction } = validateInteractionInput(req.body);
  if (errors.length) return res.status(400).json({ errors });

  const db = getUserClient(req.userToken);
  const { data, error } = await db
    .from('interactions')
    .insert({ ...interaction, user_id: req.user.id })
    .select()
    .single();

  if (error) return dbError(res, 'interactions:create', error);
  res.status(201).json(data);
});

module.exports = router;
