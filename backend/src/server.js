require('dotenv').config();
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const supabase = require('./supabaseClient');
const requireAuth = require('./middleware/requireAuth');
const contactsRouter = require('./routes/contacts');
const interactionsRouter = require('./routes/interactions');
const followUpsRouter = require('./routes/followUps');
const pushSubscriptionsRouter = require('./routes/pushSubscriptions');
const voiceNotesRouter = require('./routes/voiceNotes');
const savedFiltersRouter = require('./routes/savedFilters');
const listingsRouter = require('./routes/listings');
const activityRouter = require('./routes/activity');

const app = express();

app.use(helmet());

const allowedOrigins = (process.env.CORS_ORIGINS || 'http://localhost:5173').split(',');
app.use(cors({ origin: allowedOrigins }));

app.use(express.json());

// express-rate-limit's default 429 body is plain text, not JSON — every
// frontend fetch call here does res.json() unconditionally, so a plain-text
// body throws a parse error instead of surfacing a real message. Match the
// { error } shape the rest of the API already uses.
const rateLimitMessage = { error: 'Too many requests. Please slow down and try again shortly.' };

// General ceiling on all API traffic.
const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 300,
  standardHeaders: true,
  legacyHeaders: false,
  message: rateLimitMessage,
});
app.use('/api', apiLimiter);

// Tighter limiter in front of anything that calls requireAuth, so a flood of
// invalid tokens can't force unlimited calls to Supabase's Auth API. Shared
// across every authenticated route group below, so the ceiling has to cover
// a single screen's real fan-out, not just one request: Home alone fires ~5
// parallel calls per load (follow-ups, contacts x2, listings, activity),
// which React StrictMode doubles in dev — 20/min was tripping on completely
// normal navigation, not actual abuse.
const authLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: 120,
  standardHeaders: true,
  legacyHeaders: false,
  message: rateLimitMessage,
});

app.use('/api/contacts', authLimiter, contactsRouter);
app.use('/api/interactions', authLimiter, interactionsRouter);
app.use('/api/follow-ups', authLimiter, followUpsRouter);
app.use('/api/push-subscriptions', authLimiter, pushSubscriptionsRouter);
app.use('/api/saved-filters', authLimiter, savedFiltersRouter);
app.use('/api/activity', authLimiter, activityRouter);

// Tighter limiter specifically on voice-note uploads (cost/abuse control on
// top of the per-file size cap) — applied only to the POST route below.
const voiceUploadLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: rateLimitMessage,
});
app.post('/api/voice-notes', voiceUploadLimiter);
app.use('/api/voice-notes', authLimiter, voiceNotesRouter);

// Same cost/abuse control as voice-note uploads, applied only to the photo
// upload route.
const listingPhotoUploadLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: rateLimitMessage,
});
app.post('/api/listings/:id/photo', listingPhotoUploadLimiter);
app.use('/api/listings', authLimiter, listingsRouter);

app.get('/api/health', async (req, res) => {
  const { error } = await supabase.from('_health_check_').select('*').limit(1);
  const supabaseReachable = !error || error.code !== undefined;

  res.json({
    status: 'ok',
    supabaseConfigured: Boolean(process.env.SUPABASE_URL && process.env.SUPABASE_KEY),
    supabaseReachable,
  });
});

app.get('/api/me', authLimiter, requireAuth, (req, res) => {
  res.json({ id: req.user.id, email: req.user.email });
});

// Catch-all: never let an unexpected error leak internals to the client,
// regardless of whether NODE_ENV is set correctly in the deploy environment.
app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).json({ error: 'Internal server error' });
});

const PORT = process.env.PORT || 4000;
app.listen(PORT, () => {
  console.log(`Backend listening on http://localhost:${PORT}`);
});
