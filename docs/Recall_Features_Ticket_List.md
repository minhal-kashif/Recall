# Recall — Features Ticket List

**Status:** Draft v1
**Last updated:** 26 July 2026 — T4.6 updated for the nav restructure (Contacts tab added, center Add removed) and the plot/land property type + Listings row-card layout
**Companion docs:** Recall_PRD.md, Recall_Technical_Architecture.md, Recall_Security_Access.md

Each ticket is meant to be handed to Claude Code roughly as-is, one at a time, in order. Acceptance criteria define "done." Dependencies show what must exist first.

---

## STAGE 1 — Core Foundation

### T1.1 — Project setup
**Description:** Initialize the project: Node.js + Express backend, PWA frontend scaffold, connect to a new Supabase project.
**Acceptance criteria:**
- Repo structure in place (backend/, frontend/)
- `.env.example` committed, real `.env` in `.gitignore`
- Supabase project created, connection verified from backend
- App runs locally end to end (even a blank screen counts, as long as frontend can hit backend can hit Supabase)
**Dependencies:** Supabase account created (Minhal), API credits/keys not required yet

---

### T1.2 — Database schema
**Description:** Create all Stage 1 tables in Supabase per Recall_Technical_Architecture.md: `users`, `contacts`, `buyer_details`, `seller_details`, `interactions`, `follow_ups`.
**Acceptance criteria:**
- All tables created with exact columns/types from the architecture doc
- Row-Level Security enabled on every table
- RLS policy tested: a second test user cannot see the first user's rows
**Dependencies:** T1.1

---

### T1.3 — Google Sign-In authentication
**Description:** Implement login via Supabase Auth + Google OAuth. On first login, create a corresponding row in `users`.
**Acceptance criteria:**
- "Continue with Google" button works end to end
- New user gets a `users` row created automatically
- Returning user logs in without duplicate rows
- Logged-out state blocks access to all other screens
**Dependencies:** T1.1, T1.2

---

### T1.4 — Add / edit contact (with type-specific fields)
**Description:** Build the "add contact" form and its API endpoint. Form shows shared fields always, plus Buyer/Lead fields or Seller fields depending on selected type (per PRD Stage 1).
**Acceptance criteria:**
- Selecting "Buyer" or "Lead" shows: budget, beds wanted, size wanted, property type wanted, area of interest
- Selecting "Seller" shows: property address, asking price, beds, size, property type, condition notes
- Saving creates a `contacts` row plus the matching `buyer_details` or `seller_details` row
- Editing an existing contact pre-fills and updates correctly
**Dependencies:** T1.2, T1.3

---

### T1.5 — Contact list + search/filter
**Description:** Build the main contact list screen.
**Acceptance criteria:**
- Lists all contacts belonging to the logged-in user only
- Search by name or phone
- Filter by type (Buyer/Seller/Lead), property type, and area of interest
- Tapping a contact opens its detail view
**Dependencies:** T1.4

---

### T1.6 — Contact detail view + manual interaction log
**Description:** Build the contact detail screen showing all fields plus a chronological interaction history, with the ability to add a new manual note.
**Acceptance criteria:**
- All contact fields displayed clearly (grouped by shared / buyer / seller as relevant)
- List of past interactions shown newest-first
- "Add note" creates a new `interactions` row and updates `contacts.last_interaction_date`
**Dependencies:** T1.4, T1.5

---

## STAGE 2 — Follow-Up Engine

### T2.1 — Follow-up creation + management
**Description:** Allow creating a follow-up on a contact (description + due date), and marking it done, snoozed, or rescheduled.
**Acceptance criteria:**
- "Add follow-up" available from contact detail screen
- Follow-up stored in `follow_ups` with status `pending`
- Actions available: mark done, snooze (pick new date), reschedule
- Multiple follow-ups per contact supported and all visible
**Dependencies:** T1.6

---

### T2.2 — "Today's Follow-Ups" home screen
**Description:** Replace the default landing screen with a list of all follow-ups due today or overdue, across all contacts.
**Acceptance criteria:**
- Query matches logic in Recall_Technical_Architecture.md (`status = pending`, `due_date <= now()`)
- Sorted by due date
- Each item shows contact name, follow-up description, and links to contact detail
- Empty state shown clearly when nothing is due
**Dependencies:** T2.1

---

### T2.3 — Push notifications for due follow-ups
**Description:** Implement Web Push so the user is notified when a follow-up becomes due, even with the app closed.
**Acceptance criteria:**
- Notification permission requested on first login
- Push subscription stored per user
- Scheduled job sends a push when a follow-up's due_date arrives
- Tapping the notification opens the relevant contact
**Dependencies:** T2.1, T1.3

---

### T2.4 — 15-day silence reminder
**Description:** Scheduled job that auto-creates a follow-up when a contact has had no interaction in 15+ days.
**Acceptance criteria:**
- Job checks `contacts.last_interaction_date` on a daily schedule
- If >15 days and no existing pending follow-up already covers it, creates a new `follow_ups` row
- Notification copy uses: *"Isko bhool gaye? [Name] se 15 din se baat nahi hui."*
- Logging a new interaction resets the clock (does not fire again until another 15 days pass)
**Dependencies:** T2.1, T2.3, T1.6

---

## STAGE 3 — Voice Notes (built; transcription still deferred)

### T3.1 — `voice_notes` schema + private storage
**Description:** Create the `voice_notes` table and a private Supabase Storage bucket for recorded audio, with the same M7 dual-ownership RLS pattern used for `interactions`/`follow_ups`.
**Acceptance criteria:**
- `voice_notes` table with `contact_id`, `user_id`, `storage_path`, `duration_seconds`, `transcript_text` (nullable, unused for now)
- Bucket is private, four folder-scoped storage policies (select/insert/update/delete), path convention `<user_id>/<contact_id>/<uuid>.<ext>`
- RLS live-tested: cross-tenant read/write both rejected
**Dependencies:** T1.6
**Status:** Done — see SECURITY_AUDIT.md "T3 voice notes / storage surface"

---

### T3.2 — Voice note backend (upload → store → interaction)
**Description:** `POST /api/voice-notes` accepts a multipart audio file, stores it, and creates a matching `interactions` row (`source: 'voice'`) so it appears in the normal timeline.
**Acceptance criteria:**
- 10 MB file-size cap, MIME allowlist, dedicated 10/min rate limiter on top of the shared `authLimiter`
- Oversized upload returns `413`, not a generic `500`
- `GET /api/voice-notes/:contactId` returns short-lived (1h) signed playback URLs, generated per request, never stored
**Dependencies:** T3.1

---

### T3.3 — Voice note frontend (record / upload / playback)
**Description:** In-browser recording via `MediaRecorder`, upload progress, and playback via a native `<audio>` element.
**Acceptance criteria:**
- Record, stop, preview, and upload a note from a contact's detail screen
- Mic tracks stopped and object URLs revoked on stop/unmount
- Playback works on a real device (not just desktop dev tools)
**Dependencies:** T3.2

---

### T3.4 / T3.5 — Live verification + security review
**Description:** End-to-end device test plus a full security pass on the new voice/storage surface.
**Status:** Done — see SECURITY_AUDIT.md, two Low findings (L4 fixed, L5 documented/accepted).

---

## STAGE 4 — Post-launch additions (built, beyond original v1 scope)

Requested directly once Stage 1–2 were live and in real use. See Recall_Technical_Architecture.md §8 for the full list; PRD §6 originally scoped listings out of v1 — reversed once asked for.

### T4.1 — Property listings (inventory, independent of contacts)
**Description:** A `listings` table + CRUD API + Listings/ListingDetail/ListingForm screens, so the agent can track property inventory that isn't necessarily tied to a seller contact yet.
**Acceptance criteria:**
- Create/edit a listing: address, asking price, beds, size, property type, condition notes, one cover photo, optional link to an existing seller contact
- `status` field (available / under_offer / sold / rented), shown as a badge everywhere the listing appears
- "Featured" listings show in a strip on the Home screen
**Status:** Done — RLS and IDOR live-tested, see SECURITY_AUDIT.md 2026-07-25 update.

---

### T4.2 — Lead interest tracking per listing
**Description:** Track which leads/buyers/tenants are interested in a given listing.
**Acceptance criteria:**
- `listing_interests` join table, a contact can only be marked interested once per listing
- Listing detail shows an "Interested leads" list with add/remove
- Interest count shown on the listing card everywhere it appears (Listings page, Home Featured strip)
**Dependencies:** T4.1
**Status:** Done.

---

### T4.3 — Dedicated Follow-ups page + cross-contact Activity feed
**Description:** A full "every pending follow-up" list (the Home screen only ever showed a windowed slice), plus a merged activity feed across all contacts for the Home screen.
**Acceptance criteria:**
- Follow-ups page sorted soonest-due-first, no windowing
- Activity feed merges manual/call/whatsapp interactions, done follow-ups, overdue follow-ups, and voice notes into one chronological list
**Status:** Done.

---

### T4.4 — "Log a call" quick-entry flow
**Description:** A simplified outcome-picklist modal (inspired by Salesforce/Follow Up Boss, cut down to what a solo agent actually needs) that logs a call interaction and optionally schedules a follow-up in one step.
**Acceptance criteria:**
- 6-option outcome picklist + optional notes
- Optional "schedule a follow-up" toggle reveals description + due date/time fields inline
- Reuses the existing `POST /api/interactions` and `POST /api/follow-ups` routes — no new backend surface
**Status:** Done — live-verified end to end (interaction + follow-up both created correctly, ContactDetail refreshes to show both).

---

### T4.5 — Saved filters, `tenant` contact type, Lakh/Crore units, contact source, `plot` property type
**Description:** A grab-bag of smaller additions requested alongside the above: named reusable contact-list filter presets (`saved_filters` table); a fourth contact type, `tenant`, sharing the buyer/lead "what they're looking for" shape; Lakh/Crore-aware amount input for PKR figures; an optional `source` (whatsapp/call) field on contacts; and a third `property_type` option, `plot` (land), on both contacts and listings — selecting it hides the Beds field everywhere it appears, since a plot has no bedroom count.
**Status:** Done.

---

### T4.6 — "Ledger registry" visual redesign + nav restructure
**Description:** Full visual redesign of every screen (Home, Contacts, Listings, Follow-ups, Settings, all forms) in a ledger/registry aesthetic. Bottom nav went through two revisions after real-device testing: first a 5-icon nav (Home / Follow-ups / Add / Listings / Settings) replacing the original 3-icon one, then — once the searchable Contacts list turned out to have no direct nav entry, and the center Add button turned out to duplicate the "+ Add" already on every relevant page — revised again to Home / Contacts / Follow-ups / Listings / Settings, with no center Add button. The Home-header avatar now opens Settings directly on tap.
**Status:** Done — live-verified page by page across light/dark, mobile viewport, and (nav/property-type changes) on a real device over the physical-device test session.

---

## STAGE 5+ (deferred — do not start until father confirms + AI costs approved)

- Whisper transcription of already-recorded voice notes (`voice_notes.transcript_text`)
- WhatsApp export → Web Share Target → AI-parsed notes
- AI relationship brief + client temperature
- Team/broker accounts

*(Will be broken into tickets once these are greenlit. Each needs its own security review before it ships — prompt injection, LLM-output validation, and denial-of-wallet don't exist as attack surfaces yet because none of this code exists.)*
