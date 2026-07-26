-- T4.4: many-to-many "which leads are interested in which listing" —
-- separate from listings.contact_id (the optional single seller link),
-- this tracks buyer/lead interest, powering a per-listing count.
create table public.listing_interests (
  id uuid primary key default gen_random_uuid(),
  listing_id uuid not null references public.listings(id) on delete cascade,
  contact_id uuid not null references public.contacts(id) on delete cascade,
  user_id uuid not null references public.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (listing_id, contact_id)
);

create index listing_interests_listing_id_idx on public.listing_interests(listing_id);
create index listing_interests_contact_id_idx on public.listing_interests(contact_id);

alter table public.listing_interests enable row level security;

-- Same M7 ownership pattern as everywhere else: row ownership plus proof
-- that both the listing and the contact being linked are also this user's.
create policy "Users manage own listing_interests"
  on public.listing_interests for all
  using (user_id = auth.uid())
  with check (
    user_id = auth.uid()
    and exists (select 1 from public.listings where listings.id = listing_interests.listing_id and listings.user_id = auth.uid())
    and exists (select 1 from public.contacts where contacts.id = listing_interests.contact_id and contacts.user_id = auth.uid())
  );
