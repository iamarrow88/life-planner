-- =====================================================================
-- KolaApp: ежемесячный чек-лист (дополнение к planner_schema.sql)
-- Выполнить один раз в Supabase → SQL Editor. Безопасно повторять.
-- Что делает:
--   * таблица monthly_items — дела, которые нужно сделать раз в месяц, в любой день.
--     done_month — месяц ('2026-11'), когда пункт отмечен: в другом месяце он снова не сделан,
--     поэтому 1-го числа список обнуляется сам, без фоновых заданий.
--     task_id и task_month — задача, созданная из пункта, и месяц, для которого её создали.
--     Удалили задачу — пункт остаётся, связь просто обнуляется.
-- =====================================================================

begin;

create table if not exists public.monthly_items (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid        not null default auth.uid() references auth.users (id) on delete cascade,
  title      text        not null check (length(btrim(title)) between 1 and 300),
  note       text        check (note is null or length(note) <= 4000),
  position   integer     not null default 0,
  done_month text        check (done_month is null or done_month ~ '^\d{4}-\d{2}$'),
  task_id    uuid,
  task_month text        check (task_month is null or task_month ~ '^\d{4}-\d{2}$'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (user_id, task_id) references public.tasks (user_id, id) on delete set null (task_id)
);
create index if not exists monthly_items_user_position on public.monthly_items (user_id, position);

drop trigger if exists monthly_items_updated_at on public.monthly_items;
create trigger monthly_items_updated_at before update on public.monthly_items
  for each row execute function public.set_updated_at();

alter table public.monthly_items enable row level security;
drop policy if exists monthly_items_own on public.monthly_items;
create policy monthly_items_own on public.monthly_items for all to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

revoke all on public.monthly_items from anon;
grant select, insert, update, delete on public.monthly_items to authenticated;

commit;
