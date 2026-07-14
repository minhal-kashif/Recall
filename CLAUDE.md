# Recall — Project Memory

## Stack
- Backend: Node.js + Express
- Database: Supabase (Postgres), free tier
- Auth: Supabase Auth, Google Sign-In only — no email/password
- Frontend: React + Vite, PWA, mobile-first

## Non-negotiable rules
- Row-Level Security enabled on every table, no exceptions
- Never commit .env or any key to git — .env is in .gitignore from commit 1
- Client code only ever uses the Supabase publishable/anon key, never the secret/service_role key
- All API inputs validated server-side before touching the database

## Reference docs (read before starting a new stage)
- docs/Recall_PRD.md — product scope, what's in v1 vs deferred
- docs/Recall_Technical_Architecture.md — full schema, API routes
- docs/Recall_Security_Access.md — security rules in detail
- docs/Recall_Features_Ticket_List.md — the tickets, in build order

## Current stage
Stage 1 — Core Foundation. Stage 3 (voice/WhatsApp AI features) is deferred — do not build until explicitly told to.

## Conventions
- Contact types: buyer, seller, lead (lowercase, exact strings)
- Buyer/Lead fields live in buyer_details; Seller fields live in seller_details
- Always update contacts.last_interaction_date when a new interaction is logged
- Supabase project URL: https://gleuammjovnltispagmg.supabase.co
