-- Расписание: раз в минуту вызывать функцию send-reminders. Выполнить один раз в Supabase → SQL Editor.
select cron.schedule(
  'send-reminders', '* * * * *',
  $$ select net.http_post(
       url     := 'https://qvnzicyxrkzgnzzzaxht.supabase.co/functions/v1/send-reminders',
       headers := jsonb_build_object('Content-Type', 'application/json', 'x-cron-secret', '47895518bbcc0ea0277061de66205a9f4f7cf55f10ff997d'),
       body    := '{}'::jsonb) $$
);
