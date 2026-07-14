# Recall — Technical Architecture Document

**Status:** Draft v1
**Last updated:** 14 July 2026
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
| type | text | enum: `buyer`, `seller`, `lead` |
| notes | text | free-text, general notes |
| last_interaction_date | timestamptz | updated whenever a new interaction is logged |
| created_at | timestamptz | default now() |
| updated_at | timestamptz | default now() |

RLS: `user_id = auth.uid()`

---

### `buyer_details`
One-to-one with a `contacts` row where `type = buyer` or `lead`.

| Column | Type | Notes |
|---|---|---|
| id | uuid, PK | |
| contact_id | uuid, FK → contacts.id | unique (one row per contact) |
| budget | numeric | |
| beds_wanted | text | e.g. "Studio", "1", "2", "3", "4+" |
| size_wanted_sqyd | numeric | |
| property_type_wanted | text | enum: `house`, `apartment` |
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
| property_type | text | enum: `house`, `apartment` |
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
| source | text | enum: `manual`, `voice` (Stage 3+), `whatsapp_import` (Stage 3+) — defaults to `manual` for now |

RLS: `user_id = auth.uid()`

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
| created_at | timestamptz | default now() |

RLS: `user_id = auth.uid()`

**"Today's Follow-Ups" query:** all rows where `status = 'pending'` and `due_date <= now()`, ordered by `due_date`.

**15-day silence reminder logic:** a scheduled job (Supabase Edge Function on a cron trigger) checks `contacts.last_interaction_date`; if more than 15 days old and no pending follow_up already exists for that contact, auto-insert a `follow_ups` row with description `"Isko bhool gaye? [Name] se 15 din se baat nahi hui."`

---

## 4. API Structure (Express)

REST-style, all routes scoped to the authenticated user via Supabase JWT verification middleware.

```
POST   /api/contacts              create contact (+ buyer_details or seller_details)
GET    /api/contacts              list contacts (search/filter by type, area)
GET    /api/contacts/:id          get one contact with full detail + interaction history
PATCH  /api/contacts/:id          update contact
DELETE /api/contacts/:id          delete contact

POST   /api/interactions          log a new interaction
GET    /api/interactions/:contactId   list interactions for a contact

POST   /api/follow-ups            create a follow-up
GET    /api/follow-ups/today      today's due follow-ups (home screen data)
PATCH  /api/follow-ups/:id        mark done / snooze / reschedule
```

---

## 5. Push Notification Flow

1. On first login, PWA requests notification permission and registers a service worker
2. Push subscription object stored per user (`push_subscriptions` table — id, user_id, subscription_json)
3. A scheduled job checks `follow_ups` due today/now and the 15-day silence rule, sends push via Web Push API to each user's stored subscription

---

## 6. Deferred (Stage 3+, not built yet)

- `voice_notes` table (contact_id, audio_url, transcript_text, created_at) — pending father's confirmation and Whisper API cost approval
- WhatsApp import pipeline (Web Share Target → raw text → Claude Haiku parsing → structured `interactions` + `follow_ups`)
- AI relationship brief and client temperature — computed fields, not stored raw; likely generated on-demand via Claude Haiku rather than pre-computed and stored

---

## 7. Open Items for Later Docs

- Exact RLS policy SQL — to be written directly in Supabase when Stage 1 begins
- Frontend Specification Document — screen list, navigation, design tokens (next doc)
- Security & Access Document — auth flow detail, storage access rules, team-tier permissions (later doc, before Stage 5)
