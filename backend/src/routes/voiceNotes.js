const express = require('express');
const crypto = require('crypto');
const multer = require('multer');
const requireAuth = require('../middleware/requireAuth');
const { getUserClient } = require('../supabaseClient');
const { validateVoiceNoteInput } = require('../validation/voiceNotes');
const dbError = require('../utils/dbError');
const verifyContactOwnership = require('../utils/verifyContactOwnership');

const router = express.Router();

router.use(requireAuth);

// Memory storage + a hard 10MB cap is the real abuse/cost ceiling here — the
// server never writes the upload to disk before it lands in Storage.
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 },
});

const ALLOWED_MIME_TYPES = ['audio/webm', 'audio/ogg', 'audio/mp4', 'audio/mpeg'];
const SIGNED_URL_TTL_SECONDS = 3600;

router.get('/:contactId', async (req, res) => {
  const db = getUserClient(req.userToken);

  if (!(await verifyContactOwnership(db, req.params.contactId))) {
    return res.status(404).json({ error: 'Contact not found' });
  }

  const { data, error } = await db
    .from('voice_notes')
    .select('id, contact_id, storage_path, duration_seconds, transcript_text, created_at')
    .eq('contact_id', req.params.contactId)
    .order('created_at', { ascending: false });

  if (error) return dbError(res, 'voice_notes:list', error);

  const shaped = await Promise.all(
    data.map(async (note) => {
      const { data: signed } = await db.storage
        .from('voice-notes')
        .createSignedUrl(note.storage_path, SIGNED_URL_TTL_SECONDS);

      return {
        id: note.id,
        contact_id: note.contact_id,
        duration_seconds: note.duration_seconds,
        transcript_text: note.transcript_text,
        created_at: note.created_at,
        signed_url: signed ? signed.signedUrl : null,
      };
    })
  );

  res.json(shaped);
});

router.post('/', upload.single('audio'), async (req, res) => {
  const { errors, contact_id, duration_seconds } = validateVoiceNoteInput(req.body);
  if (errors.length) return res.status(400).json({ errors });

  if (!req.file) {
    return res.status(400).json({ error: 'audio file is required' });
  }

  if (!ALLOWED_MIME_TYPES.includes(req.file.mimetype)) {
    return res.status(400).json({ error: 'Unsupported audio file type' });
  }

  const db = getUserClient(req.userToken);

  if (!(await verifyContactOwnership(db, contact_id))) {
    return res.status(404).json({ error: 'Contact not found' });
  }

  const storagePath = `${req.user.id}/${contact_id}/${crypto.randomUUID()}.webm`;

  const { error: uploadError } = await db.storage
    .from('voice-notes')
    .upload(storagePath, req.file.buffer, { contentType: req.file.mimetype });

  if (uploadError) return dbError(res, 'voice_notes:upload', uploadError);

  const { data: voiceNote, error: insertError } = await db
    .from('voice_notes')
    .insert({
      user_id: req.user.id,
      contact_id,
      storage_path: storagePath,
      duration_seconds,
    })
    .select()
    .single();

  if (insertError) {
    // Best-effort cleanup so a failed metadata insert doesn't leave an
    // orphaned object sitting in the bucket.
    await db.storage.from('voice-notes').remove([storagePath]);
    return dbError(res, 'voice_notes:create', insertError);
  }

  const { error: interactionError } = await db.from('interactions').insert({
    contact_id,
    user_id: req.user.id,
    note_text: '[Voice note]',
    source: 'voice',
  });

  if (interactionError) {
    // The voice note itself is already saved successfully; log this and
    // still return success rather than leaving the request hanging.
    console.error('voice_notes:interaction-log', interactionError);
  }

  const { data: signed } = await db.storage
    .from('voice-notes')
    .createSignedUrl(storagePath, SIGNED_URL_TTL_SECONDS);

  res.status(201).json({
    id: voiceNote.id,
    contact_id: voiceNote.contact_id,
    storage_path: voiceNote.storage_path,
    duration_seconds: voiceNote.duration_seconds,
    created_at: voiceNote.created_at,
    signed_url: signed ? signed.signedUrl : null,
  });
});

module.exports = router;
