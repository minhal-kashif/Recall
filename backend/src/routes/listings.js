const express = require('express');
const crypto = require('crypto');
const multer = require('multer');
const requireAuth = require('../middleware/requireAuth');
const { getUserClient } = require('../supabaseClient');
const { validateListingInput } = require('../validation/listings');
const dbError = require('../utils/dbError');

const router = express.Router();

router.use(requireAuth);

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 },
});

const ALLOWED_MIME_TYPES = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' };
const SIGNED_URL_TTL_SECONDS = 3600;
const SELECT_COLUMNS =
  'id, contact_id, property_address, asking_price, beds, size_sqyd, property_type, condition_notes, photo_path, is_featured, status, created_at, contacts(name), listing_interests(count)';

function uploadPhoto(req, res, next) {
  upload.single('photo')(req, res, (err) => {
    if (err) {
      if (err.code === 'LIMIT_FILE_SIZE') {
        return res.status(413).json({ error: 'Photo is too large (max 10 MB).' });
      }
      return res.status(400).json({ error: 'Photo upload failed.' });
    }
    next();
  });
}

// A listing can optionally point at an existing contact — but only a seller
// makes sense as "who this inventory belongs to." Returns an error string on
// failure, or null on success (undefined/null contact_id is a no-op, valid).
async function verifySellerLink(db, contactId) {
  if (contactId === undefined || contactId === null) return null;
  const { data } = await db.from('contacts').select('id, type').eq('id', contactId).maybeSingle();
  if (!data) return 'contact_id does not refer to a contact you own';
  if (data.type !== 'seller') return 'contact_id must refer to a seller contact';
  return null;
}

async function shapeListing(db, row) {
  const contact = Array.isArray(row.contacts) ? row.contacts[0] : row.contacts;
  const interestsCount = Array.isArray(row.listing_interests) ? row.listing_interests[0]?.count ?? 0 : 0;
  let signedUrl = null;
  if (row.photo_path) {
    const { data: signed } = await db.storage.from('listing-photos').createSignedUrl(row.photo_path, SIGNED_URL_TTL_SECONDS);
    signedUrl = signed ? signed.signedUrl : null;
  }
  return {
    id: row.id,
    contact_id: row.contact_id,
    contact_name: contact ? contact.name : null,
    property_address: row.property_address,
    asking_price: row.asking_price,
    beds: row.beds,
    size_sqyd: row.size_sqyd,
    property_type: row.property_type,
    condition_notes: row.condition_notes,
    photo_url: signedUrl,
    is_featured: row.is_featured,
    status: row.status,
    interested_count: interestsCount,
    created_at: row.created_at,
  };
}

// A listing can only be linked to leads/buyers/tenants, not sellers — the
// seller already occupies the single listings.contact_id slot as "who this
// property belongs to." Returns an error string on failure, null on success.
async function verifyLeadOwnership(db, contactId) {
  const { data } = await db.from('contacts').select('id, type').eq('id', contactId).maybeSingle();
  if (!data) return 'contact_id does not refer to a contact you own';
  if (data.type === 'seller') return 'contact_id must refer to a non-seller contact';
  return null;
}

router.get('/', async (req, res) => {
  const db = getUserClient(req.userToken);

  let query = db.from('listings').select(SELECT_COLUMNS).order('created_at', { ascending: false });

  if (req.query.featured === 'true') {
    query = query.eq('is_featured', true);
  }

  const limit = Number(req.query.limit);
  if (Number.isFinite(limit) && limit > 0) {
    query = query.limit(limit);
  }

  const { data, error } = await query;
  if (error) return dbError(res, 'listings:list', error);

  const shaped = await Promise.all(data.map((row) => shapeListing(db, row)));
  res.json(shaped);
});

router.get('/:id', async (req, res) => {
  const db = getUserClient(req.userToken);
  const { data, error } = await db.from('listings').select(SELECT_COLUMNS).eq('id', req.params.id).maybeSingle();

  if (error) return dbError(res, 'listings:get', error);
  if (!data) return res.status(404).json({ error: 'Listing not found' });

  res.json(await shapeListing(db, data));
});

router.post('/', async (req, res) => {
  const { errors, listing } = validateListingInput(req.body);
  if (errors.length) return res.status(400).json({ errors });

  const db = getUserClient(req.userToken);

  const linkError = await verifySellerLink(db, listing.contact_id);
  if (linkError) return res.status(400).json({ error: linkError });

  const { data, error } = await db
    .from('listings')
    .insert({ ...listing, user_id: req.user.id })
    .select(SELECT_COLUMNS)
    .single();

  if (error) return dbError(res, 'listings:create', error);
  res.status(201).json(await shapeListing(db, data));
});

router.patch('/:id', async (req, res) => {
  const { errors, listing } = validateListingInput(req.body, { partial: true });
  if (errors.length) return res.status(400).json({ errors });

  const db = getUserClient(req.userToken);

  const linkError = await verifySellerLink(db, listing.contact_id);
  if (linkError) return res.status(400).json({ error: linkError });

  const { data, error } = await db
    .from('listings')
    .update(listing)
    .eq('id', req.params.id)
    .select(SELECT_COLUMNS)
    .maybeSingle();

  if (error) return dbError(res, 'listings:update', error);
  if (!data) return res.status(404).json({ error: 'Listing not found' });
  res.json(await shapeListing(db, data));
});

router.post('/:id/photo', uploadPhoto, async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'photo file is required' });

  const baseMime = req.file.mimetype.split(';')[0].trim().toLowerCase();
  const ext = ALLOWED_MIME_TYPES[baseMime];
  if (!ext) return res.status(400).json({ error: 'Unsupported image file type' });

  const db = getUserClient(req.userToken);

  const { data: existing, error: fetchError } = await db
    .from('listings')
    .select('id, photo_path')
    .eq('id', req.params.id)
    .maybeSingle();

  if (fetchError) return dbError(res, 'listings:photo:fetch', fetchError);
  if (!existing) return res.status(404).json({ error: 'Listing not found' });

  const storagePath = `${req.user.id}/${req.params.id}/${crypto.randomUUID()}.${ext}`;

  const { error: uploadError } = await db.storage
    .from('listing-photos')
    .upload(storagePath, req.file.buffer, { contentType: baseMime });

  if (uploadError) return dbError(res, 'listings:photo:upload', uploadError);

  const { data: updated, error: updateError } = await db
    .from('listings')
    .update({ photo_path: storagePath })
    .eq('id', req.params.id)
    .select(SELECT_COLUMNS)
    .single();

  if (updateError) {
    await db.storage.from('listing-photos').remove([storagePath]);
    return dbError(res, 'listings:photo:save', updateError);
  }

  // Best-effort cleanup of the old photo now that the new one is live.
  if (existing.photo_path && existing.photo_path !== storagePath) {
    await db.storage.from('listing-photos').remove([existing.photo_path]);
  }

  res.json(await shapeListing(db, updated));
});

router.get('/:id/interests', async (req, res) => {
  const db = getUserClient(req.userToken);
  const { data, error } = await db
    .from('listing_interests')
    .select('id, contact_id, created_at, contacts(name)')
    .eq('listing_id', req.params.id)
    .order('created_at', { ascending: false });

  if (error) return dbError(res, 'listings:interests:list', error);

  res.json(
    data.map((row) => {
      const contact = Array.isArray(row.contacts) ? row.contacts[0] : row.contacts;
      return { id: row.id, contact_id: row.contact_id, contact_name: contact ? contact.name : null, created_at: row.created_at };
    }),
  );
});

router.post('/:id/interests', async (req, res) => {
  const contactId = req.body.contact_id;
  if (typeof contactId !== 'string' || !contactId.trim()) {
    return res.status(400).json({ error: 'contact_id is required' });
  }

  const db = getUserClient(req.userToken);

  const linkError = await verifyLeadOwnership(db, contactId);
  if (linkError) return res.status(400).json({ error: linkError });

  const { data, error } = await db
    .from('listing_interests')
    .insert({ listing_id: req.params.id, contact_id: contactId, user_id: req.user.id })
    .select('id, contact_id, created_at, contacts(name)')
    .single();

  if (error) {
    if (error.code === '23505') return res.status(409).json({ error: 'This contact is already marked interested.' });
    return dbError(res, 'listings:interests:create', error);
  }

  const contact = Array.isArray(data.contacts) ? data.contacts[0] : data.contacts;
  res.status(201).json({ id: data.id, contact_id: data.contact_id, contact_name: contact ? contact.name : null, created_at: data.created_at });
});

router.delete('/:id/interests/:interestId', async (req, res) => {
  const db = getUserClient(req.userToken);
  const { data, error } = await db
    .from('listing_interests')
    .delete()
    .eq('id', req.params.interestId)
    .eq('listing_id', req.params.id)
    .select('id')
    .maybeSingle();

  if (error) return dbError(res, 'listings:interests:delete', error);
  if (!data) return res.status(404).json({ error: 'Interest not found' });

  res.status(204).send();
});

router.delete('/:id', async (req, res) => {
  const db = getUserClient(req.userToken);

  const { data: existing, error: fetchError } = await db
    .from('listings')
    .select('id, photo_path')
    .eq('id', req.params.id)
    .maybeSingle();

  if (fetchError) return dbError(res, 'listings:delete:fetch', fetchError);
  if (!existing) return res.status(404).json({ error: 'Listing not found' });

  if (existing.photo_path) {
    await db.storage.from('listing-photos').remove([existing.photo_path]);
  }

  const { error } = await db.from('listings').delete().eq('id', req.params.id);
  if (error) return dbError(res, 'listings:delete', error);

  res.status(204).send();
});

module.exports = router;
