# SECURITY_AUDIT.md

Audit date: 2026-07-14. Scope: full repo at commit `fe1361f` (Stage 1, tickets T1.1–T1.5). Every finding below was either reproduced against the live Supabase project (`gleuammjovnltispagmg`) and/or the running Express server, or cited to exact file:line in the repo. Where something could not be verified from the code, it's called out explicitly in its own section rather than assumed safe.

**Update 2026-07-14 (same day, follow-up pass):** All High and Medium findings except M6 have been fixed and re-verified — see the `STATUS` line under each finding below for what was actually re-tested (live HTTP round-trips for H1–H3, unit-level re-execution of the exact vulnerable code path for M1/M4/M5, live SQL re-scan for M3). M6 requires a Supabase Dashboard change, not a code change — still open. L1–L3 were left as-is (Low severity, explicitly deferred in their own fix notes). RLS/anon/IDOR isolation was re-confirmed clean after all fixes: all 6 tables still `rls_enabled: true`, `anon` role still sees 0 rows on `contacts`.

## Critical findings

**None identified.** This is a claim that was tested, not assumed — see the proofs below and the RLS/IDOR section in particular. Stage 3 (AI/LLM: WhatsApp `.txt` parsing, Whisper transcription — category C in the requested scope) has **not been built yet** (confirmed by grep: no matches for `whatsapp|whisper|openai|anthropic|voice_note` anywhere in `backend/` or `frontend/`, only in planning docs and a migration's enum comment). There is no prompt-injection, LLM-output, or unbounded-AI-consumption surface to audit because that code doesn't exist. Re-run category C in full when Stage 3 is built — do not assume today's clean result carries forward.

## High findings

### [H1] No rate limiting on any endpoint, including the auth-verifying ones
- **STATUS: FIXED — verified live.** `express-rate-limit` applied: 300/15min global on `/api`, 20/min in front of every route that calls `requireAuth`. Re-tested with 22 rapid requests to `/api/me` — requests 1-20 returned `401` (expected, no valid token), requests 21-22 returned `429`. Response headers confirmed present (`RateLimit-Limit: 300`, `RateLimit-Remaining`, etc).
- Severity: High
- Location: `backend/src/server.js` (entire file — no `express-rate-limit` or equivalent is installed or applied); confirmed absent from `backend/package.json:15-23` (only `express`, `cors`, `dotenv`, `@supabase/supabase-js`).
- Attack: An attacker sends an unbounded flood of requests to `GET /api/me` or any `/api/contacts/*` route with garbage or stolen bearer tokens. Every single request — even ones with an invalid token — causes `requireAuth` (`backend/src/middleware/requireAuth.js:11`) to make a real outbound call to Supabase's Auth API (`supabase.auth.getUser(token)`). Nothing in this stack throttles that. This is a trivial, zero-prerequisite denial-of-service against your own Express process and a denial-of-wallet vector against your Supabase project's Auth API quota — a two-line `curl` loop is sufficient, no valid credentials needed.
- Proof: Code inspection confirms every route (`/api/me`, all of `/api/contacts`) passes through `requireAuth`, which unconditionally calls the Supabase Auth API before any other check. No middleware in `server.js` limits request rate or concurrency.
- Fix:
```js
// backend/src/server.js
const rateLimit = require('express-rate-limit');

const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 300,               // tune to real usage; this is a solo-agent app
  standardHeaders: true,
  legacyHeaders: false,
});

app.use('/api', apiLimiter);
```
Also add a stricter limiter specifically in front of `requireAuth` (e.g. 20/min per IP) so invalid-token floods can't reach the Supabase Auth call at all.

### [H2] No security headers — Helmet is not installed
- **STATUS: FIXED — verified live.** `helmet()` applied globally. Re-tested with `curl -sI http://localhost:4000/api/health`: response now includes `Content-Security-Policy`, `X-Frame-Options: SAMEORIGIN`, `Strict-Transport-Security`, `X-Content-Type-Options: nosniff`, and more.
- Severity: High
- Location: `backend/src/server.js:8-10` — only `cors()` and `express.json()` are applied; no `helmet()`.
- Attack: There is currently zero `Content-Security-Policy`, no `X-Frame-Options`/`frame-ancestors`, no `X-Content-Type-Options`, no `Strict-Transport-Security`. Two concrete consequences today: (1) the frontend can be embedded in an `<iframe>` on any attacker-controlled page right now and UI-redressed/clickjacked against a logged-in agent, since nothing blocks framing; (2) if any future feature ever introduces an XSS bug (very plausible surface: Stage 3 will render WhatsApp-imported text and voice transcripts, both attacker-controlled), there is no CSP to contain it — full run of arbitrary JS in the victim's session, and the Supabase session token sitting in `localStorage` (Supabase's default persistence) becomes trivially exfiltratable.
- Proof: `curl -I http://localhost:4000/api/health` returns no `Content-Security-Policy`, `X-Frame-Options`, or `Strict-Transport-Security` headers — Express's own defaults, since nothing sets them.
- Fix:
```js
// backend/src/server.js
const helmet = require('helmet');
app.use(helmet());
```
For the frontend (served separately in production, e.g. behind a static host/CDN), configure equivalent headers at that layer — Helmet alone only covers the Express-served responses.

### [H3] CORS allows every origin, including on authenticated routes
- **STATUS: FIXED — verified live.** CORS now driven by a `CORS_ORIGINS` env var (defaults to `http://localhost:5173`). Re-tested: request with `Origin: http://localhost:5173` gets `Access-Control-Allow-Origin: http://localhost:5173` back; request with `Origin: http://evil.com` gets no `Access-Control-Allow-Origin` header at all.
- Severity: High
- Location: `backend/src/server.js:9` — `app.use(cors());` with no options object.
- Attack: The `cors` package's documented default behavior with no options is to reflect `Access-Control-Allow-Origin` for *any* requesting origin. Combined with H2 (no CSP) and the localStorage-persisted token (see H2), any origin that manages to run JS in the context of a logged-in session — via the XSS path described above — can also make cross-origin `fetch()` calls to this API and read the JSON responses back, with no origin restriction to slow it down. On its own (without a prerequisite XSS), permissive CORS does not leak the bearer token itself, but it removes a defense-in-depth layer that should exist regardless.
- Proof: `backend/src/server.js:9`, `cors` v2.8.6 per `backend/package.json:17` — default export behavior is documented as origin: `*` reflection when called with no arguments.
- Fix:
```js
// backend/src/server.js
const allowedOrigins = (process.env.CORS_ORIGINS || 'http://localhost:5173').split(',');
app.use(cors({ origin: allowedOrigins }));
```
Set `CORS_ORIGINS` in `backend/.env` (and in production config) to the exact frontend origin(s) only.

## Medium findings

### [M1] Raw Postgres/PostgREST error messages are forwarded verbatim to the client on every route
- **STATUS: FIXED — verified.** All 9 call sites in `contacts.js` route through a new `dbError()` helper (confirmed by grep: zero remaining `.message` references in the file). Re-tested the exact captured Postgres error (`invalid input syntax for type uuid: "not-a-valid-uuid"`) through the real helper function: server-side `console.error` still receives the full detail, client-facing response is only `{"error":"Something went wrong. Please try again."}` — confirmed no Postgres text or SQLSTATE code leaks through.
- Severity: Medium
- Location: `backend/src/routes/contacts.js:25`, `:85`, `:112`, `:121`, `:129`, `:145`, `:162`, `:184`, `:192` — every one of these is `res.status(500).json({ error: error.message })` (or `detailError.message`), passing the database driver's raw error text straight through.
- Attack: An authenticated attacker (any real user — this doesn't require breaking auth) sends malformed input to trigger a DB-level error and reads back internal schema details: column names, constraint names, and Postgres error codes that make mapping the schema for further attack planning easier. This is reconnaissance-grade information disclosure, not a direct breach, but it's free intelligence handed to anyone probing the API.
- Proof (reproduced): Calling `GET /api/contacts/not-a-valid-uuid` triggers `contacts.js:79-83`'s `.eq('id', req.params.id)` to fail at the Postgres level. Confirmed exact leaked text by reproducing the identical cast directly against the database:
  ```
  select 'not-a-valid-uuid'::uuid;
  → ERROR: 22P02: invalid input syntax for type uuid: "not-a-valid-uuid"
  ```
  That full string — including the SQLSTATE code — is what `error.message` contains and what the client receives verbatim. Similarly, a duplicate-key violation (e.g. race-inserting two `buyer_details` rows for the same `contact_id`) would leak the literal constraint name (`buyer_details_contact_id_key`) to the client.
- Fix: never forward `error.message` to the client. Log it server-side, return a generic message:
```js
if (error) {
  console.error('contacts:get', error); // server-side only
  return res.status(500).json({ error: 'Something went wrong. Please try again.' });
}
```
Apply this pattern to all nine call sites listed above.

### [M2] No production error-handling middleware, and `NODE_ENV` is never set anywhere
- **STATUS: FIXED.** Trailing Express error-handling middleware added (logs server-side, returns generic `Internal server error`). `NODE_ENV=development` added to `backend/.env` and `.env.example` so it's always explicitly set, never implicit.
- Severity: Medium
- Location: `backend/src/server.js` (no trailing `(err, req, res, next)` error handler exists); confirmed via repo-wide grep — `NODE_ENV` appears nowhere in `backend/`, `frontend/`, or any config file.
- Attack: For any error path not already handled by an explicit `if (error)` check (e.g. a genuinely unexpected exception thrown synchronously in a route), Express falls back to its built-in default error handler. That default handler includes the stack trace in the HTTP response body whenever `app.get('env') !== 'production'` — and since `NODE_ENV` is never set anywhere in this project, if it's ever deployed to a host that doesn't independently inject `NODE_ENV=production`, every unexpected 500 leaks a full server-side stack trace (file paths, line numbers, dependency versions) to the client.
- Proof: Confirmed by code absence — no error-handling middleware registered in `backend/src/server.js`, and `grep -rn NODE_ENV backend/ frontend/` returns zero matches outside `node_modules`.
- Fix: add both a `NODE_ENV=production` to your deployment environment **and** a defensive final error handler that never depends on that env var being set correctly:
```js
// backend/src/server.js, after all routes
app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).json({ error: 'Internal server error' });
});
```

### [M3] `users` table has no INSERT or DELETE RLS policy — currently safe, but undocumented and fragile
- **STATUS: FIXED (documented, per the audit's own recommendation not to add unused policies yet).** Added migration `20260714090000_document_users_rls_policy_gap.sql` with a real `COMMENT ON TABLE public.users` explaining the deliberate gap. Re-verified live via `select obj_description('public.users'::regclass)` — comment is present and queryable. Re-confirmed all 6 tables still show `rls_enabled: true` after this migration.
- Severity: Medium
- Location: `supabase/migrations/20260714070000_stage1_core_schema.sql` (policies: `"Users can view own row"` SELECT-only, `"Users can update own row"` UPDATE-only) and `supabase/migrations/20260714080000_auto_create_users_row.sql` (the `SECURITY DEFINER` trigger that performs the only INSERT path).
- Attack: None currently — verified live. With RLS enabled and no policy for a given command, Postgres defaults to deny for that command regardless of table grants, so `authenticated`/`anon` cannot INSERT or DELETE `users` rows directly. The only INSERT path is the `SECURITY DEFINER` trigger (`handle_new_auth_user`), which correctly has `EXECUTE` revoked from `anon`/`authenticated` (confirmed via Security Advisor — see below). This is *not* an exploitable gap today.
- Proof: `select schemaname, tablename, policyname, cmd from pg_policies where tablename = 'users'` returns exactly two rows: SELECT and UPDATE. No INSERT/DELETE policy exists. Live test confirmed default-deny holds (see RLS test in the "Multi-tenant isolation" evidence, users-table read-isolation test).
- Fix: not urgent, but make the intent explicit rather than implicit, since a future migration could accidentally add a permissive policy without anyone noticing the gap was ever intentional:
```sql
-- Document the default-deny explicitly, or add scoped policies if you want
-- users to be able to delete their own account later:
create policy "Users can delete own row"
  on public.users for delete
  using (id = auth.uid());
```
Only add this when you actually build account deletion — until then, leave a comment in the migration explaining the gap is deliberate.

### [M4] No length limits on free-text input fields
- **STATUS: FIXED — verified.** `MAX_LENGTHS` map added to `validation/contacts.js` (255 for name/phone/area_of_interest, 50 for phone-adjacent short fields, 500 for property_address, 5000 for notes/condition_notes). Re-tested directly against `validateContactInput`: a 300-char name now returns `["name must be 255 characters or fewer"]`; a normal name passes with no errors.
- Severity: Medium
- Location: `backend/src/validation/contacts.js` — `isNonEmptyString()` (line 4-6) only checks for non-empty, no `maxLength` anywhere; applies to `name`, `phone`, `notes` (`contacts.js` route body), and `beds_wanted`, `area_of_interest`, `property_address`, `condition_notes` (validation file lines 32, 35, 52, 57). Database columns are all unconstrained `text` (`supabase/migrations/20260714070000_stage1_core_schema.sql`).
- Attack: A malicious or compromised authenticated account can submit near-100KB text blobs (bounded only by Express's default `express.json()` body limit) repeatedly into their own rows. This is storage abuse within the attacker's own tenant, not a cross-tenant breach, but it's unbounded today and costs you Supabase storage quota with no cap.
- Fix: add `maxLength` checks in `validateContactInput`/`validateBuyerDetails`/`validateSellerDetails`, e.g. 255 for name/phone/short fields, 5000 for notes-style fields, and reject with a 400 if exceeded.

### [M5] Numeric field validation accepts non-finite values, which then 500 with a leaked DB error
- **STATUS: FIXED — verified.** `toNumberOrUndefined` now checks `Number.isFinite` instead of just `Number.isNaN`. Re-tested directly: `{"budget": "Infinity"}` now returns a validation error (`"buyer_details.budget must be a finite number"`) before ever reaching Postgres; a normal finite value like `15000000` still passes through correctly.
- Severity: Medium (root cause shared with M1)
- Location: `backend/src/validation/contacts.js:8-16`, `toNumberOrUndefined()` — checks `Number.isNaN(num)` but not `Number.isFinite(num)`.
- Attack: `Number('Infinity')` evaluates to `Infinity`, which passes `Number.isNaN` (false) and is accepted as valid. Sending `{"buyer_details": {"budget": "Infinity"}}` on `POST /api/contacts` passes validation, then fails at the Postgres `numeric` column (which rejects `Infinity`/`NaN` unless explicitly declared `numeric` with those allowed — standard Postgres `numeric` does not accept them), producing exactly the M1 error-leak pattern.
- Fix:
```js
function toNumberOrUndefined(value, field, errors) {
  if (value === undefined || value === null || value === '') return undefined;
  const num = Number(value);
  if (!Number.isFinite(num)) {
    errors.push(`${field} must be a finite number`);
    return undefined;
  }
  return num;
}
```

### [M6] Leaked-password protection is disabled at the Supabase Auth level
- **STATUS: OPEN — cannot be fixed from code.** Re-confirmed still WARN via Security Advisor after all other fixes. Requires a Supabase Dashboard change (and first, confirming whether email/password is even enabled) — see "Cannot verify from code" below.
- Severity: Medium
- Location: Supabase project config (not in repo) — flagged by Supabase's own Security Advisor.
- Attack: This only matters if email/password sign-up is actually enabled on the project (see "Cannot verify from code" below — `CLAUDE.md` states Google-only, but that's a stated intent, not a verified Auth-provider setting). If password auth is live, this setting being off means Supabase won't reject passwords found in known breach corpora (HaveIBeenPwned).
- Proof: `get_advisors(type: security)` returned:
  ```
  auth_leaked_password_protection: WARN — "Leaked password protection is currently disabled."
  ```
- Fix: see the manual dashboard check below — first confirm whether email/password is even enabled; if it is, either disable it entirely (matching your stated Google-only design) or turn on leaked-password protection under Authentication → Policies.

## Low findings

### [L1] `GET /api/contacts` has no pagination — full table dump every call
- Severity: Low
- Location: `backend/src/routes/contacts.js:18-23` — fetches every row for the user with no `.range()`/`.limit()`.
- Attack: Not currently exploitable as a DoS given RLS scopes it to one user's own rows, and the PRD targets ~20-100+ contacts. It will not scale gracefully and has no upper bound today — a user (or a bug) that ends up with tens of thousands of rows turns every list load into a large payload.
- Fix: add `.range(offset, offset + limit - 1)` with sane defaults (e.g. 100/page) ahead of building T1.5's UI further, or explicitly document the current-scale assumption.

### [L2] No security-event logging
- Severity: Low
- Location: repo-wide — confirmed via grep, the only `console.*` call in `backend/src` is the startup banner at `backend/src/server.js:31`. `requireAuth.js` logs nothing on auth failure.
- Attack: Not itself exploitable, but it means there is currently no way to detect a credential-stuffing attempt, a token-guessing spree, or an RLS-denied write pattern in progress — you'd only find out after the fact, if at all.
- Fix: log (server-side only, never to the client) at minimum: `requireAuth` failures with IP/timestamp, and 500s with their real error detail (ties into the M1/M2 fixes, which correctly move error detail to server logs instead of the response).

### [L3] Session tokens persisted in `localStorage` (Supabase default)
- Severity: Low (architectural tradeoff, not a code bug)
- Location: `frontend/src/supabaseClient.js` — no custom storage adapter overrides Supabase's default, which persists the session (including `access_token`) in `localStorage` under a `sb-<project-ref>-auth-token` key.
- Attack: Any successful XSS on the frontend origin can read this key directly and exfiltrate a live session token — no additional bypass needed. This is Supabase's documented default behavior and a known industry-wide tradeoff (httpOnly cookies avoid this but introduce CSRF concerns and require a different auth flow), not a Recall-specific bug. It compounds directly with H2 (no CSP) — see the "shortest path" narrative below.
- Fix: not a quick fix — this is an architecture decision. At minimum, closing H2 (CSP) substantially reduces the chance of the XSS that would be needed to exploit this in the first place. If/when this app is deployed with a matching backend session strategy, consider Supabase's cookie-based session helpers for browser clients as a longer-term improvement.

## Cannot verify from code

- **Is email/password sign-up actually disabled in Supabase Auth?** `CLAUDE.md` states "Google Sign-In only — no email/password" as a design rule, but that's an intent statement, not a verified setting — nothing in the repo can prove the Auth provider config. → Check yourself: Supabase Dashboard → Authentication → Sign In / Providers → confirm "Email" is toggled OFF (only Google should be ON).
- **Supabase Auth rate limiting settings** — the built-in per-IP/per-email rate limits on Supabase's own Auth endpoints (separate from the Express-layer gap in H1) aren't visible from this repo. → Check: Supabase Dashboard → Authentication → Rate Limits, confirm the defaults are enabled and haven't been loosened.
- **Leaked password protection** (M6) — confirmed disabled via Security Advisor, but whether it matters depends on the email/password question above. → Check: Supabase Dashboard → Authentication → Policies → "Leaked password protection."
- **Google OAuth client configuration scope** — the Authorized redirect URIs / JavaScript origins set in Google Cloud Console for this OAuth client aren't in this repo. A too-broad redirect URI (e.g. a wildcard subdomain) would allow token interception via an open redirect on a sibling subdomain. → Check: Google Cloud Console → APIs & Services → Credentials → your OAuth 2.0 Client ID → confirm redirect URIs are exact-match, no wildcards, and JavaScript origins list only your real domains (plus localhost for dev).
- **Production HTTPS enforcement** — no deployment config exists in this repo yet (no Vercel/Netlify/Dockerfile/etc.), so HTTPS enforcement depends entirely on whatever host is chosen later. → When you pick a host, confirm HTTPS is enforced (redirect HTTP→HTTPS) both for the frontend and for the Express backend's public URL.
- **Supabase project-level API rate limiting** (Dashboard → Settings → API) — general abuse protection at the platform level, separate from and complementary to fixing H1 in Express. → Check the current defaults are still in place; don't rely on them alone given H1.
- **`storage.buckets`** — confirmed empty (`select id, name, public from storage.buckets` returned zero rows), so no storage-bucket findings apply today. Re-check this the moment Stage 3 (voice notes) adds a bucket — re-verify it's created as **private**, not public, at that time.

## Multi-tenant isolation — evidence, not assertion

Every claim above about RLS was tested live against the actual database, not inferred from the SQL text:

- `anon` role (no JWT at all): `SELECT` on `contacts` → 0 rows visible; `SELECT` on `users` → 0 rows visible; `INSERT` into `contacts` with an attacker-supplied `user_id` → rejected with `new row violates row-level security policy for table "contacts"`.
- Two real (test) users, A and B, via `auth.users` + the T1.3 auto-provisioning trigger: user B, authenticated as themselves, attempting `UPDATE` on user A's `contacts` row → 0 rows affected (confirmed by checking as an unrestricted role within the same transaction that the row was untouched). Same test for `DELETE` → 0 rows affected, row still present.
- User B attempting to `INSERT` a `buyer_details` row pointing at user A's `contact_id` (the join-based ownership policy, not a direct `user_id` column) → rejected with `new row violates row-level security policy for table "buyer_details"`.
- User B attempting to read user A's `public.users` profile row directly by ID → 0 rows visible.

All test rows were cleaned up after each test; no residual test data remains in the project.

## Attacker's shortest path to my data

There is currently no direct path to a cross-tenant data breach — RLS held under every IDOR/anon test above, no secrets are exposed in the repo or its git history, and the API never trusts a client-supplied `user_id`. The realistic shortest paths today are different in kind: (1) **availability/cost**, not confidentiality — flood `/api/me` or `/api/contacts` with no rate limiting (H1) to force unlimited real calls to Supabase's Auth API, a trivial no-login-required DoS/denial-of-wallet; (2) **XSS-then-takeover** — there is zero CSP anywhere (H2) and the session token sits in `localStorage` by Supabase's default (L3), so the day any XSS bug lands in this codebase — and Stage 3's planned WhatsApp-text and voice-transcript rendering is exactly the kind of attacker-controlled content that tends to introduce one — it becomes an instant, fully-mitigated-by-nothing account takeover. Fix H1 and H2 before Stage 3 begins; they're cheap now and become load-bearing the moment untrusted content enters the app.
