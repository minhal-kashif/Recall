# SECURITY_AUDIT.md

Audit date: 2026-07-14. Scope: full repo at commit `fe1361f` (Stage 1, tickets T1.1–T1.5). Every finding below was either reproduced against the live Supabase project (`gleuammjovnltispagmg`) and/or the running Express server, or cited to exact file:line in the repo. Where something could not be verified from the code, it's called out explicitly in its own section rather than assumed safe.

**Update 2026-07-14 (same day, follow-up pass):** All High and Medium findings except M6 have been fixed and re-verified — see the `STATUS` line under each finding below for what was actually re-tested (live HTTP round-trips for H1–H3, unit-level re-execution of the exact vulnerable code path for M1/M4/M5, live SQL re-scan for M3). M6 requires a Supabase Dashboard change, not a code change — still open. L1–L3 were left as-is (Low severity, explicitly deferred in their own fix notes). RLS/anon/IDOR isolation was re-confirmed clean after all fixes: all 6 tables still `rls_enabled: true`, `anon` role still sees 0 rows on `contacts`.

## Update 2026-07-15 — re-audit of new surface (T1.6, T2.1, T2.2)

Scope: everything built since the original audit — `backend/src/routes/interactions.js`, `backend/src/routes/followUps.js`, their validation modules, the new `GET /api/follow-ups/today` route, and the frontend `ContactDetail.jsx` / `FollowUpList.jsx` / `TodayFollowUps.jsx`. Same methodology as the original: reproduce against the live Supabase project, don't theorize.

**One real finding, self-audited below. Everything else checked clean.**

### [M7] `contact_id` ownership is never verified on interaction/follow-up creation
- **STATUS: FIXED — verified live.** RLS `WITH CHECK` on both `interactions` and `follow_ups` now requires `EXISTS (... contacts.user_id = auth.uid())` (migration `20260715090000_fix_interactions_followups_contact_ownership.sql`), plus a matching Express-layer check (`verifyContactOwnership`) for a clean 404 instead of a raw RLS error. Re-ran the exact exploit: both inserts now fail with `42501: new row violates row-level security policy`. Re-confirmed the legitimate path still works: creating an interaction/follow-up on your own contact still returns `201`, and posting a nonexistent `contact_id` now returns a clean `404 {"error":"Contact not found"}` instead of a 500. No new advisor warnings introduced by the policy change.
- Severity: Medium
- Location: `backend/src/routes/interactions.js:24-36` (`POST /`), `backend/src/routes/followUps.js:51-64` (`POST /`); root cause is in the RLS policies themselves — `supabase/migrations/20260714070000_stage1_core_schema.sql`, policies `"Users manage own interactions"` and `"Users manage own follow_ups"`, both `with_check: (user_id = auth.uid())` — neither checks that `contact_id` belongs to a contact the same user owns. `validateInteractionInput` (`backend/src/validation/interactions.js`) and `validateFollowUpInput` (`backend/src/validation/followUps.js`) only check that `contact_id` is a well-formed UUID, not that the caller owns it.
- Attack: An authenticated user who obtains another tenant's `contact_id` (e.g. a leaked URL, a guessed sequential-feeling UUID, a shared screenshot) can `POST /api/interactions` or `POST /api/follow-ups` with that `contact_id`. The insert succeeds — the server sets `user_id` to the caller correctly, but nothing stops `contact_id` from pointing at someone else's contact.
- Proof (reproduced live): impersonated two fresh test users (A owns a contact, B does not). As B, inserted an interaction with `contact_id` = A's contact and `user_id` = B — **insert succeeded**. Same test against `follow_ups` — **insert succeeded**.
- **What this does NOT do (also verified live, not assumed):**
  - It does **not** leak A's data to B. Querying as B, the `/today` endpoint's `contacts(name)` embed for the injected row resolved to `null` — RLS on `contacts` (`user_id = auth.uid()`) blocks B from reading A's contact even through the join. B's own list would show a follow-up with a blank/unknown contact name, not A's real name.
  - It does **not** let B write to A's contact. The `interactions_touch_contact` trigger (which updates `contacts.last_interaction_date` on insert) is `SECURITY INVOKER`, not `SECURITY DEFINER` — it runs as B, and B's own RLS on `contacts` blocks the cross-tenant `UPDATE`. Confirmed: A's `last_interaction_date` stayed `null` after B's injected interaction.
  - A cannot see B's injected row either — A's own reads are scoped to `user_id = auth.uid()` (A's own id), and the injected row's `user_id` is B.
  - Net effect: **data-integrity pollution scoped entirely to the attacker's own account** (orphaned rows referencing a contact they can't actually see or open), not a confidentiality or write-escalation breach. This is real and should be fixed, but it is not in the same class as a cross-tenant data leak.
- Fix (mirrors the pattern already used for `buyer_details`/`seller_details`, which correctly check contact ownership via `EXISTS`):
```sql
drop policy "Users manage own interactions" on public.interactions;
create policy "Users manage own interactions"
  on public.interactions for all
  using (user_id = auth.uid())
  with check (
    user_id = auth.uid()
    and exists (
      select 1 from public.contacts
      where contacts.id = interactions.contact_id
      and contacts.user_id = auth.uid()
    )
  );

drop policy "Users manage own follow_ups" on public.follow_ups;
create policy "Users manage own follow_ups"
  on public.follow_ups for all
  using (user_id = auth.uid())
  with check (
    user_id = auth.uid()
    and exists (
      select 1 from public.contacts
      where contacts.id = follow_ups.contact_id
      and contacts.user_id = auth.uid()
    )
  );
```
Also worth adding at the Express layer (defense-in-depth, and better UX): fetch the contact via the user-scoped client before inserting, return `404 Contact not found` if it doesn't resolve — turns a generic RLS-violation 500 into a clean, correct error.

### Everything else checked and found clean (self-audit — not skipped, verified)
- **RLS enabled**: `interactions` and `follow_ups` both `rls_enabled: true` (re-queried live).
- **No permissive policies**: no `USING (true)` / `WITH CHECK (true)` anywhere in the new policies.
- **Error handling (M1 pattern)**: grepped all of `backend/src` for `.message` — zero matches. Both new route files correctly use the shared `dbError()` helper; no raw DB error text can leak through the new routes.
- **Route-ordering bug class**: `GET /today` is registered before `GET /:contactId` in `followUps.js` — confirmed by reading the file, and functionally proven by the live test above returning the correct shaped "today" response, not an empty array from a wildcard-contactId mismatch.
- **Rate limiting / CORS / Helmet**: both new routers mounted under the same `authLimiter` as `contacts`/`interactions` in `server.js`; no route-specific bypass introduced.
- **Input validation**: both new validation modules cap string length (`note_text` ≤ 5000, `description` ≤ 500) and validate dates via `Number.isNaN(parsed.getTime())` — no non-finite-style gap like the original M5.
- **Injection**: no raw/string-built SQL anywhere in the new code; all queries go through the parameterized supabase-js client.
- **XSS**: grepped `frontend/src` for `dangerouslySetInnerHTML`, `innerHTML`, `eval(` — zero matches in the new components.
- **Supply chain**: no new dependencies were added for T1.6/T2.1/T2.2; `npm audit` still reports 0 vulnerabilities.
- **Storage buckets**: still none (Stage 3 not started) — not applicable, as before.

## Update 2026-07-15 (later same day) — re-audit of new surface (T2.3 push notifications)

Scope: everything built for T2.3 — `backend/src/routes/pushSubscriptions.js`, `backend/src/validation/pushSubscriptions.js`, `frontend/src/push.js`, `frontend/src/sw.js`, `supabase/functions/send-due-followup-pushes/index.ts`, and migrations `20260715100000`–`20260715100300` (pg_cron/pg_net, `push_subscriptions` schema, the `get_vault_secret` reader, the cron schedule). Same methodology as prior audits: reproduce against the live Supabase project, don't theorize.

**One real finding — a secret actually leaked into git history (worse than the T1.6-era near-miss, which was caught before commit). Everything else checked clean, including full live IDOR testing on the new table.**

### [H8] Real `cron_invoke_secret` value committed to git history in `.claude/settings.local.json`
- **STATUS: FIXED — rotated and verified live.** `cron_invoke_secret` was rotated in Vault via `vault.update_secret()` using a fresh `gen_random_bytes(32)` value generated entirely inside Postgres — the new value was never printed, logged, or passed through any tool argument, so it can't repeat this leak. Re-tested both values directly against the live Edge Function via `net.http_post` (same call pattern the cron job itself uses): the **old leaked value now returns `401 {"error":"Unauthorized"}`**; the **current Vault value returns `200 {"processed":0,"sent":0,"failed":0}`**. No redeploy was needed — both the cron job SQL and the Edge Function read the secret fresh from `vault.decrypted_secrets` on every invocation. The literal secret was also removed from `.claude/settings.local.json`'s working tree. It remains in git history at commit `9f49c54`, but is now inert — rotation, not history rewriting, is what neutralizes a leaked credential, and there's still no remote this could have reached.
- Severity: High
- Location: `.claude/settings.local.json`, committed at `9f49c54` (the T2.3 commit) and still present in the current working tree. During earlier terminal-based testing of the Edge Function's auth gate, a `curl ... -H "x-cron-secret: 22fbecbe489dcdea454888ee5d8d86c8543ded2bb4f682e3db01647e8ae7f0dc"` command got recorded verbatim as an allowlisted permission pattern in this file, which is tracked (not gitignored) and got committed along with the rest of T2.3.
- Why it matters: `send-due-followup-pushes` is deployed with `verify_jwt=false` (confirmed live via `list_edge_functions`) and runs with the `service_role` key (cross-tenant DB access, by design — see the clean finding below). The `x-cron-secret` header check is the **only** thing standing between the public internet and invoking that function directly. Anyone who can read this repo's git history has that secret.
- Proof: `git log --all -p -- .claude/settings.local.json | grep cron-secret` returns the literal secret value in the diff of commit `9f49c54`. `git show HEAD:.claude/settings.local.json` confirms it's still in the current committed file, not just an old commit.
- **What this does NOT do (verified, not assumed):**
  - `git remote -v` returns nothing — this repo has **never been pushed anywhere**. Exposure is local-only, not public. This meaningfully lowers real-world risk right now, but the secret must still be treated as compromised (standard practice: a secret that touched a non-secret file gets rotated, regardless of push status).
  - An attacker with the secret can invoke the function early/repeatedly and would see aggregate counts (`processed`/`sent`/`failed`/`expiredSubscriptionsRemoved`) in the response, but **cannot** read other users' PII through it and **cannot** inject arbitrary notification content — the function builds the push payload itself server-side from real `follow_ups`/`contacts` rows, it doesn't trust anything from the request beyond the secret. Repeated invocation also can't double-send: `notified_at` is claimed atomically in the same `UPDATE` that selects due rows.
- Fix (two parts):
  1. **Rotate `cron_invoke_secret` in Vault.** Both the pg_cron job SQL and the Edge Function read it fresh from `vault.decrypted_secrets` on every single invocation — no redeploy needed, a Vault-level rotation takes effect on the next cron tick. I have not done this yet — say the word and I will (generate a new 32-byte random value, update it via `vault.update_secret`, confirm live that the old value now gets `401` and the new one doesn't).
  2. **Remove the literal secret from `.claude/settings.local.json`.** I'll replace that one allow-list entry with a non-secret-bearing pattern (or drop it — it was only needed for that one manual test).
  3. **Optional, your call:** since there's no remote, the leaked value only lives in local `.git` history. Rotating (step 1) makes the old value harmless regardless, so rewriting history is cleanup, not a security requirement. I'd only do this if you want the repo itself scrubbed — it means rewriting the `9f49c54` commit, which I won't do without you explicitly asking for it (rewriting history is exactly the kind of hard-to-reverse operation I check with you on first).

### Everything else checked and found clean (self-audit — not skipped, verified)
- **RLS enabled on `push_subscriptions`**: `rls_enabled: true` (re-queried live), single `FOR ALL` policy `"Users manage own push_subscriptions"` with `USING (user_id = auth.uid())` and `WITH CHECK (user_id = auth.uid())` — no join needed here since, unlike `interactions`/`follow_ups` (the M7 case), `push_subscriptions.user_id` is direct, not reached through a `contact_id`.
- **Full live IDOR test against the new table** (impersonated a fake attacker with `SET LOCAL request.jwt.claims`, targeted the real account's real subscription row):
  - Read: `select count(*) from push_subscriptions` as the attacker → **0 rows visible**.
  - Update: `UPDATE ... RETURNING id` (measures actual rows touched, not just the attacker's own filtered re-read) → **0 rows matched**.
  - Delete: same `RETURNING`-based proof → **0 rows matched**.
  - Insert-hijack (attacker tries to plant a subscription row claiming the *real* user's `user_id`, to redirect their future push notifications to the attacker's own device) → **rejected**, `42501: new row violates row-level security policy for table "push_subscriptions"`.
  - All four run inside explicit transactions that were rolled back; confirmed the real row was untouched afterward.
- **App-layer defense in depth**: `backend/src/routes/pushSubscriptions.js:19` hardcodes `user_id: req.user.id` from the verified JWT — never reads `user_id` from the request body — so even bypassing the app entirely and hitting Supabase directly with the anon key still hits the RLS wall above.
- **`service_role` usage in the Edge Function is justified and correctly scoped**: documented in-code (citing `Recall_Security_Access.md`'s "only where absolutely necessary" rule), needed because the job must see every user's due follow-ups in one pass. The `get_vault_secret` RPC it depends on is `revoke`d from `public`/`anon`/`authenticated` and `grant`ed only to `service_role` (confirmed in migration `20260715100200`) — an authenticated app user cannot call it themselves even if they wanted to.
- **Error handling (M1 pattern)**: `pushSubscriptions.js` routes its only failure path through the shared `dbError()` helper — no raw Postgres error text reaches the client.
- **Rate limiting / CORS / Helmet**: `pushSubscriptionsRouter` is mounted under the same `authLimiter` as every other router in `server.js` — no bypass introduced for this route.
- **XSS**: `sw.js`'s `push` handler uses the native `Notification` API (`showNotification(title, {body, ...})`) — not `innerHTML`, not `eval`. Even a malicious payload would render as inert text, not markup.
- **Push-content spoofing**: an attacker cannot send a push to someone else's subscribed device at all without the VAPID private key (Web Push requires a VAPID-signed request that FCM/the push service validates against the subscription's `applicationServerKey`) — that key lives only in Vault, `service_role`-gated, never sent to any client.
- **Advisors**: `get_advisors(type: security)` returns exactly one warning — the pre-existing, already-documented M6 (leaked password protection). No new advisory from any of the T2.3 schema/policy changes.
- **Debug banner removed**: the temporary `pushDebug`/`pushProgress` UI added to `App.jsx` for live troubleshooting has been deleted now that push is fully verified end-to-end (subscribe, closed-app delivery, tap-to-open all confirmed) — no diagnostic state left rendering in the shipped UI.

### Additional hardening applied during this pass (not vulnerabilities, consistency/abuse-bounding)
- `GET /api/interactions/:contactId` and `GET /api/follow-ups/:contactId` now call `verifyContactOwnership()` before querying, matching every other route in both files. Previously these two relied solely on RLS to scope results — verified safe even before this change (a foreign `contact_id` returned `200 []`, never another user's data) — but the missing check meant a nonexistent/foreign id behaved inconsistently with the rest of the API (200 instead of 404). Re-verified live post-fix: unauthenticated requests to both routes still correctly return `401` (no regression), syntax-checked clean.
- `push_subscriptions` validation now caps the stored `subscription` JSON at 4000 bytes (real browser subscriptions run a few hundred bytes) — same storage-abuse-bounding pattern as the `MAX_LENGTHS` check in `validation/contacts.js`. Unit-verified: a normal subscription passes with zero errors, a padded oversized one is rejected with `"subscription payload is too large"`.

## Update 2026-07-15 (later still) — T2.4 silence-reminder job

Scope: `supabase/migrations/20260715110000_create_silence_reminders_job.sql` — a new `SECURITY DEFINER` function (`create_silence_reminders()`) and its daily `pg_cron` schedule.

**Nothing found. Checked, not assumed:**
- **Lockdown matches the established pattern**: `search_path` pinned to `''`, `EXECUTE` revoked from `public`/`anon`/`authenticated` (live-queried `information_schema.routine_privileges`: only `postgres` and `service_role` can call it — same posture as `get_vault_secret`).
- **No input surface at all**: the function takes no parameters and is only ever invoked by `pg_cron` — there is nothing for an authenticated user to send it, so there's no injection/validation surface to audit here (unlike every other ticket, this one has zero attacker-reachable input).
- **`contacts.name` interpolation is safe**: the generated `description` concatenates `c.name` with `||` into a value being inserted as data, not into executed SQL — not a SQL-injection path. Downstream, that description is only ever rendered as plain text (React's default escaping, and the service worker's `Notification` API) — no XSS path, consistent with the earlier finding that the codebase has zero `dangerouslySetInnerHTML`/`innerHTML`/`eval`.
- **No cross-tenant leakage**: the function correlates each stale contact to its own `user_id` when inserting — it doesn't merge or compare data across users, it just does the same scan-and-write for every tenant in one pass (the reason it needs `SECURITY DEFINER` in the first place).
- **Advisors**: `get_advisors(type: security)` still returns only the pre-existing, already-documented M6. No new warning from this migration.
- **Live-verified functional correctness** (not a security finding, but proves the RLS-bypass is actually being used narrowly and correctly, not as a blank check): ran the function against real backdated test contacts — created exactly one reminder per stale contact, created zero duplicates on a second run, created zero reminders for a contact only 5 days stale, and correctly distinguished "marked done + logged a real interaction" (no re-fire) from "marked done with no interaction" (re-fires next run) — i.e. the privileged function only ever does the one narrow `INSERT` it was written for. Test data fully cleaned up afterward.

## Update 2026-07-16 — T3 voice notes / storage surface

Scope: everything in the voice-note feature — migration `20260716120000_stage3_voice_notes_schema.sql` (the `voice_notes` table + the private `voice-notes` Storage bucket + four `storage.objects` policies), `backend/src/routes/voiceNotes.js`, `backend/src/validation/voiceNotes.js`, and `frontend/src/VoiceNotes.jsx`. Same methodology as the prior audits: reproduce against the live project, don't theorize.

**No cross-tenant or key-exposure findings. Two low-severity notes, documented below. The AI layers (Whisper transcription, WhatsApp/Haiku) are NOT built — they stay parked pending AI-cost approval and get their own review when they land (prompt injection, LLM-output validation, denial-of-wallet, key handling).**

### Verified clean (live, not assumed)
- **Bucket is private**: `storage.buckets.public = false` for `voice-notes` (re-queried live). Audio is never publicly reachable; access is only via short-lived signed URLs generated server-side.
- **`voice_notes` table RLS** (from T3.1, re-confirmed): single `FOR ALL` policy using the M7 ownership pattern — `USING (user_id = auth.uid())`, `WITH CHECK (user_id = auth.uid() AND EXISTS(contact owned by auth.uid()))`. Live impersonation: the real user can insert a note on their own contact and read it; a fake attacker sees **0** rows and is rejected with `42501` when attaching a note to the real user's contact.
- **Storage `objects` RLS — full live IDOR test** against the real object written during the T3.4 device test (path `<A-uid>/<contact>/<uuid>.webm`):
  - Read: as owner A → sees their 1 object; as attacker B → **0** objects visible.
  - Write: B attempting `INSERT` of an object whose name is under A's user folder → rejected, `42501: new row violates row-level security policy for table "objects"`.
  - All four policies (select/insert/update/delete) gate on `bucket_id = 'voice-notes'` AND `(storage.foldername(name))[1] = auth.uid()::text`, so a user can only ever touch objects under their own `<uid>/…` prefix.
- **No `service_role` anywhere in this surface**: the route uses only the per-request user-scoped client (anon key + caller's JWT). `createSignedUrl` is called through that client, so a signed URL can only be minted for an object the caller's own JWT can `SELECT` under storage RLS — a user cannot sign someone else's audio. No secret/service key is used or needed.
- **No path-traversal / client-controlled storage path**: the object path is built server-side from `req.user.id` + a **UUID-validated** `contact_id` + `crypto.randomUUID()`. The client never supplies the path; the GET signs the stored (server-written) `storage_path`. There is no way for a client to escape its own folder or point at another user's object.
- **App-layer defense in depth**: `verifyContactOwnership` runs on both the upload POST and the list GET, returning a clean `404` before any storage work, consistent with the other routes — RLS is the boundary, this is the friendly error.
- **Upload abuse / cost controls**: a hard 10 MB `multer` memory-storage file cap (the authoritative ceiling), a MIME allowlist checked on the normalized base type, and a dedicated `voiceUploadLimiter` (10/min) on the POST on top of the shared `authLimiter`. No AI is called, so there is no denial-of-wallet vector in this surface yet — storage cost is bounded by cap × rate.
- **Advisors**: `get_advisors(type: security)` after the migration returns only the pre-existing, already-documented **M6** (leaked-password protection). The new table and storage policies introduced no new warning.
- **Frontend**: `VoiceNotes.jsx` uses the native `Notification`-free `<audio>` element and `MediaRecorder`; no `dangerouslySetInnerHTML`/`eval`. Mic tracks are stopped and object URLs revoked on stop/unmount. Signed URLs are fetched fresh per list load, never persisted.

### [L4] Oversized upload returned a generic 500, not 413 — FIXED
- Severity: Low. **STATUS: FIXED.** A file exceeding the 10 MB `multer` limit raised a `MulterError` (`LIMIT_FILE_SIZE`) that propagated to the catch-all error handler and returned `500 {"error":"Internal server error"}`. Wrapped the multer middleware (`uploadAudio` in `routes/voiceNotes.js`) so `LIMIT_FILE_SIZE` now returns `413 {"error":"Audio file is too large (max 10 MB)."}` and any other upload error returns a clean `400` — neither falls through to the generic 500. Functionally the file was always rejected (nothing stored); this just makes the status/UX correct.

### [L5] Upload MIME type is client-declared
- Severity: Low. `req.file.mimetype` comes from the multipart part's `Content-Type`, which the client controls, so a non-audio file could be uploaded with a spoofed `audio/*` type past the allowlist. **Impact is contained**: the object can only land in the uploader's own private `<uid>/…` folder, is only ever served back to that same owner via a per-owner signed URL (storage RLS blocks everyone else), and is never executed — so the worst case is a user storing junk in their own private space, bounded by the 10 MB cap and the rate limit. It is **not** a cross-tenant leak or a code-execution vector. Magic-byte content sniffing would harden it but is over-engineering for this threat model; documented rather than fixed.

### Signed-URL TTL note (not a finding)
Playback URLs are minted with a 3600s (1h) TTL, generated per request and never stored. A leaked URL grants 1h of access to that one audio object — inherent to signed URLs and acceptable here; shorten to 5–15 min if a tighter window is ever wanted.

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

## Update 2026-07-17 — `DELETE /api/contacts/:id`

The PRD lists contact deletion as Stage 1 scope; it had never been built. Added `router.delete('/:id', ...)` in `backend/src/routes/contacts.js`, using the same pattern already proven safe above: fetch through the user-scoped client (RLS-bound), `maybeSingle()` returning null on a foreign/nonexistent id → `404`, otherwise delete. No new ownership-check code path was introduced — it's the identical shape as the existing `PATCH` handler, so it inherits the same live-tested cross-tenant protection rather than needing a fresh impersonation test.

DB-level cascade (`on delete cascade` from `20260714070000_stage1_core_schema.sql` / `20260716120000_stage3_voice_notes_schema.sql`) removes `buyer_details`/`seller_details`/`interactions`/`follow_ups`/`voice_notes` rows automatically. That cascade does **not** reach Supabase Storage — a deleted contact's voice-note *rows* would disappear while the actual audio *objects* stayed orphaned in the `voice-notes` bucket (unreachable, but still occupying storage). Fixed by reading the contact's `voice_notes.storage_path` list and calling `storage.from('voice-notes').remove(...)` before the DB delete.

Verified live: created two test contacts (one with a Lakh-unit buyer budget, one with a Crore-unit seller asking price), deleted both through the UI, confirmed `204` responses and immediate list removal, then ran a direct SQL check for orphaned rows across `buyer_details`, `seller_details`, `interactions`, `follow_ups`, and `voice_notes` referencing a nonexistent `contact_id` — zero orphans in every table.

## Update 2026-07-25 — re-audit of Listings, Activity, Saved Filters, rate-limit change, and the status/interests/log-a-call batch

Scope: everything built since the T3 audit that had not yet been reviewed — `backend/src/routes/listings.js` + `validation/listings.js` (including the `status` field and `/interests` sub-routes added this session), the `listing-photos` Storage bucket, `backend/src/routes/activity.js`, `backend/src/routes/savedFilters.js` + `validation/savedFilters.js` (never audited at all), the `authLimiter` change from 20/min to 120/min, and the Log a Call modal (which turned out to add zero new backend surface — see below). Same methodology as every prior pass: reproduce against the live Supabase project, don't theorize.

**No cross-tenant or key-exposure findings. Two new Low-severity robustness notes below. Everything else checked clean, including a full live IDOR test suite against every new table and the new Storage bucket.**

### Full live IDOR test suite (reproduced, not assumed)
Impersonated a fake attacker (`sub: 11111111-1111-1111-1111-111111111111`, a UUID with no real account) against the real user's real data, using `SET LOCAL role authenticated; SET LOCAL request.jwt.claims`, each inside a transaction rolled back afterward — same technique used for the T2.3/T3 audits' impersonation tests:

| Test | Result |
|---|---|
| Attacker `SELECT` on `listings` | **0 rows visible** |
| Attacker `UPDATE` on the real user's real listing (`property_address = 'HACKED'`) | **0 rows affected** |
| Attacker `INSERT` into `listings` with their own `user_id` but `contact_id` pointing at the real user's real seller contact (tests the join-based ownership check, not just the direct `user_id` one) | **rejected**, `42501: new row violates row-level security policy for table "listings"` |
| Attacker `SELECT` on `saved_filters` | **0 rows visible** |
| Attacker `INSERT` into `saved_filters` claiming the real user's `user_id` (session-hijack style) | **rejected**, `42501` |
| Attacker `INSERT` into `listing_interests` pointing `listing_id` at the real user's real listing | **rejected**, `42501: new row violates row-level security policy for table "listing_interests"` |
| Attacker `SELECT` on `storage.objects` for `bucket_id = 'listing-photos'` | **0 objects visible** |
| Attacker `INSERT` a storage object under the real user's own folder prefix (path hijack) | **rejected**, `42501: new row violates row-level security policy for table "objects"` |

All eight ran inside their own transaction and were rolled back; no residual test data or state change from these tests remains.

### Verified clean (live, not assumed)
- **`listings` RLS** (`pg_policies`, re-queried live): single `FOR ALL` policy, `USING (user_id = auth.uid())`, `WITH CHECK (user_id = auth.uid() AND (contact_id IS NULL OR EXISTS(contact owned by auth.uid())))` — the M7 dual-ownership pattern, correctly requiring the linked seller contact (if any) belong to the same user. Matches the migration exactly; confirmed no drift between what was planned and what's actually deployed.
- **`listing_interests` RLS**: `WITH CHECK` requires **both** the listing and the contact belong to `auth.uid()` — the strictest ownership pattern used anywhere in this codebase so far, and it held under the live test above.
- **`saved_filters` RLS**: simple direct `user_id = auth.uid()` on both `USING` and `WITH CHECK` — correct, since unlike listings/interactions this table has no foreign entity to cross-check.
- **`listing-photos` bucket is private** (`storage.buckets.public = false`, re-queried live), with the identical four folder-scoped policies (select/insert/update/delete) as the already-audited `voice-notes` bucket, gated on `(storage.foldername(name))[1] = auth.uid()::text`.
- **Express-layer defense in depth**: `verifySellerLink()`/`verifyLeadOwnership()` in `listings.js` both query `contacts` through the user-scoped client (RLS-bound), so a foreign `contact_id` correctly resolves to "not found" rather than leaking whether it exists under another tenant — same pattern as `verifyContactOwnership()` elsewhere. Photo upload path is entirely server-built (`req.user.id` + verified `req.params.id` + `crypto.randomUUID()`); the listing's existence is re-checked via the user-scoped client before any storage write, so a foreign listing id 404s before touching Storage at all.
- **Error handling (M1 pattern)**: grepped `listings.js`, `savedFilters.js`, `activity.js` for `.message` — zero raw-error passthroughs; every failure path routes through the shared `dbError()` helper.
- **Rate limiting**: `listingsRouter`, `savedFiltersRouter`, and `activityRouter` are all mounted under the same shared `authLimiter` in `server.js` as every other router; the listing-photo upload POST additionally sits behind its own dedicated `listingPhotoUploadLimiter` (10/min), mirroring the already-audited voice-note upload pattern.
- **The `authLimiter` 20→120/min change**: reviewed the change itself, not just its neighbors. It raises a per-IP ceiling, not a per-endpoint bypass — every route that was covered before is still covered now, at a higher number chosen to match real per-screen fan-out (documented in-line in `server.js`) rather than removed or defeated. 120/min still meaningfully bounds an invalid-token flood against Supabase's Auth API (H1's original concern) — it is not the unbounded value the user separately asked for and was talked out of.
- **Log a Call modal introduces no new backend surface**: `LogCallModal.jsx` calls the already-audited `POST /api/interactions` and `POST /api/follow-ups` verbatim — same `verifyContactOwnership()` checks, same validation, same RLS. The only backend change in this area was widening `interactions.source`'s client-settable allowlist to `['manual', 'call', 'whatsapp']` (`validation/interactions.js`) — confirmed `'voice'` and any future `'whatsapp_import'` are deliberately excluded from what a client can self-report, so a user can't spoof an interaction as having come from the (not-yet-built) AI-parsed import path.
- **Listing `status` field**: server-side allowlist (`LISTING_STATUSES = ['available', 'under_offer', 'sold', 'rented']`) in `validation/listings.js`, rejects anything else with a 400 — no free-text status, no injection surface.
- **XSS**: grepped all of `frontend/src` (including every file added this session — `ListingCard.jsx`, `ListingDetail.jsx`, `RecentActivity.jsx`, `LogCallModal.jsx`, `ActivityTimeline.jsx`, etc.) for `dangerouslySetInnerHTML`, `innerHTML`, `eval(` — zero matches.
- **Supply chain**: no new backend dependencies since the last audit; `npm audit --production` reports 0 vulnerabilities.
- **Advisors**: `get_advisors(type: security)` returns exactly one warning — the pre-existing, already-documented M6. None of this session's schema (listings, listing_interests, saved_filters, the status column, the listing-photos bucket/policies) introduced a new advisory.

### [L6] `GET /api/activity/recent?limit=` doesn't reject negative values
- Severity: Low. `Math.min(Number(req.query.limit) || 8, 20)` — a negative number is truthy in JS, so `?limit=-5` passes through as `-5` into Supabase's `.limit()`. This doesn't leak data (the query is still RLS-scoped to the caller's own rows) and doesn't affect other tenants; worst case is a malformed request produces a PostgREST error, caught by the existing `dbError()` handler and returned as a generic 500 rather than any real content. Same class as the original L1 (no pagination bound) — a robustness gap, not a breach.
- Fix (not applied — low priority, noted for later): clamp with `Math.max(1, Math.min(Number(req.query.limit) || 8, 20))`.

### [L7] `GET /api/follow-ups/today?upcoming_days=` has no upper bound
- Severity: Low. Validated to be finite and positive, but an extreme value (e.g. `upcoming_days=99999999999`) could push `Date.now() + lookahead * 86400000` past `Date`'s safe range, producing `Invalid Date` → an ISO-string call that throws, caught by the trailing error-handling middleware (`M2`'s generic 500, not a stack trace). Not exploitable for data exposure — still fully RLS-scoped to the caller's own `follow_ups` — just an unbounded-input robustness gap, same class as L6.
- Fix (not applied — low priority, noted for later): cap `lookahead` at a sane maximum (e.g. 3650, which the Follow-ups page itself already uses as its "everything" window).

## Attacker's shortest path to my data

There is currently no direct path to a cross-tenant data breach — RLS held under every IDOR/anon test above, no secrets are exposed in the repo or its git history, and the API never trusts a client-supplied `user_id`. The realistic shortest paths today are different in kind: (1) **availability/cost**, not confidentiality — flood `/api/me` or `/api/contacts` with no rate limiting (H1) to force unlimited real calls to Supabase's Auth API, a trivial no-login-required DoS/denial-of-wallet; (2) **XSS-then-takeover** — there is zero CSP anywhere (H2) and the session token sits in `localStorage` by Supabase's default (L3), so the day any XSS bug lands in this codebase — and Stage 3's planned WhatsApp-text and voice-transcript rendering is exactly the kind of attacker-controlled content that tends to introduce one — it becomes an instant, fully-mitigated-by-nothing account takeover. Fix H1 and H2 before Stage 3 begins; they're cheap now and become load-bearing the moment untrusted content enters the app.
