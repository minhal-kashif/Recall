-- T2.4: daily job that auto-creates a follow-up when a contact has gone
-- quiet for 15+ days. SECURITY DEFINER because it must scan every user's
-- contacts in one pass (cross-tenant, same justification as
-- get_vault_secret in 20260715100200) — locked down the same way: search_path
-- pinned, EXECUTE revoked from anon/authenticated, only pg_cron invokes it.
--
-- Uses coalesce(last_interaction_date, created_at): a contact that has NEVER
-- had an interaction logged has a null last_interaction_date, which a plain
-- `< now() - interval '15 days'` check would silently exclude forever (NULL
-- comparisons are neither true nor false in SQL). Falling back to created_at
-- means a lead added and never followed up on counts as silent since
-- creation — the exact "forgot about them" case this feature exists for.
--
-- due_date is set to now(): the row becomes immediately due, so the
-- existing send-due-followup-pushes cron (every 5 min) picks it up and
-- pushes it on its own next run — no separate delivery path needed here.
create or replace function public.create_silence_reminders()
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.follow_ups (contact_id, user_id, description, due_date, status)
  select
    c.id,
    c.user_id,
    'Isko bhool gaye? ' || c.name || ' se 15 din se baat nahi hui.',
    now(),
    'pending'
  from public.contacts c
  where coalesce(c.last_interaction_date, c.created_at) < now() - interval '15 days'
    and not exists (
      select 1 from public.follow_ups f
      where f.contact_id = c.id
      and f.status = 'pending'
    );
end;
$$;

revoke execute on function public.create_silence_reminders() from public, anon, authenticated;

-- Daily at 04:00 UTC (09:00 PKT) — start of the agent's business day.
select cron.schedule(
  'create-silence-reminders',
  '0 4 * * *',
  $$ select public.create_silence_reminders(); $$
);
