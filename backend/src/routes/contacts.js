const express = require('express');
const requireAuth = require('../middleware/requireAuth');
const { getUserClient } = require('../supabaseClient');
const { validateContactInput } = require('../validation/contacts');

const router = express.Router();

router.use(requireAuth);

// PostgREST embeds a to-one relation as an object when the FK column is
// unique (as buyer_details.contact_id / seller_details.contact_id are), but
// normalize defensively in case it ever comes back as a single-item array.
function pickOne(relation) {
  if (!relation) return null;
  return Array.isArray(relation) ? relation[0] || null : relation;
}

router.get('/', async (req, res) => {
  const db = getUserClient(req.userToken);
  const { data, error } = await db
    .from('contacts')
    .select('id, name, phone, type, notes, last_interaction_date, created_at, buyer_details(*), seller_details(*)')
    .order('created_at', { ascending: false });

  if (error) return res.status(500).json({ error: error.message });

  const { q, type, property_type, area_of_interest } = req.query;
  let results = data;

  if (q) {
    const needle = q.toLowerCase();
    results = results.filter(
      (c) => c.name.toLowerCase().includes(needle) || c.phone.toLowerCase().includes(needle),
    );
  }

  if (type) {
    results = results.filter((c) => c.type === type);
  }

  if (property_type) {
    results = results.filter((c) => {
      const buyer = pickOne(c.buyer_details);
      const seller = pickOne(c.seller_details);
      const pt = buyer?.property_type_wanted || seller?.property_type;
      return pt === property_type;
    });
  }

  if (area_of_interest) {
    const needle = area_of_interest.toLowerCase();
    results = results.filter((c) => {
      const buyer = pickOne(c.buyer_details);
      return (buyer?.area_of_interest || '').toLowerCase().includes(needle);
    });
  }

  const shaped = results.map((c) => {
    const buyer = pickOne(c.buyer_details);
    const seller = pickOne(c.seller_details);
    return {
      id: c.id,
      name: c.name,
      phone: c.phone,
      type: c.type,
      notes: c.notes,
      last_interaction_date: c.last_interaction_date,
      created_at: c.created_at,
      property_type: buyer?.property_type_wanted || seller?.property_type || null,
      area_of_interest: buyer?.area_of_interest || null,
    };
  });

  res.json(shaped);
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
