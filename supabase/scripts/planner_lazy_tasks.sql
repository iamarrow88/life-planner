-- =====================================================================
-- KolaApp: старые выполненные задачи грузятся по запросу
-- Выполнить один раз в Supabase → SQL Editor. Безопасно повторять.
-- Что делает:
--   * tag_counts() — сколько задач с каждым тегом, включая старые выполненные, которых нет на устройстве:
--     { "тег": число, … }. Без него списки тегов считаются только по загруженным задачам;
--   * индекс для быстрой выборки выполненных задач по дате.
-- Без этого файла приложение тоже работает.
-- =====================================================================

create or replace function public.tag_counts() returns jsonb
language sql stable set search_path = public as $$
  select coalesce(jsonb_object_agg(tag, n), '{}'::jsonb)
  from (
    select tag, count(*)::int as n
    from public.tasks t, unnest(t.tags) as tag
    where t.user_id = (select auth.uid())
    group by tag
  ) s
$$;

revoke all on function public.tag_counts() from public, anon;
grant execute on function public.tag_counts() to authenticated;

create index if not exists tasks_user_done_due_idx on public.tasks (user_id, due_date) where status = 'done';
