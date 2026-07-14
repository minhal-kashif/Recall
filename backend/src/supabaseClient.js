const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY);

// Scopes a client to the caller's own JWT so Postgres RLS (auth.uid()) applies
// per-request, rather than using any elevated/service-role access.
function getUserClient(token) {
  return createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY, {
    global: { headers: { Authorization: `Bearer ${token}` } },
  });
}

module.exports = supabase;
module.exports.getUserClient = getUserClient;
