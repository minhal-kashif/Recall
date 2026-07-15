select cron.schedule(
  'send-due-followup-pushes',
  '*/5 * * * *',
  $$
  select net.http_post(
    url := 'https://gleuammjovnltispagmg.supabase.co/functions/v1/send-due-followup-pushes',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-cron-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'cron_invoke_secret')
    ),
    body := '{}'::jsonb
  );
  $$
);
