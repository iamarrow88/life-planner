// Собирает готовый SQL для расписаний: push-напоминания (раз в минуту) и синхронизация с Google (раз в 5 минут).
// Запуск:  node scripts/make-cron-sql.mjs REF      (REF — Reference ID проекта из Supabase → Project Settings → General)
// Берёт CRON_SECRET из supabase/.env.push и создаёт файл supabase/cron.sql (он в .gitignore — внутри секрет).
import { existsSync, readFileSync, writeFileSync } from 'node:fs'

const ref = (process.argv[2] ?? '').trim()
if (!/^[a-z0-9]{20}$/.test(ref)) {
  console.error('Укажи Reference ID проекта (20 маленьких букв/цифр), например:')
  console.error('  node scripts/make-cron-sql.mjs abcdefghijklmnopqrst')
  console.error('Он есть в Supabase → Project Settings → General → Reference ID.')
  process.exit(1)
}
const envFile = 'supabase/.env.push'
if (!existsSync(envFile)) {
  console.error(`Нет файла ${envFile}. Сначала выполни шаг 1:  node scripts/gen-vapid.mjs ТВОЯ@почта.com`)
  process.exit(1)
}
const line = readFileSync(envFile, 'utf8').split(/\r?\n/).find(l => l.startsWith('CRON_SECRET='))
const secret = line?.slice('CRON_SECRET='.length).trim()
if (!secret) { console.error(`В ${envFile} не найдена строка CRON_SECRET=...`); process.exit(1) }

const job = (name, schedule, fn) => `select cron.schedule(
  '${name}', '${schedule}',
  $$ select net.http_post(
       url     := 'https://${ref}.supabase.co/functions/v1/${fn}',
       headers := jsonb_build_object('Content-Type', 'application/json', 'x-cron-secret', '${secret}'),
       body    := '{}'::jsonb) $$
);`

const sql = `-- Расписания для Supabase. Выполнить один раз в Supabase → SQL Editor. Повторный запуск безопасен (задания обновятся).

-- push-напоминания: раз в минуту (PUSH.md)
${job('send-reminders', '* * * * *', 'send-reminders')}

-- синхронизация с Google Календарём: раз в 5 минут (GOOGLE.md)
${job('google-sync', '*/5 * * * *', 'google-sync')}
`
writeFileSync('supabase/cron.sql', sql)
console.log(`Готово: создан файл supabase/cron.sql (внутри секрет, никому не показывай).
Открой его, скопируй всё содержимое и выполни в Supabase → SQL Editor → Run.
(Если Google-синхронизацию не настраиваешь — расписание google-sync просто будет ничего не делать.)`)
