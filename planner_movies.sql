-- =====================================================================
-- KolaApp: «Фильмы» (дополнение к planner_schema.sql)
-- Выполнить один раз в Supabase → SQL Editor. Безопасно повторять.
-- Что делает:
--   * таблица movies — фильмы: название, режиссёр, год, статус (queue — хочу посмотреть, watched — посмотрено),
--     место в списке, дата просмотра, оценка 1–5, заметки: [{ "id": "…", "at": "…", "text": "…" }].
-- =====================================================================

begin;

create table if not exists public.movies (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid        not null default auth.uid() references auth.users (id) on delete cascade,
  title        text        not null check (length(btrim(title)) between 1 and 300),
  director     text        check (director is null or length(director) <= 200),
  year         smallint    check (year is null or year between 1880 and 2100),
  status       text        not null default 'queue' check (status in ('queue', 'watched')),
  position     integer     not null default 0,
  watched_on   date,
  rating       smallint    check (rating is null or rating between 1 and 5),
  notes        jsonb       not null default '[]'::jsonb,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);
create index if not exists movies_user_position on public.movies (user_id, position);

drop trigger if exists movies_updated_at on public.movies;
create trigger movies_updated_at before update on public.movies
  for each row execute function public.set_updated_at();

alter table public.movies enable row level security;
drop policy if exists movies_own on public.movies;
create policy movies_own on public.movies for all to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

revoke all on public.movies from anon;
grant select, insert, update, delete on public.movies to authenticated;

commit;
