-- =====================================================================
-- KolaApp: «Фильмы» — подробности о фильме (дополнение к planner_movies.sql)
-- Выполнить один раз в Supabase → SQL Editor. Безопасно повторять.
-- Что делает:
--   * added_on — дата добавления в список; у уже добавленных фильмов — день создания записи;
--   * genre — жанр (список вариантов — в приложении);
--   * country — страна;
--   * favorite — в избранном.
-- Год выхода, дата просмотра и оценка уже есть (year, watched_on, rating).
-- =====================================================================

begin;

alter table public.movies add column if not exists added_on date;
update public.movies set added_on = (created_at at time zone public.user_tz(user_id))::date where added_on is null;
alter table public.movies alter column added_on set default current_date;
alter table public.movies alter column added_on set not null;

alter table public.movies add column if not exists genre text;
alter table public.movies drop constraint if exists movies_genre_check;
alter table public.movies add constraint movies_genre_check check (genre is null or length(genre) <= 60);

alter table public.movies add column if not exists country text;
alter table public.movies drop constraint if exists movies_country_check;
alter table public.movies add constraint movies_country_check check (country is null or length(country) <= 60);

alter table public.movies add column if not exists favorite boolean not null default false;

commit;
