const express = require('express');
const requireAuth = require('../middleware/requireAuth');
const { getUserClient } = require('../supabaseClient');
const { validateContactInput } = require('../validation/contacts');
const dbError = require('../utils/dbError');

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
    .select(
      'id, name, phone, type, notes, source, last_interaction_date, created_at, buyer_details(*), seller_details(*)',
    )
    .order('created_at', { ascending: false });

  if (error) return dbError(res, 'contacts:list', error);

  const { q, type, property_type, area_of_interest, stale_days } = req.query;
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

  // "Quiet N+ days" — same staleness definition the 15-day silence-reminder
  // job uses: coalesce(last_interaction_date, created_at) older than N days.
  const staleDaysNum = stale_days ? Number(stale_days) : null;
  if (staleDaysNum && Number.isFinite(staleDaysNum) && staleDaysNum > 0) {
    const cutoff = Date.now() - staleDaysNum * 24 * 60 * 60 * 1000;
    results = results.filter((c) => {
      const reference = c.last_interaction_date || c.created_at;
      return new Date(reference).getTime() < cutoff;
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
      source: c.source,
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

  if (error) return dbError(res, 'contacts:get', error);
  if (!contact) return res.status(404).json({ error: 'Contact not found' });

  let details = null;
  if (contact.type === 'buyer' || contact.type === 'lead' || contact.type === 'tenant') {
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

  if (error) return dbError(res, 'contacts:create', error);

  let details = null;
  if (buyerDetails) {
    const { data, error: detailError } = await db
      .from('buyer_details')
      .insert({ ...buyerDetails, contact_id: newContact.id })
      .select()
      .single();
    if (detailError) return dbError(res, 'contacts:create:buyer_details', detailError);
    details = data;
  } else if (sellerDetails) {
    const { data, error: detailError } = await db
      .from('seller_details')
      .insert({ ...sellerDetails, contact_id: newContact.id })
      .select()
      .single();
    if (detailError) return dbError(res, 'contacts:create:seller_details', detailError);
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

  if (fetchError) return dbError(res, 'contacts:update:fetch', fetchError);
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
    if (error) return dbError(res, 'contacts:update', error);
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
  if (buyerDetails && (newType === 'buyer' || newType === 'lead' || newType === 'tenant')) {
    const { data, error } = await db
      .from('buyer_details')
      .upsert({ ...buyerDetails, contact_id: req.params.id }, { onConflict: 'contact_id' })
      .select()
      .single();
    if (error) return dbError(res, 'contacts:update:buyer_details', error);
    details = data;
  } else if (sellerDetails && newType === 'seller') {
    const { data, error } = await db
      .from('seller_details')
      .upsert({ ...sellerDetails, contact_id: req.params.id }, { onConflict: 'contact_id' })
      .select()
      .single();
    if (error) return dbError(res, 'contacts:update:seller_details', error);
    details = data;
  }

  res.json({ ...updatedContact, details });
});

router.delete('/:id', async (req, res) => {
  const db = getUserClient(req.userToken);

  const { data: existing, error: fetchError } = await db
    .from('contacts')
    .select('id')
    .eq('id', req.params.id)
    .maybeSingle();

  if (fetchError) return dbError(res, 'contacts:delete:fetch', fetchError);
  if (!existing) return res.status(404).json({ error: 'Contact not found' });

  // Deleting the contacts row cascades buyer_details/seller_details/
  // interactions/follow_ups/voice_notes at the DB level, but that only drops
  // the voice_notes rows — the actual audio objects in Storage are separate
  // and would be orphaned (unreachable, still billed) unless removed here.
  const { data: notes } = await db
    .from('voice_notes')
    .select('storage_path')
    .eq('contact_id', req.params.id);

  if (notes && notes.length > 0) {
    await db.storage.from('voice-notes').remove(notes.map((n) => n.storage_path));
  }

  const { error } = await db.from('contacts').delete().eq('id', req.params.id);
  if (error) return dbError(res, 'contacts:delete', error);

  res.status(204).send();
});

module.exports = router;
