-- users: extends Supabase Auth with app-specific fields
create table public.users (
  id uuid primary key references auth.users(id) on delete cascade,
  email text,
  full_name text,
  created_at timestamptz not null default now()
);

alter table public.users enable row level security;

create policy "Users can view own row"
  on public.users for select
  using (id = auth.uid());

create policy "Users can update own row"
  on public.users for update
  using (id = auth.uid());

-- contacts
create table public.contacts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  name text not null,
  phone text not null,
  type text not null check (type in ('buyer', 'seller', 'lead')),
  notes text,
  last_interaction_date timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index contacts_user_id_idx on public.contacts(user_id);

alter table public.contacts enable row level security;

create policy "Users manage own contacts"
  on public.contacts for all
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

create or replace function public.set_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

create trigger contacts_set_updated_at
  before update on public.contacts
  for each row execute function public.set_updated_at();

-- buyer_details (buyer or lead contacts)
create table public.buyer_details (
  id uuid primary key default gen_random_uuid(),
  contact_id uuid not null unique references public.contacts(id) on delete cascade,
  budget numeric,
  beds_wanted text,
  size_wanted_sqyd numeric,
  property_type_wanted text check (property_type_wanted in ('house', 'apartment')),
  area_of_interest text
);

alter table public.buyer_details enable row level security;

create policy "Users manage buyer_details via contact ownership"
  on public.buyer_details for all
  using (exists (
    select 1 from public.contacts
    where contacts.id = buyer_details.contact_id
    and contacts.user_id = auth.uid()
  ))
  with check (exists (
    select 1 from public.contacts
    where contacts.id = buyer_details.contact_id
    and contacts.user_id = auth.uid()
  ));

-- seller_details
create table public.seller_details (
  id uuid primary key default gen_random_uuid(),
  contact_id uuid not null unique references public.contacts(id) on delete cascade,
  property_address text,
  asking_price numeric,
  beds text,
  size_sqyd numeric,
  property_type text check (property_type in ('house', 'apartment')),
  condition_notes text
);

alter table public.seller_details enable row level security;

create policy "Users manage seller_details via contact ownership"
  on public.seller_details for all
  using (exists (
    select 1 from public.contacts
    where contacts.id = seller_details.contact_id
    and contacts.user_id = auth.uid()
  ))
  with check (exists (
    select 1 from public.contacts
    where contacts.id = seller_details.contact_id
    and contacts.user_id = auth.uid()
  ));

-- interactions
create table public.interactions (
  id uuid primary key default gen_random_uuid(),
  contact_id uuid not null references public.contacts(id) on delete cascade,
  user_id uuid not null references public.users(id) on delete cascade,
  note_text text not null,
  interaction_date timestamptz not null default now(),
  source text not null default 'manual' check (source in ('manual', 'voice', 'whatsapp_import'))
);

create index interactions_contact_id_idx on public.interactions(contact_id);
create index interactions_user_id_idx on public.interactions(user_id);

alter table public.interactions enable row level security;

create policy "Users manage own interactions"
  on public.interactions for all
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

create or replace function public.touch_contact_last_interaction()
returns trigger as $$
begin
  update public.contacts
  set last_interaction_date = new.interaction_date
  where id = new.contact_id;
  return new;
end;
$$ language plpgsql;

create trigger interactions_touch_contact
  after insert on public.interactions
  for each row execute function public.touch_contact_last_interaction();

-- follow_ups
create table public.follow_ups (
  id uuid primary key default gen_random_uuid(),
  contact_id uuid not null references public.contacts(id) on delete cascade,
  user_id uuid not null references public.users(id) on delete cascade,
  description text not null,
  due_date timestamptz not null,
  status text not null default 'pending' check (status in ('pending', 'done', 'snoozed')),
  created_at timestamptz not null default now()
);

create index follow_ups_contact_id_idx on public.follow_ups(contact_id);
create index follow_ups_user_id_idx on public.follow_ups(user_id);
create index follow_ups_due_date_idx on public.follow_ups(due_date) where status = 'pending';

alter table public.follow_ups enable row level security;

create policy "Users manage own follow_ups"
  on public.follow_ups for all
  using (user_id = auth.uid())
  with check (user_id = auth.uid());
