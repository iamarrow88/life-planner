-- =====================================================================
-- KolaApp: календарь цикла и курс таблеток (дополнение к planner_schema.sql)
-- Выполнить один раз в Supabase → SQL Editor, после planner_schema.sql. Безопасно повторять.
-- Что делает:
--   * у привычек — окно активности (active_from / active_until): вне его привычка не запланирована;
--   * cycle_days — отмеченные дни: менструация, первый день цикла, заметка; у первого дня — ещё примечание ко всему циклу;
--   * cycle_settings — настройки календаря: подпись строки на «Сегодня», сфера и схема курса таблеток;
--   * pill_courses — курс приёма таблеток, отдельная запись на каждый цикл (схема курса копируется
--     в запись, поэтому смена настроек не переписывает прошлые курсы).
-- Данные цикла не участвуют в синхронизации с Google Календарём и в export_all.
-- =====================================================================

begin;

alter table public.habits
  add column if not exists active_from  date,
  add column if not exists active_until date;
alter table public.habits drop constraint if exists habits_active_window;
alter table public.habits add constraint habits_active_window
  check (active_from is null or active_until is null or active_until >= active_from);

create table if not exists public.cycle_days (
  user_id     uuid        not null default auth.uid() references auth.users (id) on delete cascade,
  day         date        not null,
  period      boolean     not null default false,
  cycle_start boolean     not null default false,
  note        text        check (note is null or length(note) <= 2000),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  primary key (user_id, day)
);
-- примечание ко всему циклу (хранится в строке первого дня; добавлено позже — поэтому отдельной командой)
alter table public.cycle_days add column if not exists cycle_note text check (cycle_note is null or length(cycle_note) <= 4000);

create table if not exists public.cycle_settings (
  user_id          uuid        primary key default auth.uid() references auth.users (id) on delete cascade,
  link_label       text        not null default 'День цикла' check (length(btrim(link_label)) between 1 and 40),
  sphere_id        uuid,
  course_from_day  smallint    not null default 1  check (course_from_day between 1 and 60),
  course_days      smallint    not null default 21 check (course_days between 1 and 120),
  morning_time     time        not null default '09:00',
  evening_time     time        not null default '21:00',
  morning_habit_id uuid,
  evening_habit_id uuid,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

create table if not exists public.pill_courses (
  id          uuid        primary key default gen_random_uuid(),
  user_id     uuid        not null default auth.uid() references auth.users (id) on delete cascade,
  kind        text        not null default 'cycle' check (kind in ('cycle', 'fixed')), -- 'fixed' — на будущее: курс по датам
  cycle_start date,                 -- для kind = 'cycle': первый день цикла, от которого считается курс
  from_day    smallint,             -- с какого дня цикла (1 — с первого)
  days        smallint,             -- сколько дней
  starts_on   date        not null,
  ends_on     date        not null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  check (ends_on >= starts_on),
  check (kind <> 'cycle' or cycle_start is not null),
  unique (user_id, cycle_start)
);

alter table public.cycle_days     enable row level security;
alter table public.cycle_settings enable row level security;
alter table public.pill_courses   enable row level security;

drop policy if exists cycle_days_own on public.cycle_days;
create policy cycle_days_own on public.cycle_days for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
drop policy if exists cycle_settings_own on public.cycle_settings;
create policy cycle_settings_own on public.cycle_settings for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
drop policy if exists pill_courses_own on public.pill_courses;
create policy pill_courses_own on public.pill_courses for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

grant select, insert, update, delete on public.cycle_days, public.cycle_settings, public.pill_courses to authenticated;
grant all on public.cycle_days, public.cycle_settings, public.pill_courses to service_role;

drop trigger if exists cycle_days_updated_at on public.cycle_days;
create trigger cycle_days_updated_at before update on public.cycle_days
  for each row execute function public.set_updated_at();
drop trigger if exists cycle_settings_updated_at on public.cycle_settings;
create trigger cycle_settings_updated_at before update on public.cycle_settings
  for each row execute function public.set_updated_at();
drop trigger if exists pill_courses_updated_at on public.pill_courses;
create trigger pill_courses_updated_at before update on public.pill_courses
  for each row execute function public.set_updated_at();

commit;
