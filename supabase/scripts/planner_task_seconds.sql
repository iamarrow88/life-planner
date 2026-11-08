-- =====================================================================
-- KolaApp: быстрая загрузка — суммы старого времени по задачам считает база
-- Выполнить один раз в Supabase → SQL Editor. Безопасно повторять.
-- Что делает:
--   * task_seconds_before(дата) — сколько секунд записано по каждой задаче до этой даты.
--     Раньше приложение при каждой загрузке скачивало для этого все старые записи времени порциями по 1000;
--     теперь приходит один ответ: { "id задачи": секунды, … }.
-- Без этого файла приложение работает по-старому.
-- =====================================================================

create or replace function public.task_seconds_before(p_since date) returns jsonb
language sql stable set search_path = public as $$
  select coalesce(jsonb_object_agg(task_id, seconds), '{}'::jsonb)
  from (
    select task_id, sum(greatest(0, floor(extract(epoch from (ended_at - started_at)))))::bigint as seconds
    from public.time_entries
    where user_id = (select auth.uid()) and task_id is not null and ended_at is not null and local_date < p_since
    group by task_id
  ) s
$$;

revoke all on function public.task_seconds_before(date) from public, anon;
grant execute on function public.task_seconds_before(date) to authenticated;
