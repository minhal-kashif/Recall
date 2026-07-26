-- T4.3: listing lifecycle status, reversing the earlier "no status field"
-- call now that the agent wants it back. Defaults to 'available' so every
-- existing row lands somewhere sane without a backfill step.
alter table public.listings
  add column status text not null default 'available'
  check (status in ('available', 'under_offer', 'sold', 'rented'));
