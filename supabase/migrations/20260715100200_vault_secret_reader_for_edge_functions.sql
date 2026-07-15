-- Lets the send-due-followup-pushes Edge Function (using the service_role
-- key) read specific named secrets out of Vault. vault.decrypted_secrets is
-- not exposed via PostgREST directly, so this wraps it. Restricted to
-- service_role only — anon/authenticated get a permission error, same as
-- every other privileged path in this schema.
create or replace function public.get_vault_secret(secret_name text)
returns text
language sql
security definer
set search_path = ''
as $$
  select decrypted_secret from vault.decrypted_secrets where name = secret_name;
$$;

revoke execute on function public.get_vault_secret(text) from public, anon, authenticated;
grant execute on function public.get_vault_secret(text) to service_role;
