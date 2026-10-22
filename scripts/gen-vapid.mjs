// Генерирует VAPID-ключи для web push и секрет для cron.
// Запуск:  node scripts/gen-vapid.mjs ТВОЯ@почта.com
// Создаёт файл supabase/.env.push (он в .gitignore) с секретами для Supabase и печатает открытый ключ для .env.
// Ничего не устанавливает и никуда не отправляет.
import { generateKeyPairSync, randomBytes } from 'node:crypto'
import { existsSync, mkdirSync, writeFileSync } from 'node:fs'

const email = process.argv[2]
if (!email || !email.includes('@')) {
  console.error('Укажи свою почту:  node scripts/gen-vapid.mjs ТВОЯ@почта.com')
  console.error('(она нужна push-сервисам как контакт на случай проблем, посторонним не показывается)')
  process.exit(1)
}
const target = 'supabase/.env.push'
if (existsSync(target) && !process.argv.includes('--force')) {
  console.error(`Файл ${target} уже есть, ключи не перезаписываю (иначе уже подписанные устройства перестанут получать уведомления).`)
  console.error('Если нужны новые ключи — добавь в конец команды --force')
  process.exit(1)
}

const { publicKey, privateKey } = generateKeyPairSync('ec', { namedCurve: 'prime256v1' })
const pub = publicKey.export({ format: 'jwk' })
const prv = privateKey.export({ format: 'jwk' })
const b = s => Buffer.from(s, 'base64url')

const publicB64 = Buffer.concat([Buffer.from([4]), b(pub.x), b(pub.y)]).toString('base64url') // 65 байт
const privateB64 = prv.d                                                                       // 32 байта
const cron = randomBytes(24).toString('hex')

mkdirSync('supabase', { recursive: true })
writeFileSync(target, `VAPID_PUBLIC_KEY=${publicB64}\nVAPID_PRIVATE_KEY=${privateB64}\nVAPID_SUBJECT=mailto:${email}\nCRON_SECRET=${cron}\n`)

console.log(`
Готово. Создан файл ${target} — в нём секреты для Supabase. Никому его не показывай и не клади в git.

Добавь в файл .env приложения эту строку (это открытый ключ, его можно показывать), затем перезапусти npm run dev:

VITE_VAPID_PUBLIC_KEY=${publicB64}

Секрет для расписания (понадобится в шаге 5, он же лежит в ${target} как CRON_SECRET):
${cron}
`)
