-- Lead source: how this contact first reached the agent. Simplified to just
-- the two channels Recall's own Call/WhatsApp buttons represent — not a
-- full CRM lead-source taxonomy. Nullable: existing contacts and contacts
-- added before this field existed have no source on record.
alter table public.contacts
  add column source text check (source in ('whatsapp', 'call'));

-- Smart Lists: a saved combination of the contact-list filters, so the
-- agent can jump straight to e.g. "Buyers in DHA, quiet 7+ days" instead of
-- re-entering the same filters every time. stale_days is compared against
-- contacts.last_interaction_date server-side, same idea as the 15-day
-- silence-reminder job already uses.
create table public.saved_filters (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  name text not null,
  q text,
  type text,
  property_type text,
  area_of_interest text,
  stale_days integer,
  created_at timestamptz not null default now()
);

create index saved_filters_user_id_idx on public.saved_filters(user_id);

alter table public.saved_filters enable row level security;

create policy "Users manage own saved_filters"
  on public.saved_filters for all
  using (user_id = auth.uid())
  with check (user_id = auth.uid());
