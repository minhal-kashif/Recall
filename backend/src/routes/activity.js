const express = require('express');
const requireAuth = require('../middleware/requireAuth');
const { getUserClient } = require('../supabaseClient');
const dbError = require('../utils/dbError');

const router = express.Router();

router.use(requireAuth);

function pickContact(c) {
  const contact = Array.isArray(c) ? c[0] : c;
  return contact ? contact.name : null;
}

function formatDuration(seconds) {
  if (!seconds) return 'Recording';
  const m = Math.floor(seconds / 60);
  const s = Math.round(seconds % 60);
  return `${m}:${String(s).padStart(2, '0')} recording`;
}

// A single "what's been happening" feed across every contact, for the Home
// screen — mirrors the per-contact merge logic in the frontend's
// ActivityTimeline, minus the contact_id filter, plus overdue follow-ups
// (which that view never needed since it's already scoped to one contact's
// own follow-up list).
router.get('/recent', async (req, res) => {
  const db = getUserClient(req.userToken);
  const limit = Math.min(Number(req.query.limit) || 8, 20);
  const nowIso = new Date().toISOString();

  const [interactionsRes, doneRes, overdueRes, voiceNotesRes] = await Promise.all([
    db
      .from('interactions')
      .select('id, contact_id, note_text, interaction_date, source, contacts(name)')
      .neq('source', 'voice')
      .order('interaction_date', { ascending: false })
      .limit(limit),
    db
      .from('follow_ups')
      .select('id, contact_id, description, due_date, contacts(name)')
      .eq('status', 'done')
      .order('due_date', { ascending: false })
      .limit(limit),
    db
      .from('follow_ups')
      .select('id, contact_id, description, due_date, contacts(name)')
      .eq('status', 'pending')
      .lt('due_date', nowIso)
      .order('due_date', { ascending: false })
      .limit(limit),
    db
      .from('voice_notes')
      .select('id, contact_id, duration_seconds, created_at, contacts(name)')
      .order('created_at', { ascending: false })
      .limit(limit),
  ]);

  if (interactionsRes.error) return dbError(res, 'activity:interactions', interactionsRes.error);
  if (doneRes.error) return dbError(res, 'activity:done', doneRes.error);
  if (overdueRes.error) return dbError(res, 'activity:overdue', overdueRes.error);
  if (voiceNotesRes.error) return dbError(res, 'activity:voicenotes', voiceNotesRes.error);

  const entries = [
    ...interactionsRes.data.map((i) => ({
      id: `interaction-${i.id}`,
      kind: i.source === 'manual' ? 'manual' : i.source,
      date: i.interaction_date,
      contact_id: i.contact_id,
      contact_name: pickContact(i.contacts),
      text: i.note_text,
    })),
    ...doneRes.data.map((f) => ({
      id: `done-${f.id}`,
      kind: 'done',
      date: f.due_date,
      contact_id: f.contact_id,
      contact_name: pickContact(f.contacts),
      text: f.description,
    })),
    ...overdueRes.data.map((f) => ({
      id: `overdue-${f.id}`,
      kind: 'overdue',
      date: f.due_date,
      contact_id: f.contact_id,
      contact_name: pickContact(f.contacts),
      text: f.description,
    })),
    ...voiceNotesRes.data.map((n) => ({
      id: `voice-${n.id}`,
      kind: 'voice',
      date: n.created_at,
      contact_id: n.contact_id,
      contact_name: pickContact(n.contacts),
      text: formatDuration(n.duration_seconds),
    })),
  ]
    .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
    .slice(0, limit);

  res.json(entries);
});

module.exports = router;
