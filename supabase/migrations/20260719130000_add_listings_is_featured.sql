-- T4.2: manual "featured" flag on listings, set via a star toggle on each
-- listing card. Only starred listings appear in the Home Featured strip.
alter table public.listings add column is_featured boolean not null default false;
