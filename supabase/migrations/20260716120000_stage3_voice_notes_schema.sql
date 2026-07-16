-- T3.1: voice_notes storage + metadata table.
-- transcript_text is nullable: a later Whisper-transcription ticket
-- (not in scope here) backfills it after async processing.

create table public.voice_notes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  contact_id uuid not null references public.contacts(id) on delete cascade,
  storage_path text not null,
  transcript_text text,
  duration_seconds numeric,
  created_at timestamptz not null default now()
);

create index voice_notes_user_id_idx on public.voice_notes(user_id);
create index voice_notes_contact_id_idx on public.voice_notes(contact_id);

alter table public.voice_notes enable row level security;

-- SECURITY_AUDIT.md M7 pattern: WITH CHECK requires both row ownership
-- and ownership of the referenced contact, mirroring interactions/follow_ups.
create policy "Users manage own voice_notes"
  on public.voice_notes for all
  using (user_id = auth.uid())
  with check (
    user_id = auth.uid()
    and exists (
      select 1 from public.contacts
      where contacts.id = voice_notes.contact_id
      and contacts.user_id = auth.uid()
    )
  );

-- Private storage bucket for voice note audio. Access is only ever via
-- short-lived signed URLs generated with a user-scoped client (anon key +
-- caller's JWT) — never public, never service-role.
insert into storage.buckets (id, name, public)
values ('voice-notes', 'voice-notes', false)
on conflict (id) do nothing;

-- Path convention enforced by these policies: <auth.uid()>/<contact_id>/<random>.webm
-- i.e. the first path segment is always the owning user's id.
create policy "Users select own voice-notes objects"
  on storage.objects for select
  using (
    bucket_id = 'voice-notes'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

create policy "Users insert own voice-notes objects"
  on storage.objects for insert
  with check (
    bucket_id = 'voice-notes'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

create policy "Users update own voice-notes objects"
  on storage.objects for update
  using (
    bucket_id = 'voice-notes'
    and (storage.foldername(name))[1] = auth.uid()::text
  )
  with check (
    bucket_id = 'voice-notes'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

create policy "Users delete own voice-notes objects"
  on storage.objects for delete
  using (
    bucket_id = 'voice-notes'
    and (storage.foldername(name))[1] = auth.uid()::text
  );
