-- =====================================================================
-- KolaApp: «Мои желания» (дополнение к planner_schema.sql)
-- Выполнить один раз в Supabase → SQL Editor. Безопасно повторять.
-- Что делает:
--   * таблица wishes — желания: название, заметка, ссылка, примерная цена, категория (свободный текст),
--     место в списке, когда исполнилось (fulfilled_at), задача, созданная из желания (task_id).
--     Удалили задачу — желание остаётся, связь просто обнуляется.
-- =====================================================================

begin;

create table if not exists public.wishes (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid        not null default auth.uid() references auth.users (id) on delete cascade,
  title        text        not null check (length(btrim(title)) between 1 and 300),
  note         text        check (note is null or length(note) <= 4000),
  url          text        check (url is null or (url ~* '^https?://' and length(url) <= 2000)),
  price        numeric(12,2) check (price is null or price >= 0),
  category     text        check (category is null or length(btrim(category)) between 1 and 60),
  position     integer     not null default 0,
  fulfilled_at timestamptz,
  task_id      uuid,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  foreign key (user_id, task_id) references public.tasks (user_id, id) on delete set null (task_id)
);
create index if not exists wishes_user_position on public.wishes (user_id, position);

drop trigger if exists wishes_updated_at on public.wishes;
create trigger wishes_updated_at before update on public.wishes
  for each row execute function public.set_updated_at();

alter table public.wishes enable row level security;
drop policy if exists wishes_own on public.wishes;
create policy wishes_own on public.wishes for all to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

revoke all on public.wishes from anon;
grant select, insert, update, delete on public.wishes to authenticated;

commit;
