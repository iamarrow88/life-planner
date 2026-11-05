-- v0.8.12: «Задачи» в итоге недели = все задачи, выполненные за эту неделю (по дате выполнения).
-- Выполнить один раз в Supabase → SQL Editor. Безопасно повторять.

create or replace function public.week_review_data(p_week_start date) returns jsonb
language sql stable set search_path = public as $$
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
$$;
