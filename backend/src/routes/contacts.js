const express = require('express');
const requireAuth = require('../middleware/requireAuth');
const { getUserClient } = require('../supabaseClient');
const { validateContactInput } = require('../validation/contacts');

const router = express.Router();

router.use(requireAuth);

router.get('/', async (req, res) => {
  const db = getUserClient(req.userToken);
  const { data, error } = await db
    .from('contacts')
    .select('id, name, phone, type, notes, last_interaction_date, created_at')
    .order('created_at', { ascending: false });

  if (error) return res.status(500).json({ error: error.message });
  res.json(data);
});

router.get('/:id', async (req, res) => {
  const db = getUserClient(req.userToken);
  const { data: contact, error } = await db
    .from('contacts')
    .select('*')
    .eq('id', req.params.id)
    .maybeSingle();

  if (error) return res.status(500).json({ error: error.message });
  if (!contact) return res.status(404).json({ error: 'Contact not found' });

  let details = null;
  if (contact.type === 'buyer' || contact.type === 'lead') {
    const { data } = await db.from('buyer_details').select('*').eq('contact_id', contact.id).maybeSingle();
    details = data;
  } else if (contact.type === 'seller') {
    const { data } = await db.from('seller_details').select('*').eq('contact_id', contact.id).maybeSingle();
    details = data;
  }

  res.json({ ...contact, details });
});

router.post('/', async (req, res) => {
  const { errors, contact, buyerDetails, sellerDetails } = validateContactInput(req.body);
  if (errors.length) return res.status(400).json({ errors });

  const db = getUserClient(req.userToken);

  const { data: newContact, error } = await db
    .from('contacts')
    .insert({ ...contact, user_id: req.user.id })
    .select()
    .single();

  if (error) return res.status(500).json({ error: error.message });

  let details = null;
  if (buyerDetails) {
    const { data, error: detailError } = await db
      .from('buyer_details')
      .insert({ ...buyerDetails, contact_id: newContact.id })
      .select()
      .single();
    if (detailError) return res.status(500).json({ error: detailError.message });
    details = data;
  } else if (sellerDetails) {
    const { data, error: detailError } = await db
      .from('seller_details')
      .insert({ ...sellerDetails, contact_id: newContact.id })
      .select()
      .single();
    if (detailError) return res.status(500).json({ error: detailError.message });
    details = data;
  }

  res.status(201).json({ ...newContact, details });
});

router.patch('/:id', async (req, res) => {
  const db = getUserClient(req.userToken);

  const { data: existing, error: fetchError } = await db
    .from('contacts')
    .select('id, type')
    .eq('id', req.params.id)
    .maybeSingle();

  if (fetchError) return res.status(500).json({ error: fetchError.message });
  if (!existing) return res.status(404).json({ error: 'Contact not found' });

  const { errors, contact, buyerDetails, sellerDetails } = validateContactInput(req.body, {
    partial: true,
    existingType: existing.type,
  });
  if (errors.length) return res.status(400).json({ errors });

  let updatedContact = existing;
  if (Object.keys(contact).length > 0) {
    const { data, error } = await db
      .from('contacts')
      .update(contact)
      .eq('id', req.params.id)
      .select()
      .single();
    if (error) return res.status(500).json({ error: error.message });
    updatedContact = data;
  }

  const newType = contact.type || existing.type;
  const typeChanged = contact.type && contact.type !== existing.type;

  if (typeChanged) {
    if (newType === 'seller') {
      await db.from('buyer_details').delete().eq('contact_id', req.params.id);
    } else {
      await db.from('seller_details').delete().eq('contact_id', req.params.id);
    }
  }

  let details = null;
  if (buyerDetails && (newType === 'buyer' || newType === 'lead')) {
    const { data, error } = await db
      .from('buyer_details')
      .upsert({ ...buyerDetails, contact_id: req.params.id }, { onConflict: 'contact_id' })
      .select()
      .single();
    if (error) return res.status(500).json({ error: error.message });
    details = data;
  } else if (sellerDetails && newType === 'seller') {
    const { data, error } = await db
      .from('seller_details')
      .upsert({ ...sellerDetails, contact_id: req.params.id }, { onConflict: 'contact_id' })
      .select()
      .single();
    if (error) return res.status(500).json({ error: error.message });
    details = data;
  }

  res.json({ ...updatedContact, details });
});

module.exports = router;
