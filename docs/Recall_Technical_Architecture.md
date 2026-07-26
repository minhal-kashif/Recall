# Recall — Technical Architecture Document

**Status:** Draft v1
**Last updated:** 26 July 2026 — §8 extended with post-launch device-testing-driven tweaks (plot/land type, nav restructure, listing card layout)
**Companion doc:** Recall_PRD.md

---

## 1. Stack Overview

| Layer | Choice | Why |
|---|---|---|
| Frontend | PWA (mobile-first, installable) | No app store approval delay, one codebase, works on any phone |
| Backend | Node.js + Express | Existing default stack, well-understood |
| Database | Supabase (Postgres) | Free tier sufficient for current scale, built-in Auth + RLS + Storage |
| Auth | Supabase Auth — Google Sign-In (OAuth) | One-tap login, no password to manage |
| Push notifications | Web Push via service worker | Native to PWA, no extra platform needed |
| AI (Stage 3+, deferred) | OpenAI Whisper (transcription), Claude Haiku (structuring) | Verified official sources, low cost, no training required |

---

## 2. Multi-Tenancy Approach

Every table (except `users` itself) includes a `user_id` column referencing the owning agent. Supabase **Row-Level Security (RLS)** is enabled on every table from Stage 1, with a policy that a row is only visible/editable by the `user_id` that owns it. This is built in from day one — retrofitting multi-tenancy later is a much bigger job than doing it now.

---

## 3. Database Schema

### `users`
Managed primarily by Supabase Auth; this table extends it with app-specific fields.

| Column | Type | Notes |
|---|---|---|
| id | uuid, PK | matches Supabase Auth user id |
| email | text | from Google Sign-In |
| full_name | text | from Google Sign-In |
| created_at | timestamptz | default now() |

---

### `contacts`
Shared fields across all contact types.

| Column | Type | Notes |
|---|---|---|
| id | uuid, PK | default gen_random_uuid() |
| user_id | uuid, FK → users.id | owner of this contact |
| name | text | required |
| phone | text | required |
| type | text | enum: `buyer`, `seller`, `lead`, `tenant` — `tenant` added post-launch, shares the buyer/lead "what they're looking for" shape |
| notes | text | free-text, general notes |
| source | text | enum: `whatsapp`, `call`, or null — how this contact was first reached; optional |
| last_interaction_date | timestamptz | updated whenever a new interaction is logged |
| created_at | timestamptz | default now() |
| updated_at | timestamptz | default now() |

RLS: `user_id = auth.uid()`

---

### `buyer_details`
One-to-one with a `contacts` row where `type = buyer`, `lead`, or `tenant`.

| Column | Type | Notes |
|---|---|---|
| id | uuid, PK | |
| contact_id | uuid, FK → contacts.id | unique (one row per contact) |
| budget | numeric | |
| beds_wanted | text | e.g. "Studio", "1", "2", "3", "4+" |
| size_wanted_sqyd | numeric | |
| property_type_wanted | text | enum: `house`, `apartment`, `plot` (plot/land has no beds field — hidden client-side when selected) |
| area_of_interest | text | e.g. "AA Beach Front", "HMR Waterfront", "DHA Phase 8" |

RLS: inherited via join to `contacts.user_id = auth.uid()`

---

### `seller_details`
One-to-one with a `contacts` row where `type = seller`.

| Column | Type | Notes |
|---|---|---|
| id | uuid, PK | |
| contact_id | uuid, FK → contacts.id | unique (one row per contact) |
| property_address | text | address or project name |
| asking_price | numeric | |
| beds | text | |
| size_sqyd | numeric | |
| property_type | text | enum: `house`, `apartment`, `plot` (plot/land has no beds field — hidden client-side when selected) |
| condition_notes | text | free text on unit condition |

RLS: inherited via join to `contacts.user_id = auth.uid()`

---

### `interactions`
Log of every call/note tied to a contact. One contact can have many.

| Column | Type | Notes |
|---|---|---|
| id | uuid, PK | |
| contact_id | uuid, FK → contacts.id | |
| user_id | uuid, FK → users.id | denormalized for simpler RLS |
| note_text | text | what was discussed |
| interaction_date | timestamptz | default now() |
| source | text | enum: `manual`, `call`, `whatsapp` (client-settable via `POST /api/interactions`), plus `voice` and `whatsapp_import` (server-set only, by their own dedicated routes — `whatsapp_import` not built yet) — defaults to `manual` |

RLS: `user_id = auth.uid()`, `WITH CHECK` additionally requires `contact_id` reference a contact owned by the same `user_id` (fixed post-launch — see SECURITY_AUDIT.md finding M7).

Trigger: on insert, update `contacts.last_interaction_date` to `now()`.

---

### `follow_ups`
Multiple follow-ups allowed per contact.

| Column | Type | Notes |
|---|---|---|
| id | uuid, PK | |
| contact_id | uuid, FK → contacts.id | |
| user_id | uuid, FK → users.id | denormalized for simpler RLS |
| description | text | what to do (e.g. "Show Phase 8 unit") |
| due_date | timestamptz | when it's due |
| status | text | enum: `pending`, `done`, `snoozed` |
| notified_at | timestamptz, nullable | claimed atomically by the due-follow-up push job so it can't double-send; cleared on any due_date change (snooze/reschedule) |
| created_at | timestamptz | default now() |

RLS: `user_id = auth.uid()`, `WITH CHECK` additionally requires `contact_id` reference a contact owned by the same `user_id` (same M7 fix as `interactions`).

**"Today's Follow-Ups" query (`GET /api/follow-ups/today`):** all rows where `status = 'pending'` and `due_date <=` a look-ahead bound — `now() + upcoming_days` (defaults to 7; the dedicated Follow-ups page passes a much larger window to effectively list everything pending), ordered by `due_date` ascending.

**15-day silence reminder logic:** a daily `pg_cron` job (`SECURITY DEFINER` Postgres function, not an Edge Function) checks `contacts.last_interaction_date`; if more than 15 days old (or, for a contact with no interactions yet, `created_at`) and no pending follow_up already exists for that contact, auto-insert a `follow_ups` row with description `"Isko bhool gaye? [Name] se 15 din se baat nahi hui."`

---

### `push_subscriptions`
Web Push subscription per device/browser, for T2.3.

| Column | Type | Notes |
|---|---|---|
| id | uuid, PK | |
| user_id | uuid, FK → users.id | |
| subscription | jsonb | the browser's PushSubscription object; capped at 4000 bytes |
| created_at | timestamptz | default now() |

RLS: `user_id = auth.uid()` (direct column, no join needed).

Due-follow-up delivery: a Supabase Edge Function (`send-due-followup-pushes`), invoked by `pg_cron` via `pg_net`, running as `service_role` (needed to scan every tenant's due follow-ups in one pass), gated by a Vault-stored `cron_invoke_secret` header check.

---

### `voice_notes`
Recorded audio note attached to a contact. Built (recording/upload/playback only — Whisper transcription is **not** built, `transcript_text` stays null; see §8).

| Column | Type | Notes |
|---|---|---|
| id | uuid, PK | |
| contact_id | uuid, FK → contacts.id | |
| user_id | uuid, FK → users.id | |
| storage_path | text | path in the private `voice-notes` Storage bucket, `<user_id>/<contact_id>/<uuid>.<ext>` |
| duration_seconds | numeric, nullable | |
| transcript_text | text, nullable | reserved for Stage 3 Whisper integration — always null today |
| created_at | timestamptz | default now() |

RLS: same M7 dual-ownership pattern as `interactions`/`follow_ups`. Storage bucket `voice-notes` is **private**, with four folder-scoped `storage.objects` policies gating on `(storage.foldername(name))[1] = auth.uid()::text`.

Recording an voice note also creates a matching `interactions` row (`source = 'voice'`) so it shows up in the normal activity timeline.

---

### `listings`
Property inventory, independent of any contact — the agent's own stock, not a client's stated requirements. Built post-launch (PRD §6 originally scoped this out for v1; reversed once the father asked for it).

| Column | Type | Notes |
|---|---|---|
| id | uuid, PK | |
| user_id | uuid, FK → users.id | |
| contact_id | uuid, FK → contacts.id, nullable | the seller this listing belongs to, if any — optional, not mandatory |
| property_address | text | required |
| asking_price | numeric, nullable | |
| beds | text, nullable | |
| size_sqyd | numeric, nullable | |
| property_type | text, nullable | enum: `house`, `apartment`, `plot` (plot/land has no beds field — hidden client-side when selected) |
| condition_notes | text, nullable | |
| photo_path | text, nullable | path in the private `listing-photos` Storage bucket; one cover photo per listing (not a gallery), uploaded via a separate `POST /:id/photo` after create |
| is_featured | boolean | drives the Home screen's "Featured listings" strip |
| status | text | enum: `available`, `under_offer`, `sold`, `rented` — defaults to `available` |
| created_at | timestamptz | default now() |

RLS: `user_id = auth.uid()`, `WITH CHECK` additionally requires `contact_id` (if set) reference a contact owned by the same `user_id`. Storage bucket `listing-photos` is **private**, same four-policy folder-scoped pattern as `voice-notes`.

---

### `listing_interests`
Join table: which leads/buyers/tenants (never sellers — a seller already occupies `listings.contact_id`) are interested in a given listing.

| Column | Type | Notes |
|---|---|---|
| id | uuid, PK | |
| listing_id | uuid, FK → listings.id, cascade delete | |
| contact_id | uuid, FK → contacts.id, cascade delete | |
| user_id | uuid, FK → users.id | |
| created_at | timestamptz | default now() |

Unique constraint on `(listing_id, contact_id)` — a contact can only be marked interested once per listing.

RLS: strictest ownership pattern in the codebase — `WITH CHECK` requires **both** the listing and the contact belong to `auth.uid()`.

---

### `saved_filters`
Named, reusable contact-list filter presets (search text, type, property type, area, staleness).

| Column | Type | Notes |
|---|---|---|
| id | uuid, PK | |
| user_id | uuid, FK → users.id | |
| name | text | required, ≤100 chars |
| q | text, nullable | free-text search |
| type | text, nullable | enum: `buyer`, `seller`, `lead`, `tenant` |
| property_type | text, nullable | enum: `house`, `apartment`, `plot` (plot/land has no beds field — hidden client-side when selected) |
| area_of_interest | text, nullable | |
| stale_days | integer, nullable | "quiet N+ days" — same staleness definition as the 15-day silence job, applied to `GET /api/contacts?stale_days=N` |
| created_at | timestamptz | default now() |

RLS: `user_id = auth.uid()` (direct column, no join needed).

---

## 4. API Structure (Express)

REST-style, all routes scoped to the authenticated user via Supabase JWT verification middleware.

```
POST   /api/contacts                        create contact (+ buyer_details or seller_details)
GET    /api/contacts                         list contacts (search/filter by type, area, q, stale_days)
GET    /api/contacts/:id                     get one contact with full detail
PATCH  /api/contacts/:id                     update contact
DELETE /api/contacts/:id                     delete contact (cascades DB rows + cleans up orphaned voice-note audio)

POST   /api/interactions                     log a new interaction
GET    /api/interactions/:contactId          list interactions for a contact

POST   /api/follow-ups                       create a follow-up
GET    /api/follow-ups/today                 due + upcoming follow-ups (?upcoming_days=N window, default 7)
GET    /api/follow-ups/:contactId            list follow-ups for one contact
PATCH  /api/follow-ups/:id                   mark done / snooze / reschedule

POST   /api/push-subscriptions               save/replace a device's Web Push subscription

POST   /api/voice-notes                      upload a recorded voice note (multipart), creates a matching interaction
GET    /api/voice-notes/:contactId           list voice notes for a contact, with signed playback URLs

GET    /api/listings                         list listings (?featured=true, ?limit=N)
GET    /api/listings/:id                     get one listing
POST   /api/listings                         create a listing (no photo yet)
PATCH  /api/listings/:id                     update a listing
POST   /api/listings/:id/photo               upload/replace the cover photo (multipart)
DELETE /api/listings/:id                     delete a listing (cleans up its Storage photo)
GET    /api/listings/:id/interests           list contacts interested in a listing
POST   /api/listings/:id/interests           mark a contact interested in a listing
DELETE /api/listings/:id/interests/:id       remove an interested-contact link

GET    /api/activity/recent                  merged cross-contact activity feed (?limit=N, max 20) — for the Home screen

GET    /api/saved-filters                    list saved contact-filter presets
POST   /api/saved-filters                    create a saved filter preset
DELETE /api/saved-filters/:id                delete a saved filter preset
```

All routes above sit behind `requireAuth` plus a shared per-IP `authLimiter` (120 requests/min); `/api/voice-notes` (POST) and `/api/listings/:id/photo` (POST) additionally sit behind their own dedicated 10/min upload limiter. See SECURITY_AUDIT.md for the full rationale and live-verified rate-limiting/RLS testing.

---

## 5. Push Notification Flow

1. On first login, PWA requests notification permission and registers a service worker
2. Push subscription object stored per user (`push_subscriptions` table — id, user_id, subscription_json)
3. A scheduled job checks `follow_ups` due today/now and the 15-day silence rule, sends push via Web Push API to each user's stored subscription

---

## 6. Deferred (AI layer — not built yet)

Voice note **recording/upload/playback** is built (§3, `voice_notes`); the AI layer on top of it is not:

- Whisper transcription of recorded voice notes (`voice_notes.transcript_text` stays null today)
- WhatsApp import pipeline (Web Share Target → raw text → Claude Haiku parsing → structured `interactions` + `follow_ups`)
- AI relationship brief and client temperature — computed fields, not stored raw; likely generated on-demand via Claude Haiku rather than pre-computed and stored
- Team/broker accounts (Stage 5)

Each of these needs its own security review when built (prompt injection, LLM-output validation, denial-of-wallet) — explicitly flagged in SECURITY_AUDIT.md as out of scope until the code exists.

---

## 7. Open Items for Later Docs

- Exact RLS policy SQL — to be written directly in Supabase when Stage 1 begins
- Frontend Specification Document — screen list, navigation, design tokens (next doc)
- Security & Access Document — auth flow detail, storage access rules, team-tier permissions (later doc, before Stage 5)

---

## 8. Built beyond original v1 scope

The following shipped after the original Stage 1–2 plan, in response to direct requests once Stage 1–2 was live — listed here so this document stays a source of truth rather than drifting from reality:

- **Voice notes** (§3 `voice_notes`) — recording/upload/playback, no transcription yet.
- **Push notifications** (§3 `push_subscriptions`, §5) and the **15-day silence reminder** cron job.
- **`tenant` contact type**, **Lakh/Crore amount input units**, contact **`source`** field (whatsapp/call).
- **Property listings** (§3 `listings`, `listing_interests`) — the PRD originally scoped this out of v1 (Recall_PRD.md §6); reversed once requested. Includes a `status` field (available/under_offer/sold/rented), one cover photo per listing, an optional link to a seller contact, and per-listing tracking of which leads/buyers/tenants are interested.
- **Saved filters** (§3 `saved_filters`) for the contact list.
- **Dedicated Follow-ups page** listing every pending follow-up (not just the Home screen's windowed slice) and a merged cross-contact **Activity feed** (§4 `/api/activity/recent`).
- **"Log a call" flow** — a simplified outcome-picklist modal that logs an interaction (`source: 'call'`) and optionally schedules a follow-up in one step; no new backend routes, reuses the existing interaction/follow-up endpoints.
- **Full visual redesign** ("ledger registry" style) across every screen.
- **`plot` / land property type** — a third `property_type` option (alongside `house`/`apartment`) on both contacts (buyer/lead/tenant "wanted" and seller "offering") and listings; the Beds field is hidden client-side whenever it's selected, since a plot has no bedroom count.
- **Listings page**: a property-type filter dropdown, and a horizontal row-layout card (fixed square photo on the left, all details stacked to its right) used both here and on the Home Featured strip — replacing the original photo-on-top card design.
- **Bottom nav, revised**: a direct **Contacts** tab was added (the searchable contact list already existed as a view but had no nav entry before this), and the center **Add** button was removed as redundant — every relevant page (Contacts, Listings, Home) already has its own "+ Add" entry point, so a global add button added a confusing extra path without adding capability. Current nav: Home / Contacts / Follow-ups / Listings / Settings. Tapping the avatar on the Home header now opens Settings directly.
