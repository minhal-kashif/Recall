# Recall — Product Requirements Document

**Status:** Draft v1
**Owner:** Minhal
**Last updated:** 14 July 2026

---

## 1. Problem Statement

Real estate agents in Pakistan work almost entirely by phone and WhatsApp, juggling dozens of active clients at once — buyers, sellers, leads at every stage. There is no lightweight system built for how they actually work:

- Calls happen constantly, but details (budget, property preference, objections, promises made) are never recorded anywhere structured.
- Follow-ups depend entirely on memory — a client who should be called back in 3 days is easily forgotten.
- Existing CRMs (Salesforce, HubSpot, Zoho) are built around English-first, form-first, keyboard-heavy workflows that don't match how agents here actually communicate (voice calls, WhatsApp, Roman Urdu).
- The result: warm leads go cold, promised follow-ups get missed, and agents lose deals not because of bad selling, but because of bad memory.

**First user:** Minhal's father, a solo real estate agent in Karachi.
**Target market beyond that:** Pakistani and South Asian real estate agents broadly, then any professional who manages an ongoing pipeline of personal client relationships.

---

## 2. Product Vision

**"You talk, it organizes."**

A personal CRM where the agent never has to sit down and manually fill out forms. He talks, forwards a chat, or jots a quick note — the app turns that into a structured, searchable client history, and tells him exactly who to follow up with today.

---

## 3. Target User

- Solo real estate agent (initially), non-technical, mobile-first
- Manages 20–100+ active client relationships at once
- Communicates primarily via phone calls and WhatsApp, in a mix of Urdu and English (Roman Urdu)
- Currently uses no system, or an ad-hoc mix of memory, paper notes, and WhatsApp chat history

---

## 4. Core User Stories

1. As an agent, I can add a new contact in seconds so I don't lose a lead's details.
2. As an agent, I can see a "Today's Follow-Ups" list every time I open the app, so I never forget who to call back.
3. As an agent, I can leave a note on a contact after a call so I remember what was discussed.
4. As an agent, I get a push notification when a follow-up is due, even if the app is closed.
5. As an agent, I can tag a contact as Buyer, Seller, or Lead so I can filter my pipeline.
6. As an agent, I can mark a follow-up as done, snooze it, or reschedule it.
7. *(Later)* As an agent, I can record a voice note instead of typing, and have it transcribed automatically.
8. *(Later)* As an agent, I can share a WhatsApp chat export into the app and have it turned into structured notes.
9. *(Later)* As an agent, I see a one-line AI summary of a client's history before I call them back.

---

## 5. Feature Scope by Stage

### Stage 1 — Core Foundation (build first)
- Google Sign-In authentication (one-tap login, no password to manage)
- Add / view / edit / delete contacts
- Shared fields (all contact types): Name, Phone number, Type (Buyer / Seller / Lead), Free-text notes
- **Buyer / Lead fields** (what they're looking for):
  - Budget
  - Beds interested in (e.g. Studio, 1, 2, 3, 4+)
  - Area / size interested in (sq. yards)
  - Property type wanted (House / Apartment)
  - Area of interest or project name (e.g. "AA Beach Front," "HMR Waterfront," "DHA Phase 8")
- **Seller fields** (what they're offering):
  - Property address / project name
  - Asking price
  - Beds
  - Area / size (sq. yards)
  - Property type (House / Apartment)
  - Condition / notes on the unit
- Contact type selection at creation determines which field set is shown
- Manual interaction log per contact: date, note text
- Basic dashboard: searchable contact list, filterable by type, property type, and area of interest

### Stage 2 — Follow-Up Engine
- "Next action" field per contact (what to do, and when)
- "Today's Follow-Ups" home screen — replaces the plain contact list as the default view
- Push notifications when a follow-up is due
- Mark done / snooze / reschedule a follow-up
- **15-day silence reminder**: if a contact has had no logged interaction in 15 days, trigger an automatic reminder — no manual "next action" required, just time-based
  - Notification copy: *"Isko bhool gaye? [Name] se 15 din se baat nahi hui."*
  - Tone should stay in this playful-but-useful voice throughout the app, not generic system alerts

### Stage 3 — Frictionless Capture *(deferred — pending father's confirmation and budget for AI costs)*
- Voice note recording per contact
- AI transcription (Whisper API), including Roman Urdu
- WhatsApp chat export → shared into app → AI-parsed into structured notes and follow-ups

### Stage 4 — AI Relationship Layer *(deferred, depends on Stage 3)*
- One-line AI "relationship brief" shown before calling a contact
- Client temperature (Hot / Warm / Cooling), inferred automatically
- Silence alerts for contacts gone quiet

### Stage 5 — Team Layer & Launch
- Team/broker accounts (paid tier)
- Shared client pool, lead assignment, manager dashboard
- Solo use remains free indefinitely

---

## 6. Out of Scope (v1)

- Property listing management (this is a client-relationship tool, not a listings portal)
- Multi-agent/team features (Stage 5 only)
- Native iOS/Android apps (PWA only, for now)
- Payment/invoicing features

---

## 7. Success Metrics

- Father actively uses the app daily without reverting to memory/paper
- % of contacts with a "next action" set at any given time
- Follow-ups completed on time vs. missed (before/after comparison to his current process)
- Time from "call ends" to "note logged" (should trend toward near-zero once Stage 3 ships)

---

## 8. Constraints & Risks

- **Roman Urdu transcription accuracy** — unverified. Must be tested with real sample audio via OpenAI's Whisper API before Stage 3 is built.
- **AI cost** — low but real (Whisper + Claude Haiku per request). Deferred until father confirms the feature is worth it.
- **Solo build** — one developer (Minhal, via Claude Code), so scope discipline per stage matters more than speed.
- **WhatsApp integration is manual-export-based**, not live API access — WhatsApp does not allow programmatic reading of personal chats; this is a hard platform constraint, not a build choice.

---

## 9. Tech Stack (see Technical Architecture Document for detail)

- Frontend: PWA (mobile-first, installable)
- Backend: Node.js + Express
- Database: Supabase (Postgres + Row-Level Security, multi-tenant from day one)
- Auth: Supabase Auth (Google Sign-In / OAuth)
- Push notifications: Web Push (via service worker)
- AI (Stage 3+): OpenAI Whisper (transcription), Claude Haiku (structuring/parsing)
