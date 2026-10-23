-- =====================================================================
-- Синхронизация с Google Календарём (v0.8). Выполняется ОДИН раз в Supabase → SQL Editor,
-- после planner_schema.sql и planner_push.sql. Повторный запуск безопасен.
--
-- Что здесь:
--   * google_connections — подключённый аккаунт Google (refresh-токен лежит только здесь, клиенты его НЕ видят);
--   * поля tasks.google_* — связь задачи с событием календаря;
--   * google_tombstones — «надгробия»: какие события удалить в Google, когда задачу удалили в приложении;
--   * триггеры: помечают задачу «изменена, нужно отправить в Google» и запоминают удалённые.
-- =====================================================================

-- 1. Подключения ------------------------------------------------------
create table if not exists public.google_connections (
  user_id         uuid primary key references auth.users (id) on delete cascade,
  refresh_token   text        not null,
  google_email    text,
  calendar_id     text        not null default 'primary',
  import_events   boolean     not null default true,      -- создавать задачи из событий Google
  connected_at    timestamptz not null default now(),
  last_sync_at    timestamptz,
  last_error      text,
  sync_lock_until timestamptz                              -- защита от двух одновременных синхронизаций
);
alter table public.google_connections enable row level security;   -- политик нет: клиенты таблицу не видят
revoke all on public.google_connections from public, anon, authenticated;
grant all on public.google_connections to service_role;

-- 2. Связь задач с событиями -----------------------------------------
alter table public.tasks
  add column if not exists google_event_id text,
  add column if not exists google_etag     text,
  add column if not exists google_all_day  boolean not null default false,   -- событие «на весь день» (без времени)
  add column if not exists google_dirty    boolean not null default false;   -- изменена в приложении, ещё не отправлена

create index if not exists tasks_google_dirty_idx on public.tasks (user_id) where google_dirty;
create index if not exists tasks_google_event_idx on public.tasks (user_id, google_event_id) where google_event_id is not null;

-- 3. Надгробия -------------------------------------------------------
create table if not exists public.google_tombstones (
  id          bigint generated always as identity primary key,
  user_id     uuid        not null,
  event_id    text        not null,
  created_at  timestamptz not null default now()
);
create index if not exists google_tombstones_user_idx on public.google_tombstones (user_id);
alter table public.google_tombstones enable row level security;
revoke all on public.google_tombstones from public, anon, authenticated;
grant all on public.google_tombstones to service_role;

-- 4. Триггеры --------------------------------------------------------
-- Изменения, которые делает сама синхронизация (ключ service_role), «грязными» не считаются.
create or replace function public.is_service_role() returns boolean
language sql stable as $$
  select current_user = 'service_role'
      or coalesce(nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'role', '') = 'service_role'
$$;

create or replace function public.tasks_google_dirty() returns trigger
language plpgsql set search_path = public as $$
begin
  if public.is_service_role() then
    return new;
  end if;
  if tg_op = 'INSERT' then
    new.google_dirty := true;
  elsif new.title            is distinct from old.title
     or new.due_date         is distinct from old.due_date
     or new.start_time       is distinct from old.start_time
     or new.estimate_minutes is distinct from old.estimate_minutes
     or new.status           is distinct from old.status then
    new.google_dirty := true;
  end if;
  return new;
end $$;

drop trigger if exists tasks_google_dirty on public.tasks;
create trigger tasks_google_dirty before insert or update on public.tasks
  for each row execute function public.tasks_google_dirty();

create or replace function public.tasks_google_tombstone() returns trigger
language plpgsql set search_path = public as $$
begin
  if old.google_event_id is not null and not public.is_service_role() then
    insert into public.google_tombstones (user_id, event_id) values (old.user_id, old.google_event_id);
  end if;
  return old;
end $$;

drop trigger if exists tasks_google_tombstone on public.tasks;
create trigger tasks_google_tombstone after delete on public.tasks
  for each row execute function public.tasks_google_tombstone();

-- 5. Отметка «синхронизировано» --------------------------------------
-- Снимает google_dirty только если задачу не успели изменить, пока шла отправка (p_seen — её updated_at на момент чтения).
create or replace function public.google_mark_synced(
  p_id uuid, p_event_id text, p_etag text, p_all_day boolean, p_seen timestamptz
) returns void
language sql set search_path = public as $$
  update public.tasks
     set google_event_id = p_event_id,
         google_etag     = p_etag,
         google_all_day  = p_all_day,
         google_dirty    = (updated_at is distinct from p_seen)
   where id = p_id
$$;
revoke all on function public.google_mark_synced(uuid, text, text, boolean, timestamptz) from public, anon, authenticated;
grant execute on function public.google_mark_synced(uuid, text, text, boolean, timestamptz) to service_role;

-- 6. Расписание (раз в 5 минут) --------------------------------------
-- См. GOOGLE.md: его создаёт готовый скрипт  node scripts/make-cron-sql.mjs REF
