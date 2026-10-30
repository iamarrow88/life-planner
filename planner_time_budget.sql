-- =====================================================================
-- My life planner: бюджет времени на экране «Сферы» (дополнение к planner_schema.sql)
-- Выполнить один раз в Supabase → SQL Editor, после planner_schema.sql. Безопасно повторять.
-- Что делает:
--   * в настройках пользователя — сон и «текучка» (минут в день), по умолчанию 8 ч и 3 ч;
--   * таблица week_work — сколько часов работы в неделю (задаётся в итоге недели на следующую
--     или на экране «Сферы»; неделя без своего значения берёт последнее заданное раньше).
-- Из 168 часов недели вычитаются сон, текучка и работа — остальное делится между сферами.
-- =====================================================================

begin;

alter table public.user_settings
  add column if not exists sleep_minutes_per_day   integer not null default 480 check (sleep_minutes_per_day between 0 and 1440),
  add column if not exists routine_minutes_per_day integer not null default 180 check (routine_minutes_per_day between 0 and 1440);

create table if not exists public.week_work (
  user_id    uuid        not null default auth.uid() references auth.users (id) on delete cascade,
  week_start date        not null,
  minutes    integer     not null check (minutes between 0 and 10080),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (user_id, week_start)
);

alter table public.week_work enable row level security;
drop policy if exists week_work_own on public.week_work;
create policy week_work_own on public.week_work for all to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

grant select, insert, update, delete on public.week_work to authenticated;
grant all on public.week_work to service_role;

drop trigger if exists week_work_updated_at on public.week_work;
create trigger week_work_updated_at before update on public.week_work
  for each row execute function public.set_updated_at();

commit;
