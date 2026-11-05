-- =====================================================================
-- KolaApp: сложность задачи (дополнение к planner_schema.sql)
-- Выполнить один раз в Supabase → SQL Editor. Безопасно повторять.
-- Что делает:
--   * tasks.complexity и recurrences.complexity — 1 мелочь, 2 средняя, 3 большая, пусто — не выбрана;
--   * задача по повтору без своей сложности получает сложность правила (как название и сфера).
-- Перегруженный день считает приложение: в день 1 большая, 2 средние и до 5 мелочей.
-- =====================================================================

begin;

alter table public.tasks       add column if not exists complexity smallint check (complexity is null or complexity between 1 and 3);
alter table public.recurrences add column if not exists complexity smallint check (complexity is null or complexity between 1 and 3);

create or replace function public.tasks_complexity_on_insert() returns trigger
language plpgsql set search_path = public as $$
begin
  if new.recurrence_id is not null and new.complexity is null then
    select r.complexity into new.complexity from public.recurrences r where r.id = new.recurrence_id;
  end if;
  return new;
end $$;

drop trigger if exists tasks_complexity_on_insert on public.tasks;
create trigger tasks_complexity_on_insert before insert on public.tasks
  for each row execute function public.tasks_complexity_on_insert();

commit;
