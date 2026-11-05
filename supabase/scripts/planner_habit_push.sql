-- =====================================================================
-- KolaApp: push-напоминания о привычках со временем (таблетки из календаря цикла)
-- Выполнить один раз в Supabase → SQL Editor, ПОСЛЕ planner_push.sql и planner_cycle.sql. Безопасно повторять.
-- Что делает:
--   * claim_due_habit_notifications() — привычки, у которых задано время (remind_at): в это время
--     (и до 2 часов позже) приходит напоминание, если сегодня привычка в окне активности и ещё не отмечена.
--     Каждое напоминание — один раз в день (push_log);
--   * claim_due_notifications() (её вызывает Edge Function send-reminders) теперь отдаёт и эти напоминания:
--     прежняя функция переименовывается в claim_due_notifications_base, а новая объединяет обе.
--     Поэтому функцию send-reminders заново загружать не нужно.
-- Текст нейтральный: заголовок — название привычки («Таблетка · утро»), ниже «Пора · 09:00».
-- Время задают только привычки-таблетки (настройки календаря цикла); расписание по дням недели
-- здесь не проверяется — у таблеток оно ежедневное, а дни задаёт окно активности (курс).
-- =====================================================================

begin;

create or replace function public.claim_due_habit_notifications(p_now timestamptz default now())
returns table (user_id uuid, kind text, title text, body text, url text, tag text)
language plpgsql security definer set search_path = public as $$
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
end $$;

-- Прежнюю функцию сохраняем под другим именем (только при первом запуске)
do $$
begin
  if to_regprocedure('public.claim_due_notifications_base(timestamptz)') is null then
    alter function public.claim_due_notifications(timestamptz) rename to claim_due_notifications_base;
  end if;
end $$;

create or replace function public.claim_due_notifications(p_now timestamptz default now())
returns table (user_id uuid, kind text, title text, body text, url text, tag text)
language sql security definer set search_path = public as $$
  select * from public.claim_due_notifications_base(p_now)
  union all
  select * from public.claim_due_habit_notifications(p_now)
$$;

-- Только service_role (Edge Function). Браузер вызвать не сможет.
revoke all on function public.claim_due_habit_notifications(timestamptz) from public, anon, authenticated;
revoke all on function public.claim_due_notifications_base(timestamptz)  from public, anon, authenticated;
revoke all on function public.claim_due_notifications(timestamptz)       from public, anon, authenticated;
grant execute on function public.claim_due_habit_notifications(timestamptz) to service_role;
grant execute on function public.claim_due_notifications_base(timestamptz)  to service_role;
grant execute on function public.claim_due_notifications(timestamptz)       to service_role;

commit;

-- Проверка (ничего не отправляет, но помечает найденное отправленным — запускать только для теста):
-- select * from public.claim_due_habit_notifications(now());
