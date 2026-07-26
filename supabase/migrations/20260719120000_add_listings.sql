-- T4.1: listings (property inventory) — independent of contacts, with an
-- optional link to a seller contact. Mirrors the voice_notes migration
-- pattern (table + RLS + private storage bucket + folder-scoped policies).

create table public.listings (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  contact_id uuid references public.contacts(id) on delete set null,
  property_address text not null,
  asking_price numeric,
  beds text,
  size_sqyd numeric,
  property_type text check (property_type in ('house', 'apartment')),
  condition_notes text,
  photo_path text,
  created_at timestamptz not null default now()
);

create index listings_user_id_idx on public.listings(user_id);
create index listings_contact_id_idx on public.listings(contact_id);

alter table public.listings enable row level security;

-- WITH CHECK requires row ownership, and — only when a seller link is
-- provided — that the linked contact is also owned by the same user
-- (same M7 ownership pattern as voice_notes/interactions/follow_ups).
create policy "Users manage own listings"
  on public.listings for all
  using (user_id = auth.uid())
  with check (
    user_id = auth.uid()
    and (
      contact_id is null
      or exists (
        select 1 from public.contacts
        where contacts.id = listings.contact_id
        and contacts.user_id = auth.uid()
      )
    )
  );

-- Private storage bucket for listing cover photos. Access only ever via
-- short-lived signed URLs generated with a user-scoped client — never
-- public, never service-role.
insert into storage.buckets (id, name, public)
values ('listing-photos', 'listing-photos', false)
on conflict (id) do nothing;

-- Path convention enforced by these policies: <auth.uid()>/<listing_id>/<random>.<ext>
create policy "Users select own listing-photos objects"
  on storage.objects for select
  using (
    bucket_id = 'listing-photos'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

create policy "Users insert own listing-photos objects"
  on storage.objects for insert
  with check (
    bucket_id = 'listing-photos'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

create policy "Users update own listing-photos objects"
  on storage.objects for update
  using (
    bucket_id = 'listing-photos'
    and (storage.foldername(name))[1] = auth.uid()::text
  )
  with check (
    bucket_id = 'listing-photos'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

create policy "Users delete own listing-photos objects"
  on storage.objects for delete
  using (
    bucket_id = 'listing-photos'
    and (storage.foldername(name))[1] = auth.uid()::text
  );
