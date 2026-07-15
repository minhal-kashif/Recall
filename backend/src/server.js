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

const app = express();

app.use(helmet());

const allowedOrigins = (process.env.CORS_ORIGINS || 'http://localhost:5173').split(',');
app.use(cors({ origin: allowedOrigins }));

app.use(express.json());

// General ceiling on all API traffic.
const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 300,
  standardHeaders: true,
  legacyHeaders: false,
});
app.use('/api', apiLimiter);

// Tighter limiter in front of anything that calls requireAuth, so a flood of
// invalid tokens can't force unlimited calls to Supabase's Auth API.
const authLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: 20,
  standardHeaders: true,
  legacyHeaders: false,
});

app.use('/api/contacts', authLimiter, contactsRouter);
app.use('/api/interactions', authLimiter, interactionsRouter);
app.use('/api/follow-ups', authLimiter, followUpsRouter);

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
