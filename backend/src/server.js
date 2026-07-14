require('dotenv').config();
const express = require('express');
const cors = require('cors');
const supabase = require('./supabaseClient');
const requireAuth = require('./middleware/requireAuth');
const contactsRouter = require('./routes/contacts');

const app = express();
app.use(cors());
app.use(express.json());

app.use('/api/contacts', contactsRouter);

app.get('/api/health', async (req, res) => {
  const { error } = await supabase.from('_health_check_').select('*').limit(1);
  const supabaseReachable = !error || error.code !== undefined;

  res.json({
    status: 'ok',
    supabaseConfigured: Boolean(process.env.SUPABASE_URL && process.env.SUPABASE_KEY),
    supabaseReachable,
  });
});

app.get('/api/me', requireAuth, (req, res) => {
  res.json({ id: req.user.id, email: req.user.email });
});

const PORT = process.env.PORT || 4000;
app.listen(PORT, () => {
  console.log(`Backend listening on http://localhost:${PORT}`);
});
