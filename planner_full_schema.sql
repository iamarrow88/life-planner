-- =====================================================================
-- KolaApp: ПОЛНАЯ схема базы, выгруженная из действующего проекта запросом supabase/dump_schema.sql.
-- Для НОВОГО проекта Supabase: выполнить один раз в SQL Editor вместо всех файлов planner_*.sql.
-- В существующем проекте не выполнять: таблицы уже есть.
-- Данных и секретов здесь нет. Данные загружаются из JSON-файла экспорта, секреты и расписание cron задаются отдельно.
-- После изменения схемы обнови этот файл: выполни supabase/dump_schema.sql и замени текст ниже.
-- =====================================================================

begin;

set check_function_bodies = off;

create extension if not exists pg_cron;

create extension if not exists pg_net;

create extension if not exists pg_stat_statements;

create extension if not exists pgcrypto;

create extension if not exists supabase_vault;

create extension if not exists "uuid-ossp";

create type public.habit_kind as enum ('timer', 'plain', 'counter');

create type public.project_status as enum ('active', 'done', 'archived');

create type public.recurrence_freq as enum ('day', 'week', 'month', 'year');

create type public.recurrence_mode as enum ('schedule', 'after_completion');

create type public.task_status as enum ('inbox', 'planned', 'done');

create type public.time_source as enum ('timer', 'manual');

create table public.books (
  id uuid default gen_random_uuid() not null,
  user_id uuid default auth.uid() not null,
  title text not null,
  author text,
  status text default 'queue'::text not null,
  "position" integer default 0 not null,
  total_pages integer,
  current_page integer default 0 not null,
  started_on date,
  finished_on date,
  rating smallint,
  notes jsonb default '[]'::jsonb not null,
  created_at timestamp with time zone default now() not null,
  updated_at timestamp with time zone default now() not null
);

create table public.capture_tokens (
  user_id uuid not null,
  token_hash text not null,
  created_at timestamp with time zone default now() not null,
  last_used_at timestamp with time zone
);

create table public.cycle_days (
  user_id uuid default auth.uid() not null,
  day date not null,
  period boolean default false not null,
  cycle_start boolean default false not null,
  note text,
  created_at timestamp with time zone default now() not null,
  updated_at timestamp with time zone default now() not null,
  cycle_note text
);

create table public.cycle_settings (
  user_id uuid default auth.uid() not null,
  link_label text default 'День цикла'::text not null,
  sphere_id uuid,
  course_from_day smallint default 1 not null,
  course_days smallint default 21 not null,
  morning_time time without time zone default '09:00:00'::time without time zone not null,
  evening_time time without time zone default '21:00:00'::time without time zone not null,
  morning_habit_id uuid,
  evening_habit_id uuid,
  created_at timestamp with time zone default now() not null,
  updated_at timestamp with time zone default now() not null
);

create table public.google_connections (
  user_id uuid not null,
  refresh_token text not null,
  google_email text,
  calendar_id text default 'primary'::text not null,
  import_events boolean default true not null,
  connected_at timestamp with time zone default now() not null,
  last_sync_at timestamp with time zone,
  last_error text,
  sync_lock_until timestamp with time zone,
  import_calendar_ids text[],
  calendars jsonb default '[]'::jsonb not null,
  can_list_calendars boolean default false not null
);

create table public.google_ignored (
  user_id uuid not null,
  calendar_id text not null,
  event_id text not null,
  created_at timestamp with time zone default now() not null
);

create table public.google_tombstones (
  id bigint not null,
  user_id uuid not null,
  event_id text not null,
  created_at timestamp with time zone default now() not null,
  calendar_id text
);

create table public.habit_entries (
  id uuid default gen_random_uuid() not null,
  user_id uuid default auth.uid() not null,
  habit_id uuid not null,
  entry_date date not null,
  value integer default 1 not null,
  created_at timestamp with time zone default now() not null,
  updated_at timestamp with time zone default now() not null
);

create table public.habits (
  id uuid default gen_random_uuid() not null,
  user_id uuid default auth.uid() not null,
  name text not null,
  kind habit_kind not null,
  target_value integer,
  weekdays smallint[] default ARRAY[(1)::smallint, (2)::smallint, (3)::smallint, (4)::smallint, (5)::smallint, (6)::smallint, (7)::smallint] not null,
  remind_at time without time zone,
  sphere_id uuid not null,
  project_id uuid,
  "position" integer default 0 not null,
  archived_at timestamp with time zone,
  created_at timestamp with time zone default now() not null,
  updated_at timestamp with time zone default now() not null,
  freq recurrence_freq default 'day'::recurrence_freq not null,
  interval_n integer default 1 not null,
  mode recurrence_mode default 'schedule'::recurrence_mode not null,
  starts_on date,
  active_from date,
  active_until date
);

create table public.monthly_items (
  id uuid default gen_random_uuid() not null,
  user_id uuid default auth.uid() not null,
  title text not null,
  note text,
  "position" integer default 0 not null,
  done_month text,
  task_id uuid,
  task_month text,
  created_at timestamp with time zone default now() not null,
  updated_at timestamp with time zone default now() not null
);

create table public.movies (
  id uuid default gen_random_uuid() not null,
  user_id uuid default auth.uid() not null,
  title text not null,
  director text,
  year smallint,
  status text default 'queue'::text not null,
  "position" integer default 0 not null,
  watched_on date,
  rating smallint,
  notes jsonb default '[]'::jsonb not null,
  created_at timestamp with time zone default now() not null,
  updated_at timestamp with time zone default now() not null
);

create table public.pill_courses (
  id uuid default gen_random_uuid() not null,
  user_id uuid default auth.uid() not null,
  kind text default 'cycle'::text not null,
  cycle_start date,
  from_day smallint,
  days smallint,
  starts_on date not null,
  ends_on date not null,
  created_at timestamp with time zone default now() not null,
  updated_at timestamp with time zone default now() not null
);

create table public.projects (
  id uuid default gen_random_uuid() not null,
  user_id uuid default auth.uid() not null,
  sphere_id uuid not null,
  name text not null,
  status project_status default 'active'::project_status not null,
  "position" integer default 0 not null,
  created_at timestamp with time zone default now() not null,
  updated_at timestamp with time zone default now() not null
);

create table public.push_log (
  user_id uuid not null,
  kind text not null,
  ref text not null,
  sent_at timestamp with time zone default now() not null
);

create table public.push_subscriptions (
  id uuid default gen_random_uuid() not null,
  user_id uuid default auth.uid() not null,
  endpoint text not null,
  p256dh text not null,
  auth_key text not null,
  user_agent text,
  created_at timestamp with time zone default now() not null,
  last_used_at timestamp with time zone
);

create table public.recurrences (
  id uuid default gen_random_uuid() not null,
  user_id uuid default auth.uid() not null,
  title text not null,
  note text,
  sphere_id uuid,
  project_id uuid,
  start_time time without time zone,
  estimate_minutes integer,
  remind_before_minutes integer,
  freq recurrence_freq not null,
  interval_n integer default 1 not null,
  weekdays smallint[],
  month_day smallint,
  mode recurrence_mode default 'schedule'::recurrence_mode not null,
  starts_on date not null,
  ends_on date,
  generated_until date,
  created_at timestamp with time zone default now() not null,
  updated_at timestamp with time zone default now() not null,
  tags text[] default '{}'::text[] not null,
  budget numeric(12,2),
  subtasks jsonb default '[]'::jsonb not null,
  complexity smallint
);

create table public.sphere_week_goals (
  user_id uuid default auth.uid() not null,
  sphere_id uuid not null,
  week_start date not null,
  minutes integer not null,
  created_at timestamp with time zone default now() not null,
  updated_at timestamp with time zone default now() not null
);

create table public.spheres (
  id uuid default gen_random_uuid() not null,
  user_id uuid default auth.uid() not null,
  name text not null,
  color text default '#1F6F6B'::text not null,
  icon text,
  weekly_goal_minutes integer default 0 not null,
  "position" integer default 0 not null,
  archived_at timestamp with time zone,
  created_at timestamp with time zone default now() not null,
  updated_at timestamp with time zone default now() not null,
  description text
);

create table public.tasks (
  id uuid default gen_random_uuid() not null,
  user_id uuid default auth.uid() not null,
  title text not null,
  note text,
  status task_status default 'inbox'::task_status not null,
  sphere_id uuid,
  project_id uuid,
  due_date date,
  start_time time without time zone,
  estimate_minutes integer,
  remind_before_minutes integer,
  reminded_at timestamp with time zone,
  done_at timestamp with time zone,
  recurrence_id uuid,
  created_at timestamp with time zone default now() not null,
  updated_at timestamp with time zone default now() not null,
  google_event_id text,
  google_etag text,
  google_all_day boolean default false not null,
  google_dirty boolean default false not null,
  google_calendar_id text,
  tags text[] default '{}'::text[] not null,
  budget numeric(12,2),
  "position" integer,
  subtasks jsonb default '[]'::jsonb not null,
  postpones jsonb default '[]'::jsonb not null,
  priority smallint,
  complexity smallint
);

create table public.time_entries (
  id uuid default gen_random_uuid() not null,
  user_id uuid default auth.uid() not null,
  task_id uuid,
  habit_id uuid,
  sphere_id uuid,
  project_id uuid,
  started_at timestamp with time zone not null,
  ended_at timestamp with time zone,
  source time_source default 'timer'::time_source not null,
  note text,
  local_date date not null,
  duration_seconds integer generated always as ((EXTRACT(epoch FROM (ended_at - started_at)))::integer) stored,
  last_nudge_at timestamp with time zone,
  created_at timestamp with time zone default now() not null,
  updated_at timestamp with time zone default now() not null
);

create table public.user_settings (
  user_id uuid not null,
  timezone text default 'Europe/Minsk'::text not null,
  week_starts_on smallint default 1 not null,
  timer_nudge_minutes integer default 40 not null,
  timer_forgotten_minutes integer default 180 not null,
  review_weekday smallint default 7 not null,
  review_time time without time zone default '19:00:00'::time without time zone not null,
  created_at timestamp with time zone default now() not null,
  updated_at timestamp with time zone default now() not null,
  sleep_minutes_per_day integer default 480 not null,
  routine_minutes_per_day integer default 180 not null,
  sphere_colors text[]
);

create table public.week_work (
  user_id uuid default auth.uid() not null,
  week_start date not null,
  minutes integer not null,
  created_at timestamp with time zone default now() not null,
  updated_at timestamp with time zone default now() not null
);

create table public.weekly_reviews (
  id uuid default gen_random_uuid() not null,
  user_id uuid default auth.uid() not null,
  week_start date not null,
  snapshot jsonb default '{}'::jsonb not null,
  went_well text,
  got_in_way text,
  to_change text,
  focus_sphere_id uuid,
  completed_at timestamp with time zone,
  created_at timestamp with time zone default now() not null,
  updated_at timestamp with time zone default now() not null
);

create table public.wishes (
  id uuid default gen_random_uuid() not null,
  user_id uuid default auth.uid() not null,
  title text not null,
  note text,
  url text,
  price numeric(12,2),
  category text,
  "position" integer default 0 not null,
  fulfilled_at timestamp with time zone,
  task_id uuid,
  created_at timestamp with time zone default now() not null,
  updated_at timestamp with time zone default now() not null
);

alter table public.books add constraint books_author_check CHECK (((author IS NULL) OR (length(author) <= 200)));

alter table public.books add constraint books_current_page_check CHECK ((current_page >= 0));

alter table public.books add constraint books_pkey PRIMARY KEY (id);

alter table public.books add constraint books_rating_check CHECK (((rating IS NULL) OR ((rating >= 1) AND (rating <= 5))));

alter table public.books add constraint books_status_check CHECK ((status = ANY (ARRAY['queue'::text, 'reading'::text, 'done'::text])));

alter table public.books add constraint books_title_check CHECK (((length(btrim(title)) >= 1) AND (length(btrim(title)) <= 300)));

alter table public.books add constraint books_total_pages_check CHECK (((total_pages IS NULL) OR (total_pages > 0)));

alter table public.capture_tokens add constraint capture_tokens_pkey PRIMARY KEY (user_id);

alter table public.capture_tokens add constraint capture_tokens_token_hash_key UNIQUE (token_hash);

alter table public.cycle_days add constraint cycle_days_cycle_note_check CHECK (((cycle_note IS NULL) OR (length(cycle_note) <= 4000)));

alter table public.cycle_days add constraint cycle_days_note_check CHECK (((note IS NULL) OR (length(note) <= 2000)));

alter table public.cycle_days add constraint cycle_days_pkey PRIMARY KEY (user_id, day);

alter table public.cycle_settings add constraint cycle_settings_course_days_check CHECK (((course_days >= 1) AND (course_days <= 120)));

alter table public.cycle_settings add constraint cycle_settings_course_from_day_check CHECK (((course_from_day >= 1) AND (course_from_day <= 60)));

alter table public.cycle_settings add constraint cycle_settings_link_label_check CHECK (((length(btrim(link_label)) >= 1) AND (length(btrim(link_label)) <= 40)));

alter table public.cycle_settings add constraint cycle_settings_pkey PRIMARY KEY (user_id);

alter table public.google_connections add constraint google_connections_pkey PRIMARY KEY (user_id);

alter table public.google_ignored add constraint google_ignored_pkey PRIMARY KEY (user_id, calendar_id, event_id);

alter table public.google_tombstones add constraint google_tombstones_pkey PRIMARY KEY (id);

alter table public.habit_entries add constraint habit_entries_habit_id_entry_date_key UNIQUE (habit_id, entry_date);

alter table public.habit_entries add constraint habit_entries_pkey PRIMARY KEY (id);

alter table public.habit_entries add constraint habit_entries_value_check CHECK ((value >= 0));

alter table public.habits add constraint habits_active_window CHECK (((active_from IS NULL) OR (active_until IS NULL) OR (active_until >= active_from)));

alter table public.habits add constraint habits_check CHECK ((((kind = 'plain'::habit_kind) AND (target_value IS NULL)) OR ((kind <> 'plain'::habit_kind) AND COALESCE((target_value > 0), false))));

alter table public.habits add constraint habits_interval_n_check CHECK (((interval_n >= 1) AND (interval_n <= 366)));

alter table public.habits add constraint habits_name_check CHECK (((length(btrim(name)) >= 1) AND (length(btrim(name)) <= 120)));

alter table public.habits add constraint habits_pkey PRIMARY KEY (id);

alter table public.habits add constraint habits_user_id_id_key UNIQUE (user_id, id);

alter table public.habits add constraint habits_weekdays_check CHECK (((cardinality(weekdays) > 0) AND (weekdays <@ ARRAY[(1)::smallint, (2)::smallint, (3)::smallint, (4)::smallint, (5)::smallint, (6)::smallint, (7)::smallint])));

alter table public.monthly_items add constraint monthly_items_done_month_check CHECK (((done_month IS NULL) OR (done_month ~ '^\d{4}-\d{2}$'::text)));

alter table public.monthly_items add constraint monthly_items_note_check CHECK (((note IS NULL) OR (length(note) <= 4000)));

alter table public.monthly_items add constraint monthly_items_pkey PRIMARY KEY (id);

alter table public.monthly_items add constraint monthly_items_task_month_check CHECK (((task_month IS NULL) OR (task_month ~ '^\d{4}-\d{2}$'::text)));

alter table public.monthly_items add constraint monthly_items_title_check CHECK (((length(btrim(title)) >= 1) AND (length(btrim(title)) <= 300)));

alter table public.movies add constraint movies_director_check CHECK (((director IS NULL) OR (length(director) <= 200)));

alter table public.movies add constraint movies_pkey PRIMARY KEY (id);

alter table public.movies add constraint movies_rating_check CHECK (((rating IS NULL) OR ((rating >= 1) AND (rating <= 5))));

alter table public.movies add constraint movies_status_check CHECK ((status = ANY (ARRAY['queue'::text, 'watched'::text])));

alter table public.movies add constraint movies_title_check CHECK (((length(btrim(title)) >= 1) AND (length(btrim(title)) <= 300)));

alter table public.movies add constraint movies_year_check CHECK (((year IS NULL) OR ((year >= 1880) AND (year <= 2100))));

alter table public.pill_courses add constraint pill_courses_check CHECK ((ends_on >= starts_on));

alter table public.pill_courses add constraint pill_courses_check1 CHECK (((kind <> 'cycle'::text) OR (cycle_start IS NOT NULL)));

alter table public.pill_courses add constraint pill_courses_kind_check CHECK ((kind = ANY (ARRAY['cycle'::text, 'fixed'::text])));

alter table public.pill_courses add constraint pill_courses_pkey PRIMARY KEY (id);

alter table public.pill_courses add constraint pill_courses_user_id_cycle_start_key UNIQUE (user_id, cycle_start);

alter table public.projects add constraint projects_name_check CHECK (((length(btrim(name)) >= 1) AND (length(btrim(name)) <= 120)));

alter table public.projects add constraint projects_pkey PRIMARY KEY (id);

alter table public.projects add constraint projects_user_id_id_key UNIQUE (user_id, id);

alter table public.push_log add constraint push_log_pkey PRIMARY KEY (user_id, kind, ref);

alter table public.push_subscriptions add constraint push_subscriptions_endpoint_key UNIQUE (endpoint);

alter table public.push_subscriptions add constraint push_subscriptions_pkey PRIMARY KEY (id);

alter table public.recurrences add constraint recurrences_budget_check CHECK (((budget IS NULL) OR (budget >= (0)::numeric)));

alter table public.recurrences add constraint recurrences_check CHECK (((ends_on IS NULL) OR (ends_on >= starts_on)));

alter table public.recurrences add constraint recurrences_check1 CHECK (((freq <> 'week'::recurrence_freq) OR (mode = 'after_completion'::recurrence_mode) OR (COALESCE(cardinality(weekdays), 0) > 0)));

alter table public.recurrences add constraint recurrences_check2 CHECK (((remind_before_minutes IS NULL) OR (start_time IS NOT NULL)));

alter table public.recurrences add constraint recurrences_complexity_check CHECK (((complexity IS NULL) OR ((complexity >= 1) AND (complexity <= 3))));

alter table public.recurrences add constraint recurrences_estimate_minutes_check CHECK ((estimate_minutes > 0));

alter table public.recurrences add constraint recurrences_interval_n_check CHECK (((interval_n >= 1) AND (interval_n <= 366)));

alter table public.recurrences add constraint recurrences_month_day_check CHECK (((month_day >= 1) AND (month_day <= 31)));

alter table public.recurrences add constraint recurrences_pkey PRIMARY KEY (id);

alter table public.recurrences add constraint recurrences_remind_before_minutes_check CHECK ((remind_before_minutes >= 0));

alter table public.recurrences add constraint recurrences_title_check CHECK (((length(btrim(title)) >= 1) AND (length(btrim(title)) <= 500)));

alter table public.recurrences add constraint recurrences_user_id_id_key UNIQUE (user_id, id);

alter table public.recurrences add constraint recurrences_weekdays_check CHECK (((weekdays IS NULL) OR (weekdays <@ ARRAY[(1)::smallint, (2)::smallint, (3)::smallint, (4)::smallint, (5)::smallint, (6)::smallint, (7)::smallint])));

alter table public.sphere_week_goals add constraint sphere_week_goals_minutes_check CHECK ((minutes >= 0));

alter table public.sphere_week_goals add constraint sphere_week_goals_pkey PRIMARY KEY (sphere_id, week_start);

alter table public.spheres add constraint spheres_color_check CHECK ((color ~ '^#[0-9A-Fa-f]{6}$'::text));

alter table public.spheres add constraint spheres_description_len CHECK (((description IS NULL) OR (length(description) <= 2000)));

alter table public.spheres add constraint spheres_name_check CHECK (((length(btrim(name)) >= 1) AND (length(btrim(name)) <= 80)));

alter table public.spheres add constraint spheres_pkey PRIMARY KEY (id);

alter table public.spheres add constraint spheres_user_id_id_key UNIQUE (user_id, id);

alter table public.spheres add constraint spheres_weekly_goal_minutes_check CHECK ((weekly_goal_minutes >= 0));

alter table public.tasks add constraint tasks_budget_check CHECK (((budget IS NULL) OR (budget >= (0)::numeric)));

alter table public.tasks add constraint tasks_check CHECK (((start_time IS NULL) OR (due_date IS NOT NULL)));

alter table public.tasks add constraint tasks_check1 CHECK (((remind_before_minutes IS NULL) OR (start_time IS NOT NULL)));

alter table public.tasks add constraint tasks_complexity_check CHECK (((complexity IS NULL) OR ((complexity >= 1) AND (complexity <= 3))));

alter table public.tasks add constraint tasks_estimate_minutes_check CHECK ((estimate_minutes > 0));

alter table public.tasks add constraint tasks_pkey PRIMARY KEY (id);

alter table public.tasks add constraint tasks_priority_check CHECK (((priority IS NULL) OR ((priority >= 1) AND (priority <= 3))));

alter table public.tasks add constraint tasks_recurrence_id_due_date_key UNIQUE (recurrence_id, due_date);

alter table public.tasks add constraint tasks_remind_before_minutes_check CHECK ((remind_before_minutes >= 0));

alter table public.tasks add constraint tasks_title_check CHECK (((length(btrim(title)) >= 1) AND (length(btrim(title)) <= 500)));

alter table public.tasks add constraint tasks_user_id_id_key UNIQUE (user_id, id);

alter table public.time_entries add constraint time_entries_check CHECK (((ended_at IS NULL) OR (ended_at >= started_at)));

alter table public.time_entries add constraint time_entries_check1 CHECK ((num_nonnulls(task_id, habit_id) <= 1));

alter table public.time_entries add constraint time_entries_check2 CHECK (((source = 'timer'::time_source) OR (ended_at IS NOT NULL)));

alter table public.time_entries add constraint time_entries_pkey PRIMARY KEY (id);

alter table public.user_settings add constraint user_settings_pkey PRIMARY KEY (user_id);

alter table public.user_settings add constraint user_settings_review_weekday_check CHECK (((review_weekday >= 1) AND (review_weekday <= 7)));

alter table public.user_settings add constraint user_settings_routine_minutes_per_day_check CHECK (((routine_minutes_per_day >= 0) AND (routine_minutes_per_day <= 1440)));

alter table public.user_settings add constraint user_settings_sleep_minutes_per_day_check CHECK (((sleep_minutes_per_day >= 0) AND (sleep_minutes_per_day <= 1440)));

alter table public.user_settings add constraint user_settings_sphere_colors_check CHECK (((sphere_colors IS NULL) OR (((cardinality(sphere_colors) >= 1) AND (cardinality(sphere_colors) <= 48)) AND (array_to_string(sphere_colors, ' '::text) ~ '^#[0-9A-Fa-f]{6}( #[0-9A-Fa-f]{6})*$'::text))));

alter table public.user_settings add constraint user_settings_timer_forgotten_minutes_check CHECK ((timer_forgotten_minutes > 0));

alter table public.user_settings add constraint user_settings_timer_nudge_minutes_check CHECK ((timer_nudge_minutes > 0));

alter table public.user_settings add constraint user_settings_week_starts_on_check CHECK (((week_starts_on >= 1) AND (week_starts_on <= 7)));

alter table public.week_work add constraint week_work_minutes_check CHECK (((minutes >= 0) AND (minutes <= 10080)));

alter table public.week_work add constraint week_work_pkey PRIMARY KEY (user_id, week_start);

alter table public.weekly_reviews add constraint weekly_reviews_pkey PRIMARY KEY (id);

alter table public.weekly_reviews add constraint weekly_reviews_user_id_week_start_key UNIQUE (user_id, week_start);

alter table public.wishes add constraint wishes_category_check CHECK (((category IS NULL) OR ((length(btrim(category)) >= 1) AND (length(btrim(category)) <= 60))));

alter table public.wishes add constraint wishes_note_check CHECK (((note IS NULL) OR (length(note) <= 4000)));

alter table public.wishes add constraint wishes_pkey PRIMARY KEY (id);

alter table public.wishes add constraint wishes_price_check CHECK (((price IS NULL) OR (price >= (0)::numeric)));

alter table public.wishes add constraint wishes_title_check CHECK (((length(btrim(title)) >= 1) AND (length(btrim(title)) <= 300)));

alter table public.wishes add constraint wishes_url_check CHECK (((url IS NULL) OR ((url ~* '^https?://'::text) AND (length(url) <= 2000))));

alter table public.books add constraint books_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;

alter table public.capture_tokens add constraint capture_tokens_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;

alter table public.cycle_days add constraint cycle_days_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;

alter table public.cycle_settings add constraint cycle_settings_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;

alter table public.google_connections add constraint google_connections_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;

alter table public.habit_entries add constraint habit_entries_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;

alter table public.habit_entries add constraint habit_entries_user_id_habit_id_fkey FOREIGN KEY (user_id, habit_id) REFERENCES habits(user_id, id) ON DELETE CASCADE;

alter table public.habits add constraint habits_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;

alter table public.habits add constraint habits_user_id_project_id_fkey FOREIGN KEY (user_id, project_id) REFERENCES projects(user_id, id) ON DELETE SET NULL (project_id);

alter table public.habits add constraint habits_user_id_sphere_id_fkey FOREIGN KEY (user_id, sphere_id) REFERENCES spheres(user_id, id) ON DELETE RESTRICT;

alter table public.monthly_items add constraint monthly_items_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;

alter table public.monthly_items add constraint monthly_items_user_id_task_id_fkey FOREIGN KEY (user_id, task_id) REFERENCES tasks(user_id, id) ON DELETE SET NULL (task_id);

alter table public.movies add constraint movies_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;

alter table public.pill_courses add constraint pill_courses_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;

alter table public.projects add constraint projects_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;

alter table public.projects add constraint projects_user_id_sphere_id_fkey FOREIGN KEY (user_id, sphere_id) REFERENCES spheres(user_id, id) ON DELETE CASCADE;

alter table public.push_log add constraint push_log_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;

alter table public.push_subscriptions add constraint push_subscriptions_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;

alter table public.recurrences add constraint recurrences_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;

alter table public.recurrences add constraint recurrences_user_id_project_id_fkey FOREIGN KEY (user_id, project_id) REFERENCES projects(user_id, id) ON DELETE SET NULL (project_id);

alter table public.recurrences add constraint recurrences_user_id_sphere_id_fkey FOREIGN KEY (user_id, sphere_id) REFERENCES spheres(user_id, id) ON DELETE SET NULL (sphere_id);

alter table public.sphere_week_goals add constraint sphere_week_goals_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;

alter table public.sphere_week_goals add constraint sphere_week_goals_user_id_sphere_id_fkey FOREIGN KEY (user_id, sphere_id) REFERENCES spheres(user_id, id) ON DELETE CASCADE;

alter table public.spheres add constraint spheres_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;

alter table public.tasks add constraint tasks_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;

alter table public.tasks add constraint tasks_user_id_project_id_fkey FOREIGN KEY (user_id, project_id) REFERENCES projects(user_id, id) ON DELETE SET NULL (project_id);

alter table public.tasks add constraint tasks_user_id_recurrence_id_fkey FOREIGN KEY (user_id, recurrence_id) REFERENCES recurrences(user_id, id) ON DELETE SET NULL (recurrence_id);

alter table public.tasks add constraint tasks_user_id_sphere_id_fkey FOREIGN KEY (user_id, sphere_id) REFERENCES spheres(user_id, id) ON DELETE SET NULL (sphere_id);

alter table public.time_entries add constraint time_entries_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;

alter table public.time_entries add constraint time_entries_user_id_habit_id_fkey FOREIGN KEY (user_id, habit_id) REFERENCES habits(user_id, id) ON DELETE SET NULL (habit_id);

alter table public.time_entries add constraint time_entries_user_id_project_id_fkey FOREIGN KEY (user_id, project_id) REFERENCES projects(user_id, id) ON DELETE SET NULL (project_id);

alter table public.time_entries add constraint time_entries_user_id_sphere_id_fkey FOREIGN KEY (user_id, sphere_id) REFERENCES spheres(user_id, id) ON DELETE SET NULL (sphere_id);

alter table public.time_entries add constraint time_entries_user_id_task_id_fkey FOREIGN KEY (user_id, task_id) REFERENCES tasks(user_id, id) ON DELETE SET NULL (task_id);

alter table public.user_settings add constraint user_settings_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;

alter table public.week_work add constraint week_work_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;

alter table public.weekly_reviews add constraint weekly_reviews_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;

alter table public.weekly_reviews add constraint weekly_reviews_user_id_focus_sphere_id_fkey FOREIGN KEY (user_id, focus_sphere_id) REFERENCES spheres(user_id, id) ON DELETE SET NULL (focus_sphere_id);

alter table public.wishes add constraint wishes_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;

alter table public.wishes add constraint wishes_user_id_task_id_fkey FOREIGN KEY (user_id, task_id) REFERENCES tasks(user_id, id) ON DELETE SET NULL (task_id);

CREATE OR REPLACE FUNCTION public.bump_habit(p_habit uuid, p_delta integer DEFAULT 1, p_day date DEFAULT NULL::date)
 RETURNS habit_entries
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
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
end $function$
;

CREATE OR REPLACE FUNCTION public.capture_token_info()
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select coalesce((select jsonb_build_object('created_at', created_at, 'last_used_at', last_used_at)
                     from public.capture_tokens where user_id = auth.uid()), 'null'::jsonb)
$function$
;

CREATE OR REPLACE FUNCTION public.check_timezone()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
begin
  perform now() at time zone new.timezone;
  return new;
end $function$
;

CREATE OR REPLACE FUNCTION public.claim_due_habit_notifications(p_now timestamp with time zone DEFAULT now())
 RETURNS TABLE(user_id uuid, kind text, title text, body text, url text, tag text)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
#variable_conflict use_column
begin
  return query
  with loc as (
    select h.id, h.user_id, h.name, h.kind, h.target_value, h.remind_at, h.active_from, h.active_until,
           (p_now at time zone public.user_tz(h.user_id)) as lnow
      from public.habits h
     where h.remind_at is not null
       and h.archived_at is null
  ), due as (
    select l.*, l.lnow::date as lday
      from loc l
     where l.lnow >= l.lnow::date + l.remind_at
       and l.lnow <  l.lnow::date + l.remind_at + interval '2 hours'   -- опоздавшие больше чем на 2 часа не шлём
       and (l.active_from  is null or l.lnow::date >= l.active_from)
       and (l.active_until is null or l.lnow::date <= l.active_until)
       -- уже отмечена сегодня — не напоминаем
       and not exists (select 1 from public.habit_entries e
                        where e.habit_id = l.id and e.entry_date = l.lnow::date and e.value >= coalesce(l.target_value, 1))
       and not (l.kind = 'timer' and exists (select 1 from public.time_entries te
                                              where te.habit_id = l.id and te.local_date = l.lnow::date))
  ), ins as (
    insert into public.push_log (user_id, kind, ref, sent_at)
    select d.user_id, 'habit', d.id::text || ':' || d.lday::text, p_now
      from due d
    on conflict do nothing
    returning push_log.user_id, push_log.ref
  )
  select i.user_id, 'habit'::text, d.name, 'Пора · ' || to_char(d.remind_at, 'HH24:MI'), '/today'::text, ('habit-' || d.id::text)
    from ins i
    join due d on i.ref = d.id::text || ':' || d.lday::text;
end $function$
;

CREATE OR REPLACE FUNCTION public.claim_due_notifications(p_now timestamp with time zone DEFAULT now())
 RETURNS TABLE(user_id uuid, kind text, title text, body text, url text, tag text)
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select * from public.claim_due_notifications_base(p_now)
  union all
  select * from public.claim_due_habit_notifications(p_now)
$function$
;

CREATE OR REPLACE FUNCTION public.claim_due_notifications_base(p_now timestamp with time zone DEFAULT now())
 RETURNS TABLE(user_id uuid, kind text, title text, body text, url text, tag text)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
#variable_conflict use_column
declare
  v_cutoff interval := interval '2 hours';   -- опоздавшие больше чем на 2 часа напоминания не шлём
begin
  -- A. Напоминания о задачах: (дата + время начала) − «напомнить за» ≤ сейчас
  return query
  with due as (
    select t.id, t.user_id, t.title, t.start_time,
           ((t.due_date + t.start_time) at time zone public.user_tz(t.user_id)) as starts_at
      from public.tasks t
     where t.status <> 'done'
       and t.reminded_at is null
       and t.start_time is not null
       and t.remind_before_minutes is not null
       and ((t.due_date + t.start_time) at time zone public.user_tz(t.user_id))
             - make_interval(mins => t.remind_before_minutes) <= p_now
       for update of t skip locked
  ), upd as (
    update public.tasks t set reminded_at = p_now from due where t.id = due.id returning due.*
  )
  select u.user_id, 'task'::text, u.title,
         case when u.starts_at <= p_now
              then 'Пора начинать · ' || to_char(u.start_time, 'HH24:MI')
              else 'Через ' || greatest(1, ceil(extract(epoch from (u.starts_at - p_now)) / 60))::int
                   || ' мин · ' || to_char(u.start_time, 'HH24:MI') end,
         '/today'::text, ('task-' || u.id::text)
    from upd u
   where u.starts_at > p_now - v_cutoff;      -- слишком старые помечены отправленными, но молча

  -- B. Таймер идёт: напоминание раз в N минут (по умолчанию 40), после 3 часов — «забыла выключить»
  return query
  with run as (
    select te.id, te.user_id, te.started_at, te.task_id, te.habit_id, te.sphere_id,
           coalesce(s.timer_forgotten_minutes, 180) as forgotten
      from public.time_entries te
      left join public.user_settings s on s.user_id = te.user_id
     where te.ended_at is null
       and p_now - coalesce(te.last_nudge_at, te.started_at)
             >= make_interval(mins => coalesce(s.timer_nudge_minutes, 40))
       for update of te skip locked
  ), upd as (
    update public.time_entries te set last_nudge_at = p_now from run where te.id = run.id returning run.*
  )
  select r.user_id, 'timer'::text,
         coalesce(tk.title, hb.name, sp.name, 'Таймер'),
         case when m.mins >= r.forgotten
              then 'Таймер идёт уже ' || public.fmt_minutes_ru(m.mins) || '. Возможно, ты забыла его выключить.'
              else 'Таймер идёт ' || public.fmt_minutes_ru(m.mins) || '. Всё ещё занимаешься этим?' end,
         '/today'::text, 'timer'::text
    from upd r
    cross join lateral (select floor(extract(epoch from (p_now - r.started_at)) / 60)::int as mins) m
    left join public.tasks   tk on tk.id = r.task_id
    left join public.habits  hb on hb.id = r.habit_id
    left join public.spheres sp on sp.id = r.sphere_id;

  -- C. Итог недели: в выбранный день и час (по умолчанию воскресенье 19:00), в течение 3 часов,
  --    если итог этой недели ещё не завершён и напоминание не отправлялось
  return query
  with loc as (
    select s.user_id, s.review_time, s.review_weekday,
           (p_now at time zone public.user_tz(s.user_id)) as lnow
      from public.user_settings s
  ), ready as (
    select l.user_id, (l.lnow::date - (extract(isodow from l.lnow)::int - 1)) as wk
      from loc l
     where extract(isodow from l.lnow)::int = l.review_weekday
       and l.lnow::time >= l.review_time
       and (l.lnow::time < l.review_time + interval '3 hours' or l.review_time >= time '21:00')
  ), ins as (
    insert into public.push_log (user_id, kind, ref, sent_at)
    select r.user_id, 'review', r.wk::text, p_now
      from ready r
     where not exists (select 1 from public.weekly_reviews w
                        where w.user_id = r.user_id and w.week_start = r.wk and w.completed_at is not null)
    on conflict do nothing
    returning push_log.user_id
  )
  select i.user_id, 'review'::text, 'Итог недели'::text,
         'Посмотри цифры недели и поставь цели на следующую'::text, '/review'::text, 'review'::text
    from ins i;
end $function$
;

CREATE OR REPLACE FUNCTION public.create_capture_token()
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare t text;
begin
  if auth.uid() is null then raise exception 'not authenticated'; end if;
  t := 'plw_' || replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', '');
  insert into public.capture_tokens (user_id, token_hash)
    values (auth.uid(), encode(sha256(convert_to(t, 'utf8')), 'hex'))
    on conflict (user_id) do update
      set token_hash = excluded.token_hash, created_at = now(), last_used_at = null;
  return t;
end $function$
;

CREATE OR REPLACE FUNCTION public.delete_recurrence(p_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
begin
  delete from public.tasks t
   where t.recurrence_id = p_id
     and t.status <> 'done'
     and t.due_date >= public.local_today()
     and not exists (select 1 from public.time_entries te where te.task_id = t.id);
  delete from public.recurrences where id = p_id;
end $function$
;

CREATE OR REPLACE FUNCTION public.export_all()
 RETURNS jsonb
 LANGUAGE sql
 STABLE
 SET search_path TO 'public'
AS $function$
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
$function$
;

CREATE OR REPLACE FUNCTION public.fmt_minutes_ru(p_min integer)
 RETURNS text
 LANGUAGE sql
 IMMUTABLE
AS $function$
  select case when p_min >= 60
              then (p_min / 60) || ' ч' || case when p_min % 60 > 0 then ' ' || (p_min % 60) || ' мин' else '' end
              else p_min || ' мин' end
$function$
;

CREATE OR REPLACE FUNCTION public.generate_recurring_tasks(p_user uuid DEFAULT auth.uid(), p_days integer DEFAULT 30)
 RETURNS integer
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
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
end $function$
;

CREATE OR REPLACE FUNCTION public.google_mark_synced(p_id uuid, p_event_id text, p_etag text, p_all_day boolean, p_seen timestamp with time zone, p_calendar_id text DEFAULT NULL::text)
 RETURNS void
 LANGUAGE sql
 SET search_path TO 'public'
AS $function$
  update public.tasks
     set google_event_id    = p_event_id,
         google_etag        = p_etag,
         google_all_day     = p_all_day,
         google_calendar_id = case when p_event_id is null then null else coalesce(p_calendar_id, google_calendar_id) end,
         google_dirty       = (updated_at is distinct from p_seen)
   where id = p_id
$function$
;

CREATE OR REPLACE FUNCTION public.habit_days(p_from date, p_to date)
 RETURNS TABLE(habit_id uuid, day date, value integer, target integer, done boolean, scheduled boolean)
 LANGUAGE sql
 STABLE
 SET search_path TO 'public'
AS $function$
  select h.id, d.day, v.value, coalesce(h.target_value, 1), v.value >= coalesce(h.target_value, 1),
         public.habit_scheduled(h, d.day)
           and d.day >= (h.created_at at time zone public.user_tz(h.user_id))::date
           and (h.archived_at is null or d.day < (h.archived_at at time zone public.user_tz(h.user_id))::date)
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
$function$
;

CREATE OR REPLACE FUNCTION public.habit_done_days(p_habit uuid)
 RETURNS SETOF date
 LANGUAGE sql
 STABLE
 SET search_path TO 'public'
AS $function$
  select he.entry_date
    from public.habit_entries he join public.habits h on h.id = he.habit_id
   where he.habit_id = p_habit and h.kind <> 'timer' and he.value >= coalesce(h.target_value, 1)
  union
  select te.local_date
    from public.time_entries te join public.habits h on h.id = te.habit_id
   where te.habit_id = p_habit and h.kind = 'timer'
   group by te.local_date, h.target_value
  having floor(sum(coalesce(te.duration_seconds, extract(epoch from now() - te.started_at))) / 60) >= coalesce(h.target_value, 1)
$function$
;

CREATE OR REPLACE FUNCTION public.habit_matches(h habits, d date)
 RETURNS boolean
 LANGUAGE sql
 STABLE
 SET search_path TO 'public'
AS $function$
  select d >= x.s and case h.freq
    when 'day' then (d - x.s) % h.interval_n = 0
    when 'week' then
      extract(isodow from d)::smallint = any (h.weekdays)
      and (((d - (extract(isodow from d)::int - 1)) - (x.s - (extract(isodow from x.s)::int - 1))) / 7) % h.interval_n = 0
    when 'month' then
      ((extract(year from d)::int * 12 + extract(month from d)::int)
        - (extract(year from x.s)::int * 12 + extract(month from x.s)::int)) % h.interval_n = 0
      and extract(day from d)::int = least(
            extract(day from x.s)::int,
            extract(day from (date_trunc('month', d::timestamp) + interval '1 month - 1 day'))::int)
    when 'year' then
      extract(month from d) = extract(month from x.s)
      and extract(day from d) = extract(day from x.s)
      and (extract(year from d)::int - extract(year from x.s)::int) % h.interval_n = 0
  end
  from (select public.habit_start(h) as s) x
$function$
;

CREATE OR REPLACE FUNCTION public.habit_next_after(h habits, d date)
 RETURNS date
 LANGUAGE sql
 STABLE
 SET search_path TO 'public'
AS $function$
  select case h.freq
    when 'day'   then d + h.interval_n
    when 'week'  then d + 7 * h.interval_n
    when 'month' then (d + make_interval(months => h.interval_n))::date
    when 'year'  then (d + make_interval(years => h.interval_n))::date
  end
$function$
;

CREATE OR REPLACE FUNCTION public.habit_progress(p_from date, p_to date)
 RETURNS TABLE(habit_id uuid, day date, value integer, target integer, done boolean)
 LANGUAGE sql
 STABLE
 SET search_path TO 'public'
AS $function$
  select hd.habit_id, hd.day, hd.value, hd.target, hd.done from public.habit_days(p_from, p_to) hd where hd.scheduled
$function$
;

CREATE OR REPLACE FUNCTION public.habit_scheduled(h habits, d date)
 RETURNS boolean
 LANGUAGE sql
 STABLE
 SET search_path TO 'public'
AS $function$
  select case h.mode
    when 'schedule' then public.habit_matches(h, d)
    else d >= greatest(public.habit_start(h), coalesce(
           public.habit_next_after(h, (select max(x) from public.habit_done_days(h.id) x where x < d)),
           public.habit_start(h)))
  end
$function$
;

CREATE OR REPLACE FUNCTION public.habit_start(h habits)
 RETURNS date
 LANGUAGE sql
 STABLE
 SET search_path TO 'public'
AS $function$
  select coalesce(h.starts_on, (h.created_at at time zone public.user_tz(h.user_id))::date)
$function$
;

CREATE OR REPLACE FUNCTION public.local_today(p_user uuid DEFAULT auth.uid())
 RETURNS date
 LANGUAGE sql
 STABLE
 SET search_path TO 'public'
AS $function$
  select (now() at time zone public.user_tz(p_user))::date
$function$
;

CREATE OR REPLACE FUNCTION public.habit_status(p_day date DEFAULT local_today())
 RETURNS TABLE(habit_id uuid, scheduled boolean, due date, last_done date)
 LANGUAGE sql
 STABLE
 SET search_path TO 'public'
AS $function$
  select h.id,
         public.habit_scheduled(h, p_day),
         case
           when h.mode = 'after_completion' then
             greatest(public.habit_start(h), coalesce(public.habit_next_after(h, ld.d), public.habit_start(h)))
           when public.habit_matches(h, p_day) then p_day
           else (select min(p_day + i) from generate_series(1, 4000) i where public.habit_matches(h, p_day + i))
         end,
         ld.d
  from public.habits h
  cross join lateral (select max(x) as d from public.habit_done_days(h.id) x where x < p_day) ld
  where h.archived_at is null
$function$
;

CREATE OR REPLACE FUNCTION public.habit_streaks()
 RETURNS TABLE(habit_id uuid, streak integer)
 LANGUAGE sql
 STABLE
 SET search_path TO 'public'
AS $function$
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
$function$
;

CREATE OR REPLACE FUNCTION public.habits_propagate_sphere()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
begin
  update public.time_entries
     set sphere_id = new.sphere_id, project_id = new.project_id
   where habit_id = new.id
     and (sphere_id is distinct from new.sphere_id or project_id is distinct from new.project_id);
  return null;
end $function$
;

CREATE OR REPLACE FUNCTION public.handle_new_user()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
  insert into public.user_settings (user_id) values (new.id) on conflict do nothing;
  return new;
end $function$
;

CREATE OR REPLACE FUNCTION public.import_all(p_data jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
declare
  v_uid     uuid := auth.uid();
  v_data    jsonb := p_data;
  v_counts  jsonb := '{}'::jsonb;
  v_skipped text[] := '{}';
  v_dropped text[] := '{}';
  v_merged  integer := 0;
  v_no_rule integer := 0;
  -- ключ в файле, таблица, уникальный ключ, поля, которые не берём из файла. Порядок важен: сначала то, на что ссылаются
  v_specs   text[][] := array[
    ['settings',       'user_settings',     'user_id',           ''],
    ['spheres',        'spheres',           'id',                ''],
    ['projects',       'projects',          'id',                ''],
    ['recurrences',    'recurrences',       'id',                ''],
    ['habits',         'habits',            'id',                ''],
    ['tasks',          'tasks',             'id',                'google_event_id,google_etag,google_dirty'],
    ['habit_entries',  'habit_entries',     'habit_id,entry_date', 'id'],
    ['time_entries',   'time_entries',      'id',                ''],
    ['week_goals',     'sphere_week_goals', 'sphere_id,week_start', ''],
    ['weekly_reviews', 'weekly_reviews',    'user_id,week_start', 'id'],
    ['week_work',      'week_work',         'user_id,week_start', ''],
    ['wishes',         'wishes',            'id',                ''],
    ['books',          'books',             'id',                ''],
    ['movies',         'movies',            'id',                ''],
    ['monthly_items',  'monthly_items',     'id',                ''],
    ['pill_courses',   'pill_courses',      'id',                ''],
    ['cycle_days',     'cycle_days',        'user_id,day',       ''],
    ['cycle_settings', 'cycle_settings',    'user_id',           '']
  ];
  v_spec    text[];
  v_rows    jsonb;
  v_cols    text[];
  v_conf    text[];
  v_excl    text[];
  v_sets    text;
  v_n       integer;
  v_id      uuid;
  v_sphere  record;
begin
  if v_uid is null then
    raise exception 'Нужно войти в аккаунт';
  end if;
  if jsonb_typeof(p_data) is distinct from 'object' or not p_data ? 'exported_at' or jsonb_typeof(p_data -> 'tasks') is distinct from 'array' then
    raise exception 'Это не файл экспорта KolaApp';
  end if;

  -- Имя действующей сферы уникально: сфера из файла с именем уже существующей становится ею, и все ссылки переходят на неё
  for v_sphere in
    select e ->> 'id' as id, e ->> 'name' as name
    from jsonb_array_elements(coalesce(p_data -> 'spheres', '[]'::jsonb)) e
    where e ->> 'archived_at' is null
  loop
    select s.id into v_id from public.spheres s
    where s.user_id = v_uid and s.archived_at is null and lower(s.name) = lower(v_sphere.name) and s.id::text <> v_sphere.id;
    if found then
      v_data := replace(v_data::text, v_sphere.id, v_id::text)::jsonb;
      v_merged := v_merged + 1;
    end if;
  end loop;

  -- Задача по повтору на тот же день уникальна: убираем незавершённую копию без времени, которая мешает записи из файла
  delete from public.tasks x
  using jsonb_array_elements(v_data -> 'tasks') e
  where x.user_id = v_uid
    and x.recurrence_id = (e ->> 'recurrence_id')::uuid
    and x.due_date = (e ->> 'due_date')::date
    and x.id <> (e ->> 'id')::uuid
    and x.status <> 'done'
    and not exists (select 1 from public.time_entries te where te.task_id = x.id);

  -- Один курс таблеток на цикл: запись из файла заменяет курс, созданный заново
  if to_regclass('public.pill_courses') is not null then
    delete from public.pill_courses x
    using jsonb_array_elements(coalesce(v_data -> 'pill_courses', '[]'::jsonb)) e
    where x.user_id = v_uid and x.cycle_start = (e ->> 'cycle_start')::date and x.id <> (e ->> 'id')::uuid;
  end if;

  foreach v_spec slice 1 in array v_specs loop
    v_rows := coalesce(v_data -> v_spec[1], '[]'::jsonb);
    -- настройки цикла экспорт пишет одним объектом, а не списком
    if v_spec[1] = 'cycle_settings' and jsonb_typeof(v_rows) = 'object' then
      v_rows := jsonb_build_array(v_rows);
    end if;
    if jsonb_typeof(v_rows) <> 'array' then
      raise exception 'В файле повреждён раздел %', v_spec[1];
    end if;
    if v_spec[1] = 'settings' and jsonb_array_length(v_rows) > 1 then
      v_rows := jsonb_build_array(v_rows -> 0);
    elsif v_spec[1] = 'time_entries' then
      -- запущенный таймер из прошлого не должен «идти» до сих пор
      select coalesce(jsonb_agg(e), '[]'::jsonb) into v_rows from jsonb_array_elements(v_rows) e where e ->> 'ended_at' is not null;
    elsif v_spec[1] = 'tasks' then
      -- связь с повтором ставим отдельным шагом: иначе база создаст лишние следующие задачи и заполнит поля из правила
      select coalesce(jsonb_agg(e || '{"recurrence_id": null}'::jsonb), '[]'::jsonb) into v_rows from jsonb_array_elements(v_rows) e;
    end if;
    continue when jsonb_array_length(v_rows) = 0;

    if to_regclass('public.' || v_spec[2]) is null then
      v_skipped := v_skipped || v_spec[2];
      continue;
    end if;

    v_conf := string_to_array(v_spec[3], ',');
    v_excl := coalesce(string_to_array(nullif(v_spec[4], ''), ','), '{}') || array['user_id', 'duration_seconds'];
    -- Берём только поля, которые есть и в файле, и в таблице
    select coalesce(array_agg(k order by k), '{}') into v_cols
    from (select distinct k from jsonb_array_elements(v_rows) e, jsonb_object_keys(e) k) keys
    where k <> all (v_excl)
      and exists (select 1 from pg_attribute a
                  where a.attrelid = ('public.' || v_spec[2])::regclass and a.attname = k
                    and a.attnum > 0 and not a.attisdropped and a.attgenerated = '');
    select v_dropped || coalesce(array_agg(v_spec[2] || '.' || k order by k), '{}') into v_dropped
    from (select distinct k from jsonb_array_elements(v_rows) e, jsonb_object_keys(e) k) keys
    where k <> all (v_excl) and k <> all (v_cols);
    continue when cardinality(v_cols) = 0;

    select string_agg(format('%I = excluded.%I', c, c), ', ') into v_sets
    from unnest(v_cols) c where c <> all (v_conf);

    execute format(
      'insert into public.%I (user_id, %s) select $1, %s from jsonb_populate_recordset(null::public.%I, $2) r on conflict (%s) %s',
      v_spec[2],
      (select string_agg(format('%I', c), ', ') from unnest(v_cols) c),
      (select string_agg(format('r.%I', c), ', ') from unnest(v_cols) c),
      v_spec[2],
      (select string_agg(format('%I', c), ', ') from unnest(v_conf) c),
      case when v_sets is null then 'do nothing' else 'do update set ' || v_sets end
    ) using v_uid, v_rows;
    get diagnostics v_n = row_count;
    v_counts := v_counts || jsonb_build_object(v_spec[2], v_n);
  end loop;

  -- Связь задач с повторами. Если на этот день уже есть выполненная задача по тому же повтору, запись из файла остаётся без связи
  update public.tasks t
     set recurrence_id = (e ->> 'recurrence_id')::uuid
    from jsonb_array_elements(v_data -> 'tasks') e
   where t.id = (e ->> 'id')::uuid
     and t.user_id = v_uid
     and e ->> 'recurrence_id' is not null
     and t.recurrence_id is distinct from (e ->> 'recurrence_id')::uuid
     and not exists (select 1 from public.tasks x
                     where x.recurrence_id = (e ->> 'recurrence_id')::uuid and x.due_date = t.due_date and x.id <> t.id);
  select count(*) into v_no_rule
    from jsonb_array_elements(v_data -> 'tasks') e
    join public.tasks t on t.id = (e ->> 'id')::uuid
   where e ->> 'recurrence_id' is not null and t.recurrence_id is null;

  return jsonb_build_object('counts', v_counts, 'skipped_tables', to_jsonb(v_skipped), 'dropped_columns', to_jsonb(v_dropped),
                            'merged_spheres', v_merged, 'tasks_without_rule', v_no_rule);
end $function$
;

CREATE OR REPLACE FUNCTION public.is_service_role()
 RETURNS boolean
 LANGUAGE sql
 STABLE
AS $function$
  select current_user = 'service_role'
      or coalesce(nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'role', '') = 'service_role'
$function$
;

CREATE OR REPLACE FUNCTION public.norm_tag(p text)
 RETURNS text
 LANGUAGE sql
 IMMUTABLE
AS $function$
  select left(translate(lower(btrim(p, ' #')),
    'АБВГДЕЁЖЗИЙКЛМНОПРСТУФХЦЧШЩЪЫЬЭЮЯ', 'абвгдеёжзийклмнопрстуфхцчшщъыьэюя'), 40)
$function$
;

CREATE OR REPLACE FUNCTION public.projects_propagate_sphere()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
begin
  update public.tasks       set sphere_id = new.sphere_id where project_id = new.id and user_id = new.user_id and sphere_id is distinct from new.sphere_id;
  update public.recurrences set sphere_id = new.sphere_id where project_id = new.id and user_id = new.user_id and sphere_id is distinct from new.sphere_id;
  update public.habits      set sphere_id = new.sphere_id where project_id = new.id and user_id = new.user_id and sphere_id is distinct from new.sphere_id;
  -- время без задачи и привычки (таймер на проект): у остального сферу поправят триггеры задач и привычек
  update public.time_entries set sphere_id = new.sphere_id
   where project_id = new.id and user_id = new.user_id and task_id is null and habit_id is null and sphere_id is distinct from new.sphere_id;
  return null;
end $function$
;

CREATE OR REPLACE FUNCTION public.rebuild_recurrence(p_id uuid, p_days integer DEFAULT 30)
 RETURNS integer
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
begin
  delete from public.tasks t
   where t.recurrence_id = p_id
     and t.status <> 'done'
     and t.due_date >= public.local_today()
     and not exists (select 1 from public.time_entries te where te.task_id = t.id);
  update public.recurrences set generated_until = null where id = p_id;
  return public.generate_recurring_tasks(auth.uid(), p_days);
end $function$
;

CREATE OR REPLACE FUNCTION public.recurrence_matches(r recurrences, d date)
 RETURNS boolean
 LANGUAGE sql
 STABLE
 SET search_path TO 'public'
AS $function$
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
$function$
;

CREATE OR REPLACE FUNCTION public.rename_tag(p_old text, p_new text DEFAULT NULL::text)
 RETURNS void
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
declare
  v_old text := public.norm_tag(p_old);
  v_new text := nullif(public.norm_tag(coalesce(p_new, '')), '');
begin
  update public.tasks t
     set tags = array(select distinct x from unnest(case when v_new is null then array_remove(t.tags, v_old)
                                                         else array_replace(t.tags, v_old, v_new) end) x order by x)
   where t.user_id = auth.uid() and v_old = any(t.tags);
  update public.recurrences r
     set tags = array(select distinct x from unnest(case when v_new is null then array_remove(r.tags, v_old)
                                                         else array_replace(r.tags, v_old, v_new) end) x order by x)
   where r.user_id = auth.uid() and v_old = any(r.tags);
end $function$
;

CREATE OR REPLACE FUNCTION public.revoke_capture_token()
 RETURNS void
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  delete from public.capture_tokens where user_id = auth.uid()
$function$
;

CREATE OR REPLACE FUNCTION public.set_updated_at()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
begin
  new.updated_at := now();
  return new;
end $function$
;

CREATE OR REPLACE FUNCTION public.set_week_goal(p_sphere uuid, p_week_start date, p_minutes integer, p_make_default boolean DEFAULT false)
 RETURNS void
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
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
end $function$
;

CREATE OR REPLACE FUNCTION public.sphere_to_project(p_sphere uuid, p_target uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
declare
  v_uid uuid := auth.uid();
  v_name text;
  v_pos integer;
  v_project uuid;
begin
  if p_sphere = p_target then raise exception 'Сферу нельзя сделать проектом её самой'; end if;
  select s.name into v_name from public.spheres s where s.id = p_sphere and s.user_id = v_uid;
  if not found then raise exception 'Сфера не найдена'; end if;
  perform 1 from public.spheres s where s.id = p_target and s.user_id = v_uid and s.archived_at is null;
  if not found then raise exception 'Сфера, в которую переносим, не найдена'; end if;

  -- новый проект — в конец списка проектов p_target, следом за ним — проекты бывшей сферы
  select coalesce(max(p.position), -1) + 1 into v_pos from public.projects p where p.sphere_id = p_target and p.user_id = v_uid;
  insert into public.projects (user_id, sphere_id, name, position) values (v_uid, p_target, v_name, v_pos) returning id into v_project;
  update public.projects set sphere_id = p_target, position = v_pos + 1 + position
   where sphere_id = p_sphere and user_id = v_uid;          -- их задачи и привычки переедут триггером выше

  -- всё, что лежало в сфере без проекта, — в новый проект
  update public.tasks       set project_id = v_project, sphere_id = p_target where sphere_id = p_sphere and project_id is null and user_id = v_uid;
  update public.recurrences set project_id = v_project, sphere_id = p_target where sphere_id = p_sphere and project_id is null and user_id = v_uid;
  update public.habits      set project_id = v_project, sphere_id = p_target where sphere_id = p_sphere and project_id is null and user_id = v_uid;
  -- таймер на саму сферу и время по удалённым задачам
  update public.time_entries set sphere_id = p_target, project_id = coalesce(project_id, v_project)
   where sphere_id = p_sphere and user_id = v_uid and task_id is null and habit_id is null;

  update public.weekly_reviews set focus_sphere_id = p_target where focus_sphere_id = p_sphere and user_id = v_uid;
  if to_regclass('public.cycle_settings') is not null then
    execute 'update public.cycle_settings set sphere_id = $1 where sphere_id = $2 and user_id = $3' using p_target, p_sphere, v_uid;
  end if;

  delete from public.spheres where id = p_sphere and user_id = v_uid;
  return v_project;
end $function$
;

CREATE OR REPLACE FUNCTION public.start_timer(p_task uuid DEFAULT NULL::uuid, p_habit uuid DEFAULT NULL::uuid, p_sphere uuid DEFAULT NULL::uuid, p_project uuid DEFAULT NULL::uuid)
 RETURNS time_entries
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
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
end $function$
;

CREATE OR REPLACE FUNCTION public.stop_timer(p_at timestamp with time zone DEFAULT NULL::timestamp with time zone)
 RETURNS time_entries
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
declare e public.time_entries;
begin
  update public.time_entries
     set ended_at = least(greatest(coalesce(p_at, now()), started_at), now())
   where user_id = auth.uid() and ended_at is null
  returning * into e;
  return e;
end $function$
;

CREATE OR REPLACE FUNCTION public.sync_sphere_from_project()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
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
end $function$
;

CREATE OR REPLACE FUNCTION public.tasks_after_done()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
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
end $function$
;

CREATE OR REPLACE FUNCTION public.tasks_budget_on_insert()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
begin
  if new.recurrence_id is not null and new.budget is null then
    select r.budget into new.budget from public.recurrences r where r.id = new.recurrence_id;
  end if;
  return new;
end $function$
;

CREATE OR REPLACE FUNCTION public.tasks_complexity_on_insert()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
begin
  if new.recurrence_id is not null and new.complexity is null then
    select r.complexity into new.complexity from public.recurrences r where r.id = new.recurrence_id;
  end if;
  return new;
end $function$
;

CREATE OR REPLACE FUNCTION public.tasks_google_dirty()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
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
end $function$
;

CREATE OR REPLACE FUNCTION public.tasks_google_tombstone()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
begin
  if old.google_event_id is not null and not public.is_service_role() then
    insert into public.google_tombstones (user_id, event_id, calendar_id) values (old.user_id, old.google_event_id, old.google_calendar_id);
  end if;
  return old;
end $function$
;

CREATE OR REPLACE FUNCTION public.tasks_propagate_sphere()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
begin
  update public.time_entries
     set sphere_id = new.sphere_id, project_id = new.project_id
   where task_id = new.id
     and (sphere_id is distinct from new.sphere_id or project_id is distinct from new.project_id);
  return null;
end $function$
;

CREATE OR REPLACE FUNCTION public.tasks_rearm_reminder()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
begin
  if new.reminded_at is not null and new.reminded_at is not distinct from old.reminded_at and (
       new.due_date              is distinct from old.due_date
    or new.start_time            is distinct from old.start_time
    or new.remind_before_minutes is distinct from old.remind_before_minutes
    or (old.status = 'done' and new.status <> 'done')
  ) then
    new.reminded_at := null;
  end if;
  return new;
end $function$
;

CREATE OR REPLACE FUNCTION public.tasks_set_done_at()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
begin
  if new.status = 'done' then
    new.done_at := coalesce(new.done_at, now());
  else
    new.done_at := null;
  end if;
  return new;
end $function$
;

CREATE OR REPLACE FUNCTION public.tasks_subtasks_on_insert()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
begin
  if new.recurrence_id is not null and jsonb_array_length(coalesce(new.subtasks, '[]')) = 0 then
    select coalesce(jsonb_agg(e.x || '{"done": false}'::jsonb order by e.n), '[]') into new.subtasks
      from public.recurrences r, jsonb_array_elements(r.subtasks) with ordinality as e(x, n)
     where r.id = new.recurrence_id;
  end if;
  return new;
end $function$
;

CREATE OR REPLACE FUNCTION public.tasks_tags_on_insert()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
declare
  v_tags text[];
begin
  -- «Позвонить в банк #звонки» → название «Позвонить в банк», теги {звонки}
  if new.title ~ '(^|\s)#[A-Za-zА-Яа-яЁё]' then
    select coalesce(array_agg(distinct public.norm_tag(m[1])), '{}') into v_tags
      from regexp_matches(new.title, '(?:^|\s)#([A-Za-zА-Яа-яЁё][A-Za-zА-Яа-яЁё0-9_-]*)', 'g') as m;
    new.tags  := array(select distinct x from unnest(coalesce(new.tags, '{}') || v_tags) x order by x);
    new.title := btrim(regexp_replace(regexp_replace(new.title, '(^|\s)#[A-Za-zА-Яа-яЁё][A-Za-zА-Яа-яЁё0-9_-]*', '\1', 'g'), '\s+', ' ', 'g'));
    if new.title = '' then new.title := array_to_string(v_tags, ' '); end if;  -- задача из одних тегов
  end if;
  -- задача по повтору без своих тегов получает теги правила
  if new.recurrence_id is not null and cardinality(coalesce(new.tags, '{}')) = 0 then
    select r.tags into v_tags from public.recurrences r where r.id = new.recurrence_id;
    new.tags := coalesce(v_tags, '{}');
  end if;
  return new;
end $function$
;

CREATE OR REPLACE FUNCTION public.time_entries_prepare()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
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
end $function$
;

CREATE OR REPLACE FUNCTION public.user_tz(p_user uuid DEFAULT auth.uid())
 RETURNS text
 LANGUAGE sql
 STABLE
 SET search_path TO 'public'
AS $function$
  select coalesce((select timezone from public.user_settings where user_id = p_user), 'UTC')
$function$
;

CREATE OR REPLACE FUNCTION public.week_review_data(p_week_start date)
 RETURNS jsonb
 LANGUAGE sql
 STABLE
 SET search_path TO 'public'
AS $function$
  with s as (select * from public.week_sphere_summary(p_week_start)),
  prev as (select coalesce(sum(minutes), 0)::int as minutes from public.week_sphere_summary(p_week_start - 7)),
  tk as (
    -- «выполнено за неделю» — по дате выполнения (done_at), любые задачи: с датой, без даты, из входящих
    select count(*) filter (where status = 'done' and (done_at at time zone public.user_tz())::date between p_week_start and p_week_start + 6)::int as done,
           count(*) filter (where due_date between p_week_start and p_week_start + 6 and status <> 'inbox')::int as total
    from public.tasks
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
$function$
;

CREATE OR REPLACE FUNCTION public.week_sphere_summary(p_week_start date)
 RETURNS TABLE(sphere_id uuid, name text, color text, minutes integer, goal_minutes integer)
 LANGUAGE sql
 STABLE
 SET search_path TO 'public'
AS $function$
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
$function$
;

create view public.task_time_totals with (security_invoker=true) as
 SELECT t.id AS task_id,
    t.user_id,
    t.title,
    t.sphere_id,
    t.recurrence_id,
    t.estimate_minutes,
    (COALESCE(sum(COALESCE(te.duration_seconds, (EXTRACT(epoch FROM (now() - te.started_at)))::integer)), (0)::bigint))::integer AS spent_seconds,
    (count(te.id))::integer AS entries
   FROM (tasks t
     LEFT JOIN time_entries te ON ((te.task_id = t.id)))
  GROUP BY t.id;

create view public.recurrence_time_stats with (security_invoker=true) as
 SELECT recurrence_id,
    user_id,
    (count(*))::integer AS runs,
    (round(avg(spent_seconds)))::integer AS avg_seconds
   FROM ( SELECT tt.recurrence_id,
            tt.user_id,
            tt.spent_seconds,
            row_number() OVER (PARTITION BY tt.recurrence_id ORDER BY t.done_at DESC) AS rn
           FROM (task_time_totals tt
             JOIN tasks t ON ((t.id = tt.task_id)))
          WHERE ((tt.recurrence_id IS NOT NULL) AND (t.status = 'done'::task_status) AND (tt.spent_seconds > 0))) x
  WHERE (rn <= 6)
  GROUP BY recurrence_id, user_id;

CREATE INDEX books_user_position ON public.books USING btree (user_id, "position");

CREATE INDEX google_tombstones_user_idx ON public.google_tombstones USING btree (user_id);

CREATE INDEX monthly_items_user_position ON public.monthly_items USING btree (user_id, "position");

CREATE INDEX movies_user_position ON public.movies USING btree (user_id, "position");

CREATE UNIQUE INDEX spheres_name_uniq ON public.spheres USING btree (user_id, lower(name)) WHERE (archived_at IS NULL);

CREATE INDEX tasks_google_dirty_idx ON public.tasks USING btree (user_id) WHERE google_dirty;

CREATE INDEX tasks_google_event_idx ON public.tasks USING btree (user_id, google_event_id) WHERE (google_event_id IS NOT NULL);

CREATE INDEX tasks_project_idx ON public.tasks USING btree (project_id);

CREATE INDEX tasks_sphere_idx ON public.tasks USING btree (sphere_id);

CREATE INDEX tasks_tags_idx ON public.tasks USING gin (tags);

CREATE INDEX tasks_user_due_idx ON public.tasks USING btree (user_id, due_date) WHERE (status <> 'done'::task_status);

CREATE INDEX tasks_user_status_idx ON public.tasks USING btree (user_id, status);

CREATE INDEX time_entries_habit_idx ON public.time_entries USING btree (habit_id, local_date);

CREATE UNIQUE INDEX time_entries_one_running ON public.time_entries USING btree (user_id) WHERE (ended_at IS NULL);

CREATE INDEX time_entries_sphere_day_idx ON public.time_entries USING btree (sphere_id, local_date);

CREATE INDEX time_entries_task_idx ON public.time_entries USING btree (task_id);

CREATE INDEX time_entries_user_day_idx ON public.time_entries USING btree (user_id, local_date);

CREATE INDEX wishes_user_position ON public.wishes USING btree (user_id, "position");

CREATE TRIGGER books_updated_at BEFORE UPDATE ON public.books FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER cycle_days_updated_at BEFORE UPDATE ON public.cycle_days FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER cycle_settings_updated_at BEFORE UPDATE ON public.cycle_settings FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER habit_entries_updated_at BEFORE UPDATE ON public.habit_entries FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER habits_propagate_sphere AFTER UPDATE OF sphere_id, project_id ON public.habits FOR EACH ROW EXECUTE FUNCTION habits_propagate_sphere();

CREATE TRIGGER habits_sync_sphere BEFORE INSERT OR UPDATE OF project_id, sphere_id ON public.habits FOR EACH ROW EXECUTE FUNCTION sync_sphere_from_project();

CREATE TRIGGER habits_updated_at BEFORE UPDATE ON public.habits FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER monthly_items_updated_at BEFORE UPDATE ON public.monthly_items FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER movies_updated_at BEFORE UPDATE ON public.movies FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER on_auth_user_created AFTER INSERT ON auth.users FOR EACH ROW EXECUTE FUNCTION handle_new_user();

CREATE TRIGGER pill_courses_updated_at BEFORE UPDATE ON public.pill_courses FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER projects_propagate_sphere AFTER UPDATE OF sphere_id ON public.projects FOR EACH ROW WHEN ((old.sphere_id IS DISTINCT FROM new.sphere_id)) EXECUTE FUNCTION projects_propagate_sphere();

CREATE TRIGGER projects_updated_at BEFORE UPDATE ON public.projects FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER recurrences_sync_sphere BEFORE INSERT OR UPDATE OF project_id, sphere_id ON public.recurrences FOR EACH ROW EXECUTE FUNCTION sync_sphere_from_project();

CREATE TRIGGER recurrences_updated_at BEFORE UPDATE ON public.recurrences FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER sphere_week_goals_updated_at BEFORE UPDATE ON public.sphere_week_goals FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER spheres_updated_at BEFORE UPDATE ON public.spheres FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER tasks_budget_on_insert BEFORE INSERT ON public.tasks FOR EACH ROW EXECUTE FUNCTION tasks_budget_on_insert();

CREATE TRIGGER tasks_complexity_on_insert BEFORE INSERT ON public.tasks FOR EACH ROW EXECUTE FUNCTION tasks_complexity_on_insert();

CREATE TRIGGER tasks_done_at BEFORE INSERT OR UPDATE OF status, done_at ON public.tasks FOR EACH ROW EXECUTE FUNCTION tasks_set_done_at();

CREATE TRIGGER tasks_google_dirty BEFORE INSERT OR UPDATE ON public.tasks FOR EACH ROW EXECUTE FUNCTION tasks_google_dirty();

CREATE TRIGGER tasks_google_tombstone AFTER DELETE ON public.tasks FOR EACH ROW EXECUTE FUNCTION tasks_google_tombstone();

CREATE TRIGGER tasks_next_occurrence AFTER UPDATE OF status ON public.tasks FOR EACH ROW WHEN (((new.status = 'done'::task_status) AND (old.status IS DISTINCT FROM 'done'::task_status) AND (new.recurrence_id IS NOT NULL))) EXECUTE FUNCTION tasks_after_done();

CREATE TRIGGER tasks_propagate_sphere AFTER UPDATE OF sphere_id, project_id ON public.tasks FOR EACH ROW EXECUTE FUNCTION tasks_propagate_sphere();

CREATE TRIGGER tasks_rearm_reminder BEFORE UPDATE ON public.tasks FOR EACH ROW EXECUTE FUNCTION tasks_rearm_reminder();

CREATE TRIGGER tasks_subtasks_on_insert BEFORE INSERT ON public.tasks FOR EACH ROW EXECUTE FUNCTION tasks_subtasks_on_insert();

CREATE TRIGGER tasks_sync_sphere BEFORE INSERT OR UPDATE OF project_id, sphere_id ON public.tasks FOR EACH ROW EXECUTE FUNCTION sync_sphere_from_project();

CREATE TRIGGER tasks_tags_on_insert BEFORE INSERT ON public.tasks FOR EACH ROW EXECUTE FUNCTION tasks_tags_on_insert();

CREATE TRIGGER tasks_updated_at BEFORE UPDATE ON public.tasks FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER time_entries_prepare BEFORE INSERT OR UPDATE ON public.time_entries FOR EACH ROW EXECUTE FUNCTION time_entries_prepare();

CREATE TRIGGER time_entries_updated_at BEFORE UPDATE ON public.time_entries FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER user_settings_check_tz BEFORE INSERT OR UPDATE OF timezone ON public.user_settings FOR EACH ROW EXECUTE FUNCTION check_timezone();

CREATE TRIGGER user_settings_updated_at BEFORE UPDATE ON public.user_settings FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER week_work_updated_at BEFORE UPDATE ON public.week_work FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER weekly_reviews_updated_at BEFORE UPDATE ON public.weekly_reviews FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER wishes_updated_at BEFORE UPDATE ON public.wishes FOR EACH ROW EXECUTE FUNCTION set_updated_at();

alter table public.books enable row level security;

alter table public.capture_tokens enable row level security;

alter table public.cycle_days enable row level security;

alter table public.cycle_settings enable row level security;

alter table public.google_connections enable row level security;

alter table public.google_ignored enable row level security;

alter table public.google_tombstones enable row level security;

alter table public.habit_entries enable row level security;

alter table public.habits enable row level security;

alter table public.monthly_items enable row level security;

alter table public.movies enable row level security;

alter table public.pill_courses enable row level security;

alter table public.projects enable row level security;

alter table public.push_log enable row level security;

alter table public.push_subscriptions enable row level security;

alter table public.recurrences enable row level security;

alter table public.sphere_week_goals enable row level security;

alter table public.spheres enable row level security;

alter table public.tasks enable row level security;

alter table public.time_entries enable row level security;

alter table public.user_settings enable row level security;

alter table public.week_work enable row level security;

alter table public.weekly_reviews enable row level security;

alter table public.wishes enable row level security;

create policy books_own on public.books as PERMISSIVE for ALL to authenticated using ((user_id = ( SELECT auth.uid() AS uid))) with check ((user_id = ( SELECT auth.uid() AS uid)));

create policy cycle_days_own on public.cycle_days as PERMISSIVE for ALL to authenticated using ((user_id = ( SELECT auth.uid() AS uid))) with check ((user_id = ( SELECT auth.uid() AS uid)));

create policy cycle_settings_own on public.cycle_settings as PERMISSIVE for ALL to authenticated using ((user_id = ( SELECT auth.uid() AS uid))) with check ((user_id = ( SELECT auth.uid() AS uid)));

create policy habit_entries_own on public.habit_entries as PERMISSIVE for ALL to authenticated using ((user_id = ( SELECT auth.uid() AS uid))) with check ((user_id = ( SELECT auth.uid() AS uid)));

create policy habits_own on public.habits as PERMISSIVE for ALL to authenticated using ((user_id = ( SELECT auth.uid() AS uid))) with check ((user_id = ( SELECT auth.uid() AS uid)));

create policy monthly_items_own on public.monthly_items as PERMISSIVE for ALL to authenticated using ((user_id = ( SELECT auth.uid() AS uid))) with check ((user_id = ( SELECT auth.uid() AS uid)));

create policy movies_own on public.movies as PERMISSIVE for ALL to authenticated using ((user_id = ( SELECT auth.uid() AS uid))) with check ((user_id = ( SELECT auth.uid() AS uid)));

create policy pill_courses_own on public.pill_courses as PERMISSIVE for ALL to authenticated using ((user_id = ( SELECT auth.uid() AS uid))) with check ((user_id = ( SELECT auth.uid() AS uid)));

create policy projects_own on public.projects as PERMISSIVE for ALL to authenticated using ((user_id = ( SELECT auth.uid() AS uid))) with check ((user_id = ( SELECT auth.uid() AS uid)));

create policy push_subscriptions_own on public.push_subscriptions as PERMISSIVE for ALL to authenticated using ((user_id = ( SELECT auth.uid() AS uid))) with check ((user_id = ( SELECT auth.uid() AS uid)));

create policy recurrences_own on public.recurrences as PERMISSIVE for ALL to authenticated using ((user_id = ( SELECT auth.uid() AS uid))) with check ((user_id = ( SELECT auth.uid() AS uid)));

create policy sphere_week_goals_own on public.sphere_week_goals as PERMISSIVE for ALL to authenticated using ((user_id = ( SELECT auth.uid() AS uid))) with check ((user_id = ( SELECT auth.uid() AS uid)));

create policy spheres_own on public.spheres as PERMISSIVE for ALL to authenticated using ((user_id = ( SELECT auth.uid() AS uid))) with check ((user_id = ( SELECT auth.uid() AS uid)));

create policy tasks_own on public.tasks as PERMISSIVE for ALL to authenticated using ((user_id = ( SELECT auth.uid() AS uid))) with check ((user_id = ( SELECT auth.uid() AS uid)));

create policy time_entries_own on public.time_entries as PERMISSIVE for ALL to authenticated using ((user_id = ( SELECT auth.uid() AS uid))) with check ((user_id = ( SELECT auth.uid() AS uid)));

create policy user_settings_own on public.user_settings as PERMISSIVE for ALL to authenticated using ((user_id = ( SELECT auth.uid() AS uid))) with check ((user_id = ( SELECT auth.uid() AS uid)));

create policy week_work_own on public.week_work as PERMISSIVE for ALL to authenticated using ((user_id = ( SELECT auth.uid() AS uid))) with check ((user_id = ( SELECT auth.uid() AS uid)));

create policy weekly_reviews_own on public.weekly_reviews as PERMISSIVE for ALL to authenticated using ((user_id = ( SELECT auth.uid() AS uid))) with check ((user_id = ( SELECT auth.uid() AS uid)));

create policy wishes_own on public.wishes as PERMISSIVE for ALL to authenticated using ((user_id = ( SELECT auth.uid() AS uid))) with check ((user_id = ( SELECT auth.uid() AS uid)));

revoke all on public.books from anon, authenticated, service_role;

revoke all on public.capture_tokens from anon, authenticated, service_role;

revoke all on public.cycle_days from anon, authenticated, service_role;

revoke all on public.cycle_settings from anon, authenticated, service_role;

revoke all on public.google_connections from anon, authenticated, service_role;

revoke all on public.google_ignored from anon, authenticated, service_role;

revoke all on public.google_tombstones from anon, authenticated, service_role;

revoke all on public.habit_entries from anon, authenticated, service_role;

revoke all on public.habits from anon, authenticated, service_role;

revoke all on public.monthly_items from anon, authenticated, service_role;

revoke all on public.movies from anon, authenticated, service_role;

revoke all on public.pill_courses from anon, authenticated, service_role;

revoke all on public.projects from anon, authenticated, service_role;

revoke all on public.push_log from anon, authenticated, service_role;

revoke all on public.push_subscriptions from anon, authenticated, service_role;

revoke all on public.recurrence_time_stats from anon, authenticated, service_role;

revoke all on public.recurrences from anon, authenticated, service_role;

revoke all on public.sphere_week_goals from anon, authenticated, service_role;

revoke all on public.spheres from anon, authenticated, service_role;

revoke all on public.task_time_totals from anon, authenticated, service_role;

revoke all on public.tasks from anon, authenticated, service_role;

revoke all on public.time_entries from anon, authenticated, service_role;

revoke all on public.user_settings from anon, authenticated, service_role;

revoke all on public.week_work from anon, authenticated, service_role;

revoke all on public.weekly_reviews from anon, authenticated, service_role;

revoke all on public.wishes from anon, authenticated, service_role;

grant DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on public.books to authenticated;

grant DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on public.books to service_role;

grant DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on public.capture_tokens to service_role;

grant DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on public.cycle_days to anon;

grant DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on public.cycle_days to authenticated;

grant DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on public.cycle_days to service_role;

grant DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on public.cycle_settings to anon;

grant DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on public.cycle_settings to authenticated;

grant DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on public.cycle_settings to service_role;

grant DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on public.google_connections to service_role;

grant DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on public.google_ignored to service_role;

grant DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on public.google_tombstones to service_role;

grant DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on public.habit_entries to authenticated;

grant DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on public.habit_entries to service_role;

grant DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on public.habits to authenticated;

grant DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on public.habits to service_role;

grant DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on public.monthly_items to authenticated;

grant DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on public.monthly_items to service_role;

grant DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on public.movies to authenticated;

grant DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on public.movies to service_role;

grant DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on public.pill_courses to anon;

grant DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on public.pill_courses to authenticated;

grant DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on public.pill_courses to service_role;

grant DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on public.projects to authenticated;

grant DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on public.projects to service_role;

grant DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on public.push_log to service_role;

grant DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on public.push_subscriptions to authenticated;

grant DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on public.push_subscriptions to service_role;

grant DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on public.recurrence_time_stats to authenticated;

grant DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on public.recurrence_time_stats to service_role;

grant DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on public.recurrences to authenticated;

grant DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on public.recurrences to service_role;

grant DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on public.sphere_week_goals to authenticated;

grant DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on public.sphere_week_goals to service_role;

grant DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on public.spheres to authenticated;

grant DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on public.spheres to service_role;

grant DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on public.task_time_totals to authenticated;

grant DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on public.task_time_totals to service_role;

grant DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on public.tasks to authenticated;

grant DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on public.tasks to service_role;

grant DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on public.time_entries to authenticated;

grant DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on public.time_entries to service_role;

grant DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on public.user_settings to authenticated;

grant DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on public.user_settings to service_role;

grant DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on public.week_work to anon;

grant DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on public.week_work to authenticated;

grant DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on public.week_work to service_role;

grant DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on public.weekly_reviews to authenticated;

grant DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on public.weekly_reviews to service_role;

grant DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on public.wishes to authenticated;

grant DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on public.wishes to service_role;

revoke all on function public.bump_habit(p_habit uuid, p_delta integer, p_day date) from public, anon, authenticated, service_role;

revoke all on function public.capture_token_info() from public, anon, authenticated, service_role;

revoke all on function public.check_timezone() from public, anon, authenticated, service_role;

revoke all on function public.claim_due_habit_notifications(p_now timestamp with time zone) from public, anon, authenticated, service_role;

revoke all on function public.claim_due_notifications_base(p_now timestamp with time zone) from public, anon, authenticated, service_role;

revoke all on function public.claim_due_notifications(p_now timestamp with time zone) from public, anon, authenticated, service_role;

revoke all on function public.create_capture_token() from public, anon, authenticated, service_role;

revoke all on function public.delete_recurrence(p_id uuid) from public, anon, authenticated, service_role;

revoke all on function public.export_all() from public, anon, authenticated, service_role;

revoke all on function public.fmt_minutes_ru(p_min integer) from public, anon, authenticated, service_role;

revoke all on function public.generate_recurring_tasks(p_user uuid, p_days integer) from public, anon, authenticated, service_role;

revoke all on function public.google_mark_synced(p_id uuid, p_event_id text, p_etag text, p_all_day boolean, p_seen timestamp with time zone, p_calendar_id text) from public, anon, authenticated, service_role;

revoke all on function public.habit_days(p_from date, p_to date) from public, anon, authenticated, service_role;

revoke all on function public.habit_done_days(p_habit uuid) from public, anon, authenticated, service_role;

revoke all on function public.habit_matches(h habits, d date) from public, anon, authenticated, service_role;

revoke all on function public.habit_next_after(h habits, d date) from public, anon, authenticated, service_role;

revoke all on function public.habit_progress(p_from date, p_to date) from public, anon, authenticated, service_role;

revoke all on function public.habit_scheduled(h habits, d date) from public, anon, authenticated, service_role;

revoke all on function public.habit_start(h habits) from public, anon, authenticated, service_role;

revoke all on function public.habit_status(p_day date) from public, anon, authenticated, service_role;

revoke all on function public.habit_streaks() from public, anon, authenticated, service_role;

revoke all on function public.habits_propagate_sphere() from public, anon, authenticated, service_role;

revoke all on function public.handle_new_user() from public, anon, authenticated, service_role;

revoke all on function public.import_all(p_data jsonb) from public, anon, authenticated, service_role;

revoke all on function public.is_service_role() from public, anon, authenticated, service_role;

revoke all on function public.local_today(p_user uuid) from public, anon, authenticated, service_role;

revoke all on function public.norm_tag(p text) from public, anon, authenticated, service_role;

revoke all on function public.projects_propagate_sphere() from public, anon, authenticated, service_role;

revoke all on function public.rebuild_recurrence(p_id uuid, p_days integer) from public, anon, authenticated, service_role;

revoke all on function public.recurrence_matches(r recurrences, d date) from public, anon, authenticated, service_role;

revoke all on function public.rename_tag(p_old text, p_new text) from public, anon, authenticated, service_role;

revoke all on function public.revoke_capture_token() from public, anon, authenticated, service_role;

revoke all on function public.set_updated_at() from public, anon, authenticated, service_role;

revoke all on function public.set_week_goal(p_sphere uuid, p_week_start date, p_minutes integer, p_make_default boolean) from public, anon, authenticated, service_role;

revoke all on function public.sphere_to_project(p_sphere uuid, p_target uuid) from public, anon, authenticated, service_role;

revoke all on function public.start_timer(p_task uuid, p_habit uuid, p_sphere uuid, p_project uuid) from public, anon, authenticated, service_role;

revoke all on function public.stop_timer(p_at timestamp with time zone) from public, anon, authenticated, service_role;

revoke all on function public.sync_sphere_from_project() from public, anon, authenticated, service_role;

revoke all on function public.tasks_after_done() from public, anon, authenticated, service_role;

revoke all on function public.tasks_budget_on_insert() from public, anon, authenticated, service_role;

revoke all on function public.tasks_complexity_on_insert() from public, anon, authenticated, service_role;

revoke all on function public.tasks_google_dirty() from public, anon, authenticated, service_role;

revoke all on function public.tasks_google_tombstone() from public, anon, authenticated, service_role;

revoke all on function public.tasks_propagate_sphere() from public, anon, authenticated, service_role;

revoke all on function public.tasks_rearm_reminder() from public, anon, authenticated, service_role;

revoke all on function public.tasks_set_done_at() from public, anon, authenticated, service_role;

revoke all on function public.tasks_subtasks_on_insert() from public, anon, authenticated, service_role;

revoke all on function public.tasks_tags_on_insert() from public, anon, authenticated, service_role;

revoke all on function public.time_entries_prepare() from public, anon, authenticated, service_role;

revoke all on function public.user_tz(p_user uuid) from public, anon, authenticated, service_role;

revoke all on function public.week_review_data(p_week_start date) from public, anon, authenticated, service_role;

revoke all on function public.week_sphere_summary(p_week_start date) from public, anon, authenticated, service_role;

grant execute on function public.bump_habit(p_habit uuid, p_delta integer, p_day date) to authenticated;

grant execute on function public.bump_habit(p_habit uuid, p_delta integer, p_day date) to service_role;

grant execute on function public.capture_token_info() to authenticated;

grant execute on function public.capture_token_info() to service_role;

grant execute on function public.check_timezone() to authenticated;

grant execute on function public.check_timezone() to service_role;

grant execute on function public.claim_due_habit_notifications(p_now timestamp with time zone) to service_role;

grant execute on function public.claim_due_notifications_base(p_now timestamp with time zone) to service_role;

grant execute on function public.claim_due_notifications(p_now timestamp with time zone) to service_role;

grant execute on function public.create_capture_token() to authenticated;

grant execute on function public.create_capture_token() to service_role;

grant execute on function public.delete_recurrence(p_id uuid) to authenticated;

grant execute on function public.delete_recurrence(p_id uuid) to service_role;

grant execute on function public.export_all() to authenticated;

grant execute on function public.export_all() to service_role;

grant execute on function public.fmt_minutes_ru(p_min integer) to anon;

grant execute on function public.fmt_minutes_ru(p_min integer) to authenticated;

grant execute on function public.fmt_minutes_ru(p_min integer) to public;

grant execute on function public.fmt_minutes_ru(p_min integer) to service_role;

grant execute on function public.generate_recurring_tasks(p_user uuid, p_days integer) to authenticated;

grant execute on function public.generate_recurring_tasks(p_user uuid, p_days integer) to service_role;

grant execute on function public.google_mark_synced(p_id uuid, p_event_id text, p_etag text, p_all_day boolean, p_seen timestamp with time zone, p_calendar_id text) to service_role;

grant execute on function public.habit_days(p_from date, p_to date) to anon;

grant execute on function public.habit_days(p_from date, p_to date) to authenticated;

grant execute on function public.habit_days(p_from date, p_to date) to public;

grant execute on function public.habit_days(p_from date, p_to date) to service_role;

grant execute on function public.habit_done_days(p_habit uuid) to anon;

grant execute on function public.habit_done_days(p_habit uuid) to authenticated;

grant execute on function public.habit_done_days(p_habit uuid) to public;

grant execute on function public.habit_done_days(p_habit uuid) to service_role;

grant execute on function public.habit_matches(h habits, d date) to anon;

grant execute on function public.habit_matches(h habits, d date) to authenticated;

grant execute on function public.habit_matches(h habits, d date) to public;

grant execute on function public.habit_matches(h habits, d date) to service_role;

grant execute on function public.habit_next_after(h habits, d date) to anon;

grant execute on function public.habit_next_after(h habits, d date) to authenticated;

grant execute on function public.habit_next_after(h habits, d date) to public;

grant execute on function public.habit_next_after(h habits, d date) to service_role;

grant execute on function public.habit_progress(p_from date, p_to date) to anon;

grant execute on function public.habit_progress(p_from date, p_to date) to authenticated;

grant execute on function public.habit_progress(p_from date, p_to date) to public;

grant execute on function public.habit_progress(p_from date, p_to date) to service_role;

grant execute on function public.habit_scheduled(h habits, d date) to anon;

grant execute on function public.habit_scheduled(h habits, d date) to authenticated;

grant execute on function public.habit_scheduled(h habits, d date) to public;

grant execute on function public.habit_scheduled(h habits, d date) to service_role;

grant execute on function public.habit_start(h habits) to anon;

grant execute on function public.habit_start(h habits) to authenticated;

grant execute on function public.habit_start(h habits) to public;

grant execute on function public.habit_start(h habits) to service_role;

grant execute on function public.habit_status(p_day date) to anon;

grant execute on function public.habit_status(p_day date) to authenticated;

grant execute on function public.habit_status(p_day date) to public;

grant execute on function public.habit_status(p_day date) to service_role;

grant execute on function public.habit_streaks() to authenticated;

grant execute on function public.habit_streaks() to service_role;

grant execute on function public.habits_propagate_sphere() to authenticated;

grant execute on function public.habits_propagate_sphere() to service_role;

grant execute on function public.handle_new_user() to authenticated;

grant execute on function public.handle_new_user() to service_role;

grant execute on function public.import_all(p_data jsonb) to authenticated;

grant execute on function public.import_all(p_data jsonb) to service_role;

grant execute on function public.is_service_role() to anon;

grant execute on function public.is_service_role() to authenticated;

grant execute on function public.is_service_role() to public;

grant execute on function public.is_service_role() to service_role;

grant execute on function public.local_today(p_user uuid) to authenticated;

grant execute on function public.local_today(p_user uuid) to service_role;

grant execute on function public.norm_tag(p text) to anon;

grant execute on function public.norm_tag(p text) to authenticated;

grant execute on function public.norm_tag(p text) to public;

grant execute on function public.norm_tag(p text) to service_role;

grant execute on function public.projects_propagate_sphere() to anon;

grant execute on function public.projects_propagate_sphere() to authenticated;

grant execute on function public.projects_propagate_sphere() to public;

grant execute on function public.projects_propagate_sphere() to service_role;

grant execute on function public.rebuild_recurrence(p_id uuid, p_days integer) to authenticated;

grant execute on function public.rebuild_recurrence(p_id uuid, p_days integer) to service_role;

grant execute on function public.recurrence_matches(r recurrences, d date) to authenticated;

grant execute on function public.recurrence_matches(r recurrences, d date) to service_role;

grant execute on function public.rename_tag(p_old text, p_new text) to authenticated;

grant execute on function public.rename_tag(p_old text, p_new text) to service_role;

grant execute on function public.revoke_capture_token() to authenticated;

grant execute on function public.revoke_capture_token() to service_role;

grant execute on function public.set_updated_at() to authenticated;

grant execute on function public.set_updated_at() to service_role;

grant execute on function public.set_week_goal(p_sphere uuid, p_week_start date, p_minutes integer, p_make_default boolean) to service_role;

grant execute on function public.set_week_goal(p_sphere uuid, p_week_start date, p_minutes integer, p_make_default boolean) to authenticated;

grant execute on function public.sphere_to_project(p_sphere uuid, p_target uuid) to authenticated;

grant execute on function public.sphere_to_project(p_sphere uuid, p_target uuid) to service_role;

grant execute on function public.start_timer(p_task uuid, p_habit uuid, p_sphere uuid, p_project uuid) to service_role;

grant execute on function public.start_timer(p_task uuid, p_habit uuid, p_sphere uuid, p_project uuid) to authenticated;

grant execute on function public.stop_timer(p_at timestamp with time zone) to authenticated;

grant execute on function public.stop_timer(p_at timestamp with time zone) to service_role;

grant execute on function public.sync_sphere_from_project() to authenticated;

grant execute on function public.sync_sphere_from_project() to service_role;

grant execute on function public.tasks_after_done() to authenticated;

grant execute on function public.tasks_after_done() to service_role;

grant execute on function public.tasks_budget_on_insert() to anon;

grant execute on function public.tasks_budget_on_insert() to authenticated;

grant execute on function public.tasks_budget_on_insert() to public;

grant execute on function public.tasks_budget_on_insert() to service_role;

grant execute on function public.tasks_complexity_on_insert() to anon;

grant execute on function public.tasks_complexity_on_insert() to authenticated;

grant execute on function public.tasks_complexity_on_insert() to public;

grant execute on function public.tasks_complexity_on_insert() to service_role;

grant execute on function public.tasks_google_dirty() to anon;

grant execute on function public.tasks_google_dirty() to authenticated;

grant execute on function public.tasks_google_dirty() to public;

grant execute on function public.tasks_google_dirty() to service_role;

grant execute on function public.tasks_google_tombstone() to anon;

grant execute on function public.tasks_google_tombstone() to authenticated;

grant execute on function public.tasks_google_tombstone() to public;

grant execute on function public.tasks_google_tombstone() to service_role;

grant execute on function public.tasks_propagate_sphere() to authenticated;

grant execute on function public.tasks_propagate_sphere() to service_role;

grant execute on function public.tasks_rearm_reminder() to anon;

grant execute on function public.tasks_rearm_reminder() to authenticated;

grant execute on function public.tasks_rearm_reminder() to public;

grant execute on function public.tasks_rearm_reminder() to service_role;

grant execute on function public.tasks_set_done_at() to authenticated;

grant execute on function public.tasks_set_done_at() to service_role;

grant execute on function public.tasks_subtasks_on_insert() to anon;

grant execute on function public.tasks_subtasks_on_insert() to authenticated;

grant execute on function public.tasks_subtasks_on_insert() to public;

grant execute on function public.tasks_subtasks_on_insert() to service_role;

grant execute on function public.tasks_tags_on_insert() to anon;

grant execute on function public.tasks_tags_on_insert() to authenticated;

grant execute on function public.tasks_tags_on_insert() to public;

grant execute on function public.tasks_tags_on_insert() to service_role;

grant execute on function public.time_entries_prepare() to authenticated;

grant execute on function public.time_entries_prepare() to service_role;

grant execute on function public.user_tz(p_user uuid) to authenticated;

grant execute on function public.user_tz(p_user uuid) to service_role;

grant execute on function public.week_review_data(p_week_start date) to authenticated;

grant execute on function public.week_review_data(p_week_start date) to service_role;

grant execute on function public.week_sphere_summary(p_week_start date) to authenticated;

grant execute on function public.week_sphere_summary(p_week_start date) to service_role;

do $$ begin if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then alter publication supabase_realtime add table public.habit_entries; end if; end $$;

do $$ begin if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then alter publication supabase_realtime add table public.tasks; end if; end $$;

do $$ begin if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then alter publication supabase_realtime add table public.time_entries; end if; end $$;

commit;
