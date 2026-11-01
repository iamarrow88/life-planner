-- =====================================================================
-- My life planner: бюджет задач (дополнение к planner_schema.sql)
-- Выполнить один раз в Supabase → SQL Editor. Безопасно повторять.
-- Что делает:
--   * tasks.budget и recurrences.budget — сумма в рублях (до копеек), пусто — бюджета нет;
--   * задача по повтору без своей суммы получает сумму правила (как название и сфера).
-- Итог за период считает приложение на экране «Сегодня».
-- =====================================================================

begin;

alter table public.tasks       add column if not exists budget numeric(12, 2) check (budget is null or budget >= 0);
alter table public.recurrences add column if not exists budget numeric(12, 2) check (budget is null or budget >= 0);

create or replace function public.tasks_budget_on_insert() returns trigger
language plpgsql set search_path = public as $$
begin
  if new.recurrence_id is not null and new.budget is null then
    select r.budget into new.budget from public.recurrences r where r.id = new.recurrence_id;
  end if;
  return new;
end $$;

drop trigger if exists tasks_budget_on_insert on public.tasks;
create trigger tasks_budget_on_insert before insert on public.tasks
  for each row execute function public.tasks_budget_on_insert();

commit;
