-- =====================================================================
-- KolaApp: «Библиотека» (дополнение к planner_schema.sql)
-- Выполнить один раз в Supabase → SQL Editor. Безопасно повторять.
-- Что делает:
--   * таблица books — книги: название, автор, статус (queue — в очереди, reading — читаю, done — прочитано),
--     место в очереди, страницы всего и текущая страница, даты начала и конца чтения, оценка 1–5,
--     заметки: [{ "id": "…", "at": "…", "page": 12, "text": "…" }].
-- =====================================================================

begin;

create table if not exists public.books (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid        not null default auth.uid() references auth.users (id) on delete cascade,
  title        text        not null check (length(btrim(title)) between 1 and 300),
  author       text        check (author is null or length(author) <= 200),
  status       text        not null default 'queue' check (status in ('queue', 'reading', 'done')),
  position     integer     not null default 0,
  total_pages  integer     check (total_pages is null or total_pages > 0),
  current_page integer     not null default 0 check (current_page >= 0),
  started_on   date,
  finished_on  date,
  rating       smallint    check (rating is null or rating between 1 and 5),
  notes        jsonb       not null default '[]'::jsonb,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);
create index if not exists books_user_position on public.books (user_id, position);

drop trigger if exists books_updated_at on public.books;
create trigger books_updated_at before update on public.books
  for each row execute function public.set_updated_at();

alter table public.books enable row level security;
drop policy if exists books_own on public.books;
create policy books_own on public.books for all to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

revoke all on public.books from anon;
grant select, insert, update, delete on public.books to authenticated;

commit;
