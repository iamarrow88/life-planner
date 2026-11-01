-- =====================================================================
-- My life planner: подзадачи (чек-лист внутри задачи) — дополнение к planner_schema.sql
-- Выполнить один раз в Supabase → SQL Editor. Безопасно повторять.
-- Что делает:
--   * tasks.subtasks и recurrences.subtasks — список подзадач [{ "id", "title", "done" }];
--   * задача по повтору без своих подзадач получает подзадачи правила — все невыполненными.
-- =====================================================================

begin;

alter table public.tasks       add column if not exists subtasks jsonb not null default '[]';
alter table public.recurrences add column if not exists subtasks jsonb not null default '[]';

create or replace function public.tasks_subtasks_on_insert() returns trigger
language plpgsql set search_path = public as $$
begin
  if new.recurrence_id is not null and jsonb_array_length(coalesce(new.subtasks, '[]')) = 0 then
    select coalesce(jsonb_agg(e.x || '{"done": false}'::jsonb order by e.n), '[]') into new.subtasks
      from public.recurrences r, jsonb_array_elements(r.subtasks) with ordinality as e(x, n)
     where r.id = new.recurrence_id;
  end if;
  return new;
end $$;

drop trigger if exists tasks_subtasks_on_insert on public.tasks;
create trigger tasks_subtasks_on_insert before insert on public.tasks
  for each row execute function public.tasks_subtasks_on_insert();

commit;
