-- =====================================================================
-- KolaApp: «Библиотека» — подробности о книге (дополнение к planner_books.sql)
-- Выполнить один раз в Supabase → SQL Editor. Безопасно повторять.
-- Что делает:
--   * статус dropped — «бросила» (к queue — буду читать, reading — читаю, done — прочитано);
--   * added_on — дата добавления в список; у уже добавленных книг — день создания записи;
--   * published_year — год издания;
--   * genre — жанр (список вариантов — в приложении).
-- Для брошенной книги finished_on — день, когда бросила.
-- =====================================================================

begin;

alter table public.books drop constraint if exists books_status_check;
alter table public.books add constraint books_status_check check (status in ('queue', 'reading', 'done', 'dropped'));

alter table public.books add column if not exists added_on date;
update public.books set added_on = (created_at at time zone public.user_tz(user_id))::date where added_on is null;
alter table public.books alter column added_on set default current_date;
alter table public.books alter column added_on set not null;

alter table public.books add column if not exists published_year smallint;
alter table public.books drop constraint if exists books_published_year_check;
alter table public.books add constraint books_published_year_check check (published_year is null or published_year between 1 and 2100);

alter table public.books add column if not exists genre text;
alter table public.books drop constraint if exists books_genre_check;
alter table public.books add constraint books_genre_check check (genre is null or length(genre) <= 60);

commit;
