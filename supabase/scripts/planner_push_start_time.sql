-- =====================================================================
-- KolaApp: push-напоминание о задаче без «через N мин» (дополнение к planner_push.sql и planner_habit_push.sql)
-- Выполнить один раз в Supabase → SQL Editor. Безопасно повторять.
-- Что делает:
--   * claim_due_notifications_base: в напоминании о задаче вместо «Через 10 мин · 18:30» пишется
--     «Начало в 18:30» — уведомление может провисеть в шторке часами, и относительное время станет неправдой.
--     Остальное в функции не меняется. Функцию send-reminders заново загружать не нужно.
-- =====================================================================

begin;

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
              else 'Начало в ' || to_char(u.start_time, 'HH24:MI') end,
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
end $function$;

revoke all on function public.claim_due_notifications_base(timestamptz) from public, anon, authenticated;
grant execute on function public.claim_due_notifications_base(timestamptz) to service_role;

commit;
