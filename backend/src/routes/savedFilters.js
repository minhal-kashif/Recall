const express = require('express');
const requireAuth = require('../middleware/requireAuth');
const { getUserClient } = require('../supabaseClient');
const { validateSavedFilterInput } = require('../validation/savedFilters');
const dbError = require('../utils/dbError');

const router = express.Router();

router.use(requireAuth);

router.get('/', async (req, res) => {
  const db = getUserClient(req.userToken);
  const { data, error } = await db.from('saved_filters').select('*').order('created_at', { ascending: true });

  if (error) return dbError(res, 'saved_filters:list', error);
  res.json(data);
});

router.post('/', async (req, res) => {
  const { errors, savedFilter } = validateSavedFilterInput(req.body);
  if (errors.length) return res.status(400).json({ errors });

  const db = getUserClient(req.userToken);
  const { data, error } = await db
    .from('saved_filters')
    .insert({ ...savedFilter, user_id: req.user.id })
    .select()
    .single();

  if (error) return dbError(res, 'saved_filters:create', error);
  res.status(201).json(data);
});

router.delete('/:id', async (req, res) => {
  const db = getUserClient(req.userToken);

  const { data: existing, error: fetchError } = await db
    .from('saved_filters')
    .select('id')
    .eq('id', req.params.id)
    .maybeSingle();

  if (fetchError) return dbError(res, 'saved_filters:delete:fetch', fetchError);
  if (!existing) return res.status(404).json({ error: 'Saved filter not found' });

  const { error } = await db.from('saved_filters').delete().eq('id', req.params.id);
  if (error) return dbError(res, 'saved_filters:delete', error);

  res.status(204).send();
});

module.exports = router;
