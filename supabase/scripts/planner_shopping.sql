-- =====================================================================
-- KolaApp: «Список покупок» (дополнение к planner_schema.sql)
-- Выполнить один раз в Supabase → SQL Editor. Безопасно повторять.
-- Что делает:
--   * таблица shopping_items — пункты списка, добавленные вручную: название, заметка, место в списке,
--     done_at — когда куплено (null — ещё купить);
--   * user_settings.shopping_tag — тег задач, которые тоже показываются в списке
--     (null — «покупки», пустая строка — задачи в список не попадают).
-- После него перевыполни planner_import.sql, чтобы восстановление из файла знало о покупках.
-- =====================================================================

begin;

create table if not exists public.shopping_items (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid        not null default auth.uid() references auth.users (id) on delete cascade,
  title        text        not null check (length(btrim(title)) between 1 and 300),
  note         text        check (note is null or length(note) <= 4000),
  position     integer     not null default 0,
  done_at      timestamptz,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);
create index if not exists shopping_items_user_position on public.shopping_items (user_id, position);

drop trigger if exists shopping_items_updated_at on public.shopping_items;
create trigger shopping_items_updated_at before update on public.shopping_items
  for each row execute function public.set_updated_at();

alter table public.shopping_items enable row level security;
drop policy if exists shopping_items_own on public.shopping_items;
create policy shopping_items_own on public.shopping_items for all to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

revoke all on public.shopping_items from anon;
grant select, insert, update, delete on public.shopping_items to authenticated;

alter table public.user_settings add column if not exists shopping_tag text;
alter table public.user_settings drop constraint if exists user_settings_shopping_tag_check;
alter table public.user_settings add constraint user_settings_shopping_tag_check check (shopping_tag is null or length(shopping_tag) <= 50);

commit;
