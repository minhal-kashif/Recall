create table public.push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  endpoint text not null,
  subscription_json jsonb not null,
  created_at timestamptz not null default now(),
  unique (user_id, endpoint)
);

create index push_subscriptions_user_id_idx on public.push_subscriptions(user_id);

alter table public.push_subscriptions enable row level security;

create policy "Users manage own push_subscriptions"
  on public.push_subscriptions for all
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

-- Tracks whether a push has already been sent for a follow-up's current
-- due_date, so the scheduled job doesn't re-notify on every cron tick.
-- Reset to null by the app whenever due_date changes (snooze/reschedule).
alter table public.follow_ups add column notified_at timestamptz;

create index follow_ups_pending_unnotified_idx on public.follow_ups(due_date)
  where status = 'pending' and notified_at is null;
