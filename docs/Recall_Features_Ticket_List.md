# Recall — Features Ticket List

**Status:** Draft v1
**Last updated:** 14 July 2026
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

## STAGE 3+ (deferred — do not start until father confirms + AI costs approved)

- Voice note recording + Whisper transcription
- WhatsApp export → Web Share Target → AI-parsed notes
- AI relationship brief + client temperature
- Team/broker accounts (Stage 5)

*(Will be broken into tickets once Stage 1–2 are live and the deferred features are greenlit.)*
