# Синхронизация с Google Календарём

- **Задачи со временем** появляются в твоём Google Календаре.
- **События Google** становятся задачами, если включить это в настройках. Берутся события на ближайшие 90 дней.
- Изменения идут в обе стороны. По расписанию синхронизация идёт раз в 5 минут.
- Подключить Google можно только **на сайте**: Google не пускает вход внутри приложений. После этого синхронизация работает и в приложении для Android.
- Данные календаря цикла в Google не уходят.

Постоянный доступ к календарю хранится только на сервере Supabase, браузер его не получает.

Все команды выполняются в терминале, в папке проекта. Ниже вместо Reference ID проекта написано `REF`: он есть в Supabase → **Project Settings → General**.

Названия пунктов в Google Cloud иногда меняются, ориентируйся по смыслу.

## Шаг 1. Проект в Google Cloud

1. Открой [console.cloud.google.com](https://console.cloud.google.com) и создай проект.
2. В **APIs & Services → Library** найди **Google Calendar API** и нажми **Enable**.
3. В **APIs & Services → OAuth consent screen** выбери тип **External** и заполни название и почту.
4. Добавь доступы (scopes):
   - `openid` и `email`;
   - `https://www.googleapis.com/auth/calendar.events`;
   - `https://www.googleapis.com/auth/calendar.calendarlist.readonly`.
5. Добавь свою почту в **Test users**.

**Режим «Testing» и 7 дней.** Пока приложение в этом режиме, Google отзывает доступ примерно через неделю, и календарь придётся подключать заново. Чтобы этого не было, опубликуй его: **Publish app**. Для личного использования проверка Google не обязательна, просто при входе появится предупреждение о непроверенном приложении: нажми «Дополнительно» и продолжи.

## Шаг 2. Ключи входа

1. **APIs & Services → Credentials → Create Credentials → OAuth client ID**, тип **Web application**.
2. В **Authorized redirect URIs** добавь адреса возврата, которые ты будешь использовать:
   - для разработки: `http://localhost:5173/more`;
   - для сайта на GitHub Pages: `https://ИМЯ.github.io/life-planner/more`.
3. Сохрани **Client ID** и **Client secret**.
4. Добавь `VITE_GOOGLE_CLIENT_ID=...` в файл `.env` и перезапусти `npm run dev`.
5. Для выложенного сайта добавь `VITE_GOOGLE_CLIENT_ID` в **Settings → Secrets and variables → Actions** на GitHub.

Адрес должен совпадать полностью, вместе с путём `/more`.

## Шаг 3. Ключи на сервере

Если ещё не настраивала [push-напоминания](PUSH.md), создай файл с секретом и войди в Supabase:

```bash
node scripts/gen-vapid.mjs ТВОЯ@почта.com
npm install supabase --save-dev
npx supabase login
```

Добавь две строки в файл `supabase/.env.push`:

```
GOOGLE_CLIENT_ID=...
GOOGLE_CLIENT_SECRET=...
```

Загрузи секреты:

```bash
npx supabase secrets set --env-file supabase/.env.push --project-ref REF
```

Client secret никому не показывай. Файл `.env.push` в git не попадает.

## Шаг 4. Загрузи функцию на сервер

```bash
npx supabase functions deploy google-sync --no-verify-jwt --use-api --project-ref REF
```

Функция сама проверяет, кто её вызвал: приложение с токеном пользователя или расписание с секретом `CRON_SECRET`. Поэтому нужен `--no-verify-jwt`. А `--use-api` избавляет от необходимости ставить Docker.

## Шаг 5. База и расписание

**База.** Если она создана из `planner_full_schema.sql`, ничего делать не нужно. Для старой базы одного файла `supabase/scripts/planner_google.sql` мало: более поздние изменения для Google есть только в `planner_full_schema.sql`. Проверь, что в таблице `tasks` есть колонка `google_calendar_id` и существует таблица `google_ignored`.

**Расписание:**

1. Supabase → **Database → Extensions**: включи **pg_cron** и **pg_net**.
2. Создай готовый SQL:

   ```bash
   node scripts/make-cron-sql.mjs REF
   ```

3. Скопируй содержимое `supabase/cron.sql` в **SQL Editor** и выполни. В файле секрет, в git он не попадает. Заодно создастся расписание для push-напоминаний. Если они не нужны, удали первый блок перед запуском.

## Шаг 6. Подключи календарь

Открой **сайт**: «Ещё» → «Google Календарь» и войди в Google.

Что можно настроить после подключения:

- **Создавать задачи из событий Google.** Если удалить такую задачу, событие в Google останется.
- **Какие календари читать и куда отправлять задачи.** Без доступа к списку календарей синхронизируется только основной.

## Если что-то не работает

| Что видно | В чём дело |
|---|---|
| «Не задан `VITE_GOOGLE_CLIENT_ID`» | нет значения в `.env` или не перезапущен `npm run dev` (шаг 2) |
| «На сервере не заданы ключи Google» или `Не заданы: ...` | секреты не загружены (шаг 3) |
| «Функция google-sync не загружена» или «Не удалось связаться» | функция не загружена (шаг 4) |
| Google пишет `redirect_uri_mismatch` | адрес в **Authorized redirect URIs** не совпадает с адресом сайта (шаг 2) |
| Google пишет `access_denied` или «приложение не проверено» | добавь почту в **Test users** или опубликуй приложение (шаг 1) |
| Через неделю синхронизация перестала работать | приложение в режиме «Testing», опубликуй его и подключи заново (шаг 1) |
| «Не получен доступ к календарю» | при входе не поставлена галочка доступа к календарю, подключи заново |
| Вручную работает, сама не синхронизируется | проверь расписание (шаг 5): `select * from cron.job_run_details order by start_time desc limit 5;` |

Журнал функции: Supabase → **Edge Functions → google-sync → Logs**.
