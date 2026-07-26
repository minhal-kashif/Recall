-- Adds 'call' and 'whatsapp' as valid interaction sources, for the
-- tap-to-call / tap-to-WhatsApp quick-log feature: the agent taps a Call or
-- WhatsApp button on a contact, gets handed off to the phone's dialer/WhatsApp,
-- and on returning to the app is prompted to log what was discussed.
alter table public.interactions drop constraint interactions_source_check;
alter table public.interactions
  add constraint interactions_source_check
  check (source in ('manual', 'voice', 'whatsapp_import', 'call', 'whatsapp'));
