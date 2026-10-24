-- =====================================================================
-- My life planner: схема базы данных для Supabase (PostgreSQL 15+)
--
-- Как применить:
--   * Supabase Dashboard → SQL Editor → вставить файл целиком → Run, или
--   * положить в supabase/migrations/<время>_init.sql и выполнить `supabase db push`.
-- Запускать один раз на пустом проекте: повторный запуск упадёт на «already exists».
--
-- Соглашения:
--   * Дни недели везде числами ISO: 1 = понедельник … 7 = воскресенье.
--   * «Сегодня» и «день записи» считаются по часовому поясу из user_settings.timezone.
--   * Все таблицы закрыты Row Level Security: каждый видит только строки со своим user_id.
--   * Ссылки между таблицами составные (user_id, id): запись одного человека
--     физически не может сослаться на сферу, проект или задачу другого.
-- =====================================================================

begin;

-- ---------------------------------------------------------------------
-- 1. Перечисления
-- ---------------------------------------------------------------------
create type public.task_status      as enum ('inbox', 'planned', 'done');
create type public.project_status   as enum ('active', 'done', 'archived');
create type public.habit_kind       as enum ('timer', 'plain', 'counter');
create type public.time_source      as enum ('timer', 'manual');
create type public.recurrence_freq  as enum ('day', 'week', 'month', 'year');
create type public.recurrence_mode  as enum ('schedule', 'after_completion');

-- ---------------------------------------------------------------------
-- 2. Таблицы
-- ---------------------------------------------------------------------

-- Настройки пользователя (одна строка на человека, создаётся при регистрации)
create table public.user_settings (
  user_id                 uuid primary key references auth.users (id) on delete cascade,
  timezone                text        not null default 'Europe/Minsk',
  week_starts_on          smallint    not null default 1 check (week_starts_on between 1 and 7),
  timer_nudge_minutes     integer     not null default 40  check (timer_nudge_minutes > 0),
  timer_forgotten_minutes integer     not null default 180 check (timer_forgotten_minutes > 0),
  review_weekday          smallint    not null default 7   check (review_weekday between 1 and 7),
  review_time             time        not null default '19:00',
  created_at              timestamptz not null default now(),
  updated_at              timestamptz not null default now()
);

-- Сферы жизни: здоровье, хобби, семья…
create table public.spheres (
  id                  uuid primary key default gen_random_uuid(),
  user_id             uuid        not null default auth.uid() references auth.users (id) on delete cascade,
  name                text        not null check (length(btrim(name)) between 1 and 80),
  color               text        not null default '#1F6F6B' check (color ~ '^#[0-9A-Fa-f]{6}$'),
  icon                text,
  weekly_goal_minutes integer     not null default 0 check (weekly_goal_minutes >= 0),
  position            integer     not null default 0,
  archived_at         timestamptz,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  unique (user_id, id)
);
create unique index spheres_name_uniq on public.spheres (user_id, lower(name)) where archived_at is null;

-- Проекты: всегда внутри сферы
create table public.projects (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid        not null default auth.uid() references auth.users (id) on delete cascade,
  sphere_id  uuid        not null,
  name       text        not null check (length(btrim(name)) between 1 and 120),
  status     public.project_status not null default 'active',
  position   integer     not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, id),
  foreign key (user_id, sphere_id) references public.spheres (user_id, id) on delete cascade
);

-- Правила повтора. Каждое повторение — обычная задача в таблице tasks.
create table public.recurrences (
  id                    uuid primary key default gen_random_uuid(),
  user_id               uuid        not null default auth.uid() references auth.users (id) on delete cascade,
  -- шаблон будущих задач
  title                 text        not null check (length(btrim(title)) between 1 and 500),
  note                  text,
  sphere_id             uuid,
  project_id            uuid,
  start_time            time,
  estimate_minutes      integer check (estimate_minutes > 0),
  remind_before_minutes integer check (remind_before_minutes >= 0),
  -- само правило
  freq                  public.recurrence_freq not null,
  interval_n            integer     not null default 1 check (interval_n between 1 and 366),
  weekdays              smallint[],
  month_day             smallint check (month_day between 1 and 31),
  mode                  public.recurrence_mode not null default 'schedule',
  starts_on             date        not null,
  ends_on               date,
  generated_until       date,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now(),
  unique (user_id, id),
  foreign key (user_id, sphere_id)  references public.spheres  (user_id, id) on delete set null (sphere_id),
  foreign key (user_id, project_id) references public.projects (user_id, id) on delete set null (project_id),
  check (ends_on is null or ends_on >= starts_on),
  check (weekdays is null or weekdays <@ array[1,2,3,4,5,6,7]::smallint[]),
  check (freq <> 'week' or mode = 'after_completion' or coalesce(cardinality(weekdays), 0) > 0),
  check (remind_before_minutes is null or start_time is not null)
);

-- Задачи. Входящее — это задача со статусом 'inbox'.
create table public.tasks (
  id                    uuid primary key default gen_random_uuid(),
  user_id               uuid        not null default auth.uid() references auth.users (id) on delete cascade,
  title                 text        not null check (length(btrim(title)) between 1 and 500),
  note                  text,
  status                public.task_status not null default 'inbox',
  sphere_id             uuid,
  project_id            uuid,
  due_date              date,
  start_time            time,
  estimate_minutes      integer check (estimate_minutes > 0),
  remind_before_minutes integer check (remind_before_minutes >= 0),
  reminded_at           timestamptz,           -- когда пуш-напоминание уже отправлено
  done_at               timestamptz,           -- заполняется триггером
  recurrence_id         uuid,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now(),
  unique (user_id, id),
  unique (recurrence_id, due_date),
  foreign key (user_id, sphere_id)     references public.spheres     (user_id, id) on delete set null (sphere_id),
  foreign key (user_id, project_id)    references public.projects    (user_id, id) on delete set null (project_id),
  foreign key (user_id, recurrence_id) references public.recurrences (user_id, id) on delete set null (recurrence_id),
  check (start_time is null or due_date is not null),
  check (remind_before_minutes is null or start_time is not null)
);
create index tasks_user_due_idx    on public.tasks (user_id, due_date) where status <> 'done';
create index tasks_user_status_idx on public.tasks (user_id, status);
create index tasks_sphere_idx      on public.tasks (sphere_id);
create index tasks_project_idx     on public.tasks (project_id);

-- Привычки: timer (считаем минуты), plain (отметка), counter (n раз за день)
create table public.habits (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid        not null default auth.uid() references auth.users (id) on delete cascade,
  name         text        not null check (length(btrim(name)) between 1 and 120),
  kind         public.habit_kind not null,
  target_value integer,                         -- timer: минуты в день, counter: число раз; plain: пусто
  weekdays     smallint[]  not null default array[1,2,3,4,5,6,7]::smallint[],
  remind_at    time,
  sphere_id    uuid        not null,
  project_id   uuid,
  position     integer     not null default 0,
  archived_at  timestamptz,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  unique (user_id, id),
  -- сферу с привычками удалить нельзя, её архивируют
  foreign key (user_id, sphere_id)  references public.spheres  (user_id, id) on delete restrict,
  foreign key (user_id, project_id) references public.projects (user_id, id) on delete set null (project_id),
  check (cardinality(weekdays) > 0 and weekdays <@ array[1,2,3,4,5,6,7]::smallint[]),
  check ((kind = 'plain' and target_value is null) or (kind <> 'plain' and coalesce(target_value > 0, false)))
);

-- Отметки привычек (counter и plain). У timer-привычки отметок нет: считается по time_entries.
-- Новый день — новая строка, поэтому «обнуление в полночь» не требует никаких скриптов.
create table public.habit_entries (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid        not null default auth.uid() references auth.users (id) on delete cascade,
  habit_id   uuid        not null,
  entry_date date        not null,
  value      integer     not null default 1 check (value >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (habit_id, entry_date),
  foreign key (user_id, habit_id) references public.habits (user_id, id) on delete cascade
);

-- Записи времени: и с таймера, и добавленные вручную.
-- Незавершённая запись (ended_at is null) — запущенный таймер; он может быть только один.
create table public.time_entries (
  id               uuid primary key default gen_random_uuid(),
  user_id          uuid        not null default auth.uid() references auth.users (id) on delete cascade,
  task_id          uuid,
  habit_id         uuid,
  sphere_id        uuid,                        -- копия из задачи/привычки (триггер), для быстрых сумм
  project_id       uuid,
  started_at       timestamptz not null,
  ended_at         timestamptz,
  source           public.time_source not null default 'timer',
  note             text,
  local_date       date        not null,        -- день начала в часовом поясе пользователя (триггер)
  duration_seconds integer generated always as (extract(epoch from (ended_at - started_at))::integer) stored,
  last_nudge_at    timestamptz,                 -- когда отправлено последнее «таймер идёт N минут»
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  -- при удалении задачи или привычки время остаётся в сфере
  foreign key (user_id, task_id)    references public.tasks    (user_id, id) on delete set null (task_id),
  foreign key (user_id, habit_id)   references public.habits   (user_id, id) on delete set null (habit_id),
  foreign key (user_id, sphere_id)  references public.spheres  (user_id, id) on delete set null (sphere_id),
  foreign key (user_id, project_id) references public.projects (user_id, id) on delete set null (project_id),
  check (ended_at is null or ended_at >= started_at),
  check (num_nonnulls(task_id, habit_id) <= 1),
  check (source = 'timer' or ended_at is not null)
);
create unique index time_entries_one_running on public.time_entries (user_id) where ended_at is null;
create index time_entries_user_day_idx   on public.time_entries (user_id, local_date);
create index time_entries_sphere_day_idx on public.time_entries (sphere_id, local_date);
create index time_entries_task_idx       on public.time_entries (task_id);
create index time_entries_habit_idx      on public.time_entries (habit_id, local_date);

-- Цель недели по сфере. Нет строки на неделю — действует weekly_goal_minutes самой сферы.
create table public.sphere_week_goals (
  user_id    uuid        not null default auth.uid() references auth.users (id) on delete cascade,
  sphere_id  uuid        not null,
  week_start date        not null,
  minutes    integer     not null check (minutes >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (sphere_id, week_start),
  foreign key (user_id, sphere_id) references public.spheres (user_id, id) on delete cascade
);

-- Итог недели. snapshot хранит цифры на момент завершения, и история не меняется,
-- если потом поправить цели или старые записи времени.
create table public.weekly_reviews (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid        not null default auth.uid() references auth.users (id) on delete cascade,
  week_start      date        not null,
  snapshot        jsonb       not null default '{}'::jsonb,
  went_well       text,
  got_in_way      text,
  to_change       text,
  focus_sphere_id uuid,
  completed_at    timestamptz,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  unique (user_id, week_start),
  foreign key (user_id, focus_sphere_id) references public.spheres (user_id, id) on delete set null (focus_sphere_id)
);

-- Подписки на пуш-уведомления (по одной на каждое устройство)
create table public.push_subscriptions (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid        not null default auth.uid() references auth.users (id) on delete cascade,
  endpoint     text        not null unique,
  p256dh       text        not null,
  auth_key     text        not null,
  user_agent   text,
  created_at   timestamptz not null default now(),
  last_used_at timestamptz
);

-- ---------------------------------------------------------------------
-- 3. Вспомогательные функции
-- ---------------------------------------------------------------------

create function public.set_updated_at() returns trigger
language plpgsql set search_path = public as $$
begin
  new.updated_at := now();
  return new;
end $$;

-- Часовой пояс пользователя (UTC, если настроек ещё нет)
create function public.user_tz(p_user uuid default auth.uid()) returns text
language sql stable set search_path = public as $$
  select coalesce((select timezone from public.user_settings where user_id = p_user), 'UTC')
$$;

-- Сегодняшняя дата у пользователя
create function public.local_today(p_user uuid default auth.uid()) returns date
language sql stable set search_path = public as $$
  select (now() at time zone public.user_tz(p_user))::date
$$;

-- Проверка часового пояса: неверное имя выбросит ошибку
create function public.check_timezone() returns trigger
language plpgsql set search_path = public as $$
begin
  perform now() at time zone new.timezone;
  return new;
end $$;

-- Сфера задачи/привычки/правила с проектом всегда равна сфере проекта
create function public.sync_sphere_from_project() returns trigger
language plpgsql set search_path = public as $$
declare v_sphere uuid;
begin
  if new.project_id is not null then
    select p.sphere_id into v_sphere
    from public.projects p
    where p.id = new.project_id and p.user_id = new.user_id;
    if found then
      new.sphere_id := v_sphere;
    elsif tg_op = 'INSERT' or new.project_id is distinct from old.project_id then
      raise exception 'Проект % не найден', new.project_id using errcode = 'foreign_key_violation';
    end if;
    -- иначе проект уже удаляется каскадом вместе со сферой: оставляем значения как есть
  end if;
  return new;
end $$;

-- Задача: done_at выставляется и сбрасывается автоматически
create function public.tasks_set_done_at() returns trigger
language plpgsql set search_path = public as $$
begin
  if new.status = 'done' then
    new.done_at := coalesce(new.done_at, now());
  else
    new.done_at := null;
  end if;
  return new;
end $$;

-- Если у задачи сменилась сфера или проект, время по ней переезжает следом
create function public.tasks_propagate_sphere() returns trigger
language plpgsql set search_path = public as $$
begin
  update public.time_entries
     set sphere_id = new.sphere_id, project_id = new.project_id
   where task_id = new.id
     and (sphere_id is distinct from new.sphere_id or project_id is distinct from new.project_id);
  return null;
end $$;

create function public.habits_propagate_sphere() returns trigger
language plpgsql set search_path = public as $$
begin
  update public.time_entries
     set sphere_id = new.sphere_id, project_id = new.project_id
   where habit_id = new.id
     and (sphere_id is distinct from new.sphere_id or project_id is distinct from new.project_id);
  return null;
end $$;

-- Запись времени: подтягиваем сферу/проект из задачи или привычки, считаем день
create function public.time_entries_prepare() returns trigger
language plpgsql set search_path = public as $$
begin
  if new.task_id is not null then
    select t.sphere_id, t.project_id into new.sphere_id, new.project_id
    from public.tasks t where t.id = new.task_id;
  elsif new.habit_id is not null then
    select h.sphere_id, h.project_id into new.sphere_id, new.project_id
    from public.habits h where h.id = new.habit_id;
  end if;
  new.local_date := (new.started_at at time zone public.user_tz(new.user_id))::date;
  return new;
end $$;

-- Подходит ли дата d под правило повтора r (режим «по расписанию»)
create function public.recurrence_matches(r public.recurrences, d date) returns boolean
language sql stable set search_path = public as $$
  select d >= r.starts_on and case r.freq
    when 'day' then (d - r.starts_on) % r.interval_n = 0
    when 'week' then
      extract(isodow from d)::smallint = any (r.weekdays)
      and (((d - (extract(isodow from d)::int - 1)) - (r.starts_on - (extract(isodow from r.starts_on)::int - 1))) / 7) % r.interval_n = 0
    when 'month' then
      ((extract(year from d)::int * 12 + extract(month from d)::int)
        - (extract(year from r.starts_on)::int * 12 + extract(month from r.starts_on)::int)) % r.interval_n = 0
      and extract(day from d)::int = least(
            coalesce(r.month_day, extract(day from r.starts_on)::int),
            extract(day from (date_trunc('month', d::timestamp) + interval '1 month - 1 day'))::int)
    when 'year' then
      extract(month from d) = extract(month from r.starts_on)
      and extract(day from d) = extract(day from r.starts_on)
      and (extract(year from d)::int - extract(year from r.starts_on)::int) % r.interval_n = 0
  end
$$;

-- Режим «после выполнения»: когда задача закрыта, создаём следующую
create function public.tasks_after_done() returns trigger
language plpgsql set search_path = public as $$
declare
  r      public.recurrences;
  v_done date;
  v_next date;
begin
  select * into r from public.recurrences where id = new.recurrence_id;
  if not found or r.mode <> 'after_completion' then
    return null;
  end if;
  v_done := (new.done_at at time zone public.user_tz(new.user_id))::date;
  v_next := case r.freq
    when 'day'   then v_done + r.interval_n
    when 'week'  then v_done + 7 * r.interval_n
    when 'month' then (v_done::timestamp + make_interval(months => r.interval_n))::date
    when 'year'  then (v_done::timestamp + make_interval(years  => r.interval_n))::date
  end;
  if r.ends_on is not null and v_next > r.ends_on then
    return null;
  end if;
  insert into public.tasks (user_id, title, note, status, sphere_id, project_id, due_date,
                            start_time, estimate_minutes, remind_before_minutes, recurrence_id)
  values (r.user_id, r.title, r.note, 'planned', r.sphere_id, r.project_id, v_next,
          r.start_time, r.estimate_minutes, r.remind_before_minutes, r.id)
  on conflict (recurrence_id, due_date) do nothing;
  return null;
end $$;

-- Новый пользователь получает строку настроек
create function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  insert into public.user_settings (user_id) values (new.id) on conflict do nothing;
  return new;
end $$;

-- ---------------------------------------------------------------------
-- 4. Триггеры
-- ---------------------------------------------------------------------

do $$
declare t text;
begin
  foreach t in array array['user_settings','spheres','projects','recurrences','tasks','habits',
                           'habit_entries','time_entries','sphere_week_goals','weekly_reviews']
  loop
    execute format('create trigger %I before update on public.%I for each row execute function public.set_updated_at()',
                   t || '_updated_at', t);
  end loop;
end $$;

create trigger user_settings_check_tz before insert or update of timezone on public.user_settings
  for each row execute function public.check_timezone();

create trigger tasks_sync_sphere       before insert or update of project_id, sphere_id on public.tasks
  for each row execute function public.sync_sphere_from_project();
create trigger habits_sync_sphere      before insert or update of project_id, sphere_id on public.habits
  for each row execute function public.sync_sphere_from_project();
create trigger recurrences_sync_sphere before insert or update of project_id, sphere_id on public.recurrences
  for each row execute function public.sync_sphere_from_project();

create trigger tasks_done_at before insert or update of status, done_at on public.tasks
  for each row execute function public.tasks_set_done_at();

create trigger tasks_next_occurrence after update of status on public.tasks
  for each row
  when (new.status = 'done' and old.status is distinct from 'done' and new.recurrence_id is not null)
  execute function public.tasks_after_done();

create trigger tasks_propagate_sphere  after update of sphere_id, project_id on public.tasks
  for each row execute function public.tasks_propagate_sphere();
create trigger habits_propagate_sphere after update of sphere_id, project_id on public.habits
  for each row execute function public.habits_propagate_sphere();

create trigger time_entries_prepare before insert or update on public.time_entries
  for each row execute function public.time_entries_prepare();

create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------------------------------------------------------------------
-- 5. Таймер
-- ---------------------------------------------------------------------

-- Запускает таймер. Если уже идёт другой, он останавливается.
create function public.start_timer(
  p_task    uuid default null,
  p_habit   uuid default null,
  p_sphere  uuid default null,
  p_project uuid default null
) returns public.time_entries
language plpgsql set search_path = public as $$
declare e public.time_entries;
begin
  if num_nonnulls(p_task, p_habit) > 1 then
    raise exception 'Таймер можно привязать к задаче или к привычке, но не к обеим сразу';
  end if;
  update public.time_entries set ended_at = now()
   where user_id = auth.uid() and ended_at is null;
  insert into public.time_entries (task_id, habit_id, sphere_id, project_id, started_at, source)
  values (p_task, p_habit, p_sphere, p_project, now(), 'timer')
  returning * into e;
  return e;
end $$;

-- Останавливает таймер. p_at позволяет закончить задним числом
-- (например, «до последнего напоминания», если таймер забыли выключить).
create function public.stop_timer(p_at timestamptz default null) returns public.time_entries
language plpgsql set search_path = public as $$
declare e public.time_entries;
begin
  update public.time_entries
     set ended_at = least(greatest(coalesce(p_at, now()), started_at), now())
   where user_id = auth.uid() and ended_at is null
  returning * into e;
  return e;
end $$;

-- ---------------------------------------------------------------------
-- 6. Привычки
-- ---------------------------------------------------------------------

-- +1 (или любой шаг) к привычке за день. Для plain значение держится в диапазоне 0..1.
-- Привычки с таймером отмечаются временем, а не этой функцией.
create function public.bump_habit(p_habit uuid, p_delta integer default 1, p_day date default null)
returns public.habit_entries
language plpgsql set search_path = public as $$
declare
  v_kind public.habit_kind;
  v_cap  integer;
  v_day  date;
  e      public.habit_entries;
begin
  select kind into v_kind from public.habits where id = p_habit;
  if not found then
    raise exception 'Привычка не найдена';
  end if;
  if v_kind = 'timer' then
    raise exception 'Привычка с таймером отмечается временем, запустите таймер';
  end if;
  v_cap := case when v_kind = 'plain' then 1 else 1000000 end;
  v_day := coalesce(p_day, public.local_today());
  insert into public.habit_entries (habit_id, entry_date, value)
  values (p_habit, v_day, least(greatest(p_delta, 0), v_cap))
  on conflict (habit_id, entry_date)
  do update set value = least(greatest(public.habit_entries.value + p_delta, 0), v_cap)
  returning * into e;
  return e;
end $$;

-- Прогресс всех привычек по дням, на которые они запланированы.
-- timer: value = минуты за день; counter: число раз; plain: 0 или 1.
create function public.habit_progress(p_from date, p_to date)
returns table (habit_id uuid, day date, value integer, target integer, done boolean)
language sql stable set search_path = public as $$
  select h.id, d.day, v.value, coalesce(h.target_value, 1), v.value >= coalesce(h.target_value, 1)
  from public.habits h
  cross join lateral (select p_from + g as day from generate_series(0, p_to - p_from) g) d
  cross join lateral (
    select case h.kind
      when 'timer' then coalesce((
        select floor(sum(coalesce(te.duration_seconds, extract(epoch from now() - te.started_at))) / 60)::int
        from public.time_entries te
        where te.habit_id = h.id and te.local_date = d.day), 0)
      else coalesce((
        select he.value from public.habit_entries he
        where he.habit_id = h.id and he.entry_date = d.day), 0)
    end as value
  ) v
  where extract(isodow from d.day)::smallint = any (h.weekdays)
    and d.day >= (h.created_at at time zone public.user_tz())::date
    and (h.archived_at is null or d.day < (h.archived_at at time zone public.user_tz())::date)
$$;

-- Текущие серии: сколько запланированных дней подряд выполнено.
-- Сегодняшний день не обрывает серию, пока он ещё не закончился.
create function public.habit_streaks() returns table (habit_id uuid, streak integer)
language sql stable set search_path = public as $$
  with today as (select public.local_today() as d),
  p as (
    select hp.* from today, public.habit_progress(today.d - 365, today.d) hp
    where hp.day < today.d or hp.done
  ),
  ranked as (
    select habit_id, done, row_number() over (partition by habit_id order by day desc) as rn from p
  )
  select h.id,
         coalesce(
           (select min(r.rn) - 1 from ranked r where r.habit_id = h.id and not r.done),
           (select count(*) from ranked r where r.habit_id = h.id),
           0)::int
  from public.habits h
  where h.archived_at is null
$$;

-- ---------------------------------------------------------------------
-- 7. Повторяющиеся задачи
-- ---------------------------------------------------------------------

-- Создаёт задачи по правилам на p_days дней вперёд. Безопасно вызывать сколько угодно раз.
-- Для пользователя — без аргументов; для ночного cron — с id каждого пользователя.
create function public.generate_recurring_tasks(p_user uuid default auth.uid(), p_days integer default 30)
returns integer
language plpgsql set search_path = public as $$
declare
  r         public.recurrences;
  v_today   date := public.local_today(p_user);
  v_horizon date := public.local_today(p_user) + p_days;
  v_from    date;
  v_to      date;
  d         date;
  v_n       integer;
  v_total   integer := 0;
begin
  for r in
    select * from public.recurrences
    where user_id = p_user and (ends_on is null or ends_on >= v_today)
  loop
    if r.mode = 'after_completion' then
      -- первую задачу создаём здесь, следующие — триггером после выполнения
      if not exists (select 1 from public.tasks where recurrence_id = r.id) then
        insert into public.tasks (user_id, title, note, status, sphere_id, project_id, due_date,
                                  start_time, estimate_minutes, remind_before_minutes, recurrence_id)
        values (r.user_id, r.title, r.note, 'planned', r.sphere_id, r.project_id, r.starts_on,
                r.start_time, r.estimate_minutes, r.remind_before_minutes, r.id);
        v_total := v_total + 1;
      end if;
    else
      v_from := greatest(r.starts_on, v_today, coalesce(r.generated_until + 1, r.starts_on));
      v_to   := least(v_horizon, coalesce(r.ends_on, v_horizon));
      if v_from <= v_to then
        for d in select v_from + g from generate_series(0, v_to - v_from) g loop
          if public.recurrence_matches(r, d) then
            insert into public.tasks (user_id, title, note, status, sphere_id, project_id, due_date,
                                      start_time, estimate_minutes, remind_before_minutes, recurrence_id)
            values (r.user_id, r.title, r.note, 'planned', r.sphere_id, r.project_id, d,
                    r.start_time, r.estimate_minutes, r.remind_before_minutes, r.id)
            on conflict (recurrence_id, due_date) do nothing;
            get diagnostics v_n = row_count;
            v_total := v_total + v_n;
          end if;
        end loop;
        update public.recurrences set generated_until = v_to where id = r.id;
      end if;
    end if;
  end loop;
  return v_total;
end $$;

-- После правки правила: убираем будущие невыполненные задачи (кроме тех, где уже
-- записано время) и создаём заново.
create function public.rebuild_recurrence(p_id uuid, p_days integer default 30) returns integer
language plpgsql set search_path = public as $$
begin
  delete from public.tasks t
   where t.recurrence_id = p_id
     and t.status <> 'done'
     and t.due_date >= public.local_today()
     and not exists (select 1 from public.time_entries te where te.task_id = t.id);
  update public.recurrences set generated_until = null where id = p_id;
  return public.generate_recurring_tasks(auth.uid(), p_days);
end $$;

-- Удаляет правило и его будущие невыполненные задачи; выполненные остаются в истории.
create function public.delete_recurrence(p_id uuid) returns void
language plpgsql set search_path = public as $$
begin
  delete from public.tasks t
   where t.recurrence_id = p_id
     and t.status <> 'done'
     and t.due_date >= public.local_today()
     and not exists (select 1 from public.time_entries te where te.task_id = t.id);
  delete from public.recurrences where id = p_id;
end $$;

-- ---------------------------------------------------------------------
-- 8. Цели и итог недели
-- ---------------------------------------------------------------------

-- Время по сферам за неделю и цель на эту неделю.
-- В сумму входит и время задач, и время привычек с таймером; запущенный таймер считается до «сейчас».
create function public.week_sphere_summary(p_week_start date)
returns table (sphere_id uuid, name text, color text, minutes integer, goal_minutes integer)
language sql stable set search_path = public as $$
  select s.id, s.name, s.color,
         coalesce((
           select floor(sum(coalesce(te.duration_seconds, extract(epoch from now() - te.started_at))) / 60)::int
           from public.time_entries te
           where te.sphere_id = s.id and te.local_date between p_week_start and p_week_start + 6
         ), 0),
         coalesce(g.minutes, s.weekly_goal_minutes)
  from public.spheres s
  left join public.sphere_week_goals g on g.sphere_id = s.id and g.week_start = p_week_start
  where s.archived_at is null
  order by s.position, s.created_at
$$;

-- Меняет цель сферы. По умолчанию — только на указанную неделю;
-- с p_make_default = true меняется цель самой сферы (и разовые цели с этой недели убираются).
create function public.set_week_goal(
  p_sphere uuid, p_week_start date, p_minutes integer, p_make_default boolean default false
) returns void
language plpgsql set search_path = public as $$
begin
  if p_make_default then
    update public.spheres set weekly_goal_minutes = p_minutes where id = p_sphere;
    if not found then
      raise exception 'Сфера не найдена';
    end if;
    delete from public.sphere_week_goals where sphere_id = p_sphere and week_start >= p_week_start;
  else
    insert into public.sphere_week_goals (sphere_id, week_start, minutes)
    values (p_sphere, p_week_start, p_minutes)
    on conflict (sphere_id, week_start) do update set minutes = excluded.minutes;
  end if;
end $$;

-- Время по каждой задаче: сколько потрачено против оценки
create view public.task_time_totals with (security_invoker = true) as
select t.id as task_id,
       t.user_id,
       t.title,
       t.sphere_id,
       t.recurrence_id,
       t.estimate_minutes,
       coalesce(sum(coalesce(te.duration_seconds, extract(epoch from now() - te.started_at)::int)), 0)::int as spent_seconds,
       count(te.id)::int as entries
from public.tasks t
left join public.time_entries te on te.task_id = t.id
group by t.id;

-- Среднее время повторяющейся задачи по последним 6 выполненным разам
create view public.recurrence_time_stats with (security_invoker = true) as
select recurrence_id,
       user_id,
       count(*)::int as runs,
       round(avg(spent_seconds))::int as avg_seconds
from (
  select tt.recurrence_id, tt.user_id, tt.spent_seconds,
         row_number() over (partition by tt.recurrence_id order by t.done_at desc) as rn
  from public.task_time_totals tt
  join public.tasks t on t.id = tt.task_id
  where tt.recurrence_id is not null and t.status = 'done' and tt.spent_seconds > 0
) x
where rn <= 6
group by recurrence_id, user_id;

-- Все цифры экрана «Итог недели» одним запросом.
-- Результат приложение сохраняет в weekly_reviews.snapshot при завершении недели.
create function public.week_review_data(p_week_start date) returns jsonb
language sql stable set search_path = public as $$
  with s as (select * from public.week_sphere_summary(p_week_start)),
  prev as (select coalesce(sum(minutes), 0)::int as minutes from public.week_sphere_summary(p_week_start - 7)),
  tk as (
    select count(*) filter (where status = 'done')::int as done, count(*)::int as total
    from public.tasks
    where due_date between p_week_start and p_week_start + 6 and status <> 'inbox'
  ),
  hb as (
    select count(*) filter (where done)::int as done_days, count(*)::int as scheduled_days
    from public.habit_progress(p_week_start, least(p_week_start + 6, public.local_today()))
  ),
  top as (
    select t.id as task_id, t.title, t.sphere_id, t.estimate_minutes,
           floor(sum(coalesce(te.duration_seconds, extract(epoch from now() - te.started_at))) / 60)::int as spent_minutes
    from public.time_entries te
    join public.tasks t on t.id = te.task_id
    where te.local_date between p_week_start and p_week_start + 6
    group by t.id
    order by 5 desc
    limit 5
  )
  select jsonb_build_object(
    'week_start',         p_week_start,
    'total_minutes',      (select coalesce(sum(minutes), 0)::int from s),
    'prev_total_minutes', (select minutes from prev),
    'spheres',            (select coalesce(jsonb_agg(to_jsonb(s)), '[]'::jsonb) from s),
    'tasks_done',         (select done from tk),
    'tasks_total',        (select total from tk),
    'habit_days_done',    (select done_days from hb),
    'habit_days_total',   (select scheduled_days from hb),
    'top_time_tasks',     (select coalesce(jsonb_agg(to_jsonb(top)), '[]'::jsonb) from top)
  )
$$;

-- ---------------------------------------------------------------------
-- 9. Экспорт
-- ---------------------------------------------------------------------

-- Все данные пользователя одним JSON (RLS отдаёт только его строки).
-- CSV приложение собирает на устройстве из тех же таблиц.
-- Ключи пуш-подписок в экспорт не входят.
create function public.export_all() returns jsonb
language sql stable set search_path = public as $$
  select jsonb_build_object(
    'version',     1,
    'exported_at', now(),
    'settings',      (select coalesce(jsonb_agg(to_jsonb(x)), '[]'::jsonb) from public.user_settings x),
    'spheres',       (select coalesce(jsonb_agg(to_jsonb(x) order by x.position, x.created_at), '[]'::jsonb) from public.spheres x),
    'projects',      (select coalesce(jsonb_agg(to_jsonb(x) order by x.created_at), '[]'::jsonb) from public.projects x),
    'tasks',         (select coalesce(jsonb_agg(to_jsonb(x) order by x.created_at), '[]'::jsonb) from public.tasks x),
    'recurrences',   (select coalesce(jsonb_agg(to_jsonb(x) order by x.created_at), '[]'::jsonb) from public.recurrences x),
    'habits',        (select coalesce(jsonb_agg(to_jsonb(x) order by x.position, x.created_at), '[]'::jsonb) from public.habits x),
    'habit_entries', (select coalesce(jsonb_agg(to_jsonb(x) order by x.entry_date), '[]'::jsonb) from public.habit_entries x),
    'time_entries',  (select coalesce(jsonb_agg(to_jsonb(x) order by x.started_at), '[]'::jsonb) from public.time_entries x),
    'week_goals',    (select coalesce(jsonb_agg(to_jsonb(x) order by x.week_start), '[]'::jsonb) from public.sphere_week_goals x),
    'weekly_reviews',(select coalesce(jsonb_agg(to_jsonb(x) order by x.week_start), '[]'::jsonb) from public.weekly_reviews x)
  )
$$;

-- ---------------------------------------------------------------------
-- 10. Доступ: Row Level Security и права
-- ---------------------------------------------------------------------

do $$
declare t text;
begin
  foreach t in array array['user_settings','spheres','projects','recurrences','tasks','habits',
                           'habit_entries','time_entries','sphere_week_goals','weekly_reviews',
                           'push_subscriptions']
  loop
    execute format('alter table public.%I enable row level security', t);
    execute format(
      'create policy %I on public.%I for all to authenticated
         using (user_id = (select auth.uid()))
         with check (user_id = (select auth.uid()))',
      t || '_own', t);
  end loop;
end $$;

-- Анонимным пользователям доступа нет вообще
revoke all on all tables    in schema public from anon;
revoke all on all functions in schema public from public, anon;

grant select, insert, update, delete on all tables in schema public to authenticated;
grant all on all tables in schema public to service_role;

-- Функции, которые приложение вызывает через supabase.rpc(...)
grant execute on function
  public.user_tz(uuid), public.local_today(uuid), public.recurrence_matches(public.recurrences, date),
  public.start_timer(uuid, uuid, uuid, uuid), public.stop_timer(timestamptz),
  public.bump_habit(uuid, integer, date), public.habit_progress(date, date), public.habit_streaks(),
  public.generate_recurring_tasks(uuid, integer), public.rebuild_recurrence(uuid, integer),
  public.delete_recurrence(uuid), public.week_sphere_summary(date),
  public.set_week_goal(uuid, date, integer, boolean), public.week_review_data(date),
  public.export_all()
to authenticated;

-- Ночная генерация повторов идёт от имени service_role (см. раздел 12)
grant execute on function
  public.user_tz(uuid), public.local_today(uuid), public.recurrence_matches(public.recurrences, date),
  public.generate_recurring_tasks(uuid, integer)
to service_role;

-- ---------------------------------------------------------------------
-- 11. Realtime: таймер и задачи мгновенно появляются на втором устройстве
-- ---------------------------------------------------------------------
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    alter publication supabase_realtime add table public.time_entries, public.tasks, public.habit_entries;
  end if;
end $$;

commit;

-- ---------------------------------------------------------------------
-- 12. По желанию: ночная генерация повторов (расширение pg_cron включается
--     в Dashboard → Database → Extensions). Раскомментируйте после включения.
-- ---------------------------------------------------------------------
-- select cron.schedule(
--   'generate-recurring-tasks', '5 0 * * *',
--   $$ select public.generate_recurring_tasks(user_id, 30) from public.user_settings $$
-- );
