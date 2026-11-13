-- =====================================================================
-- KolaApp: дневник (дополнение к planner_schema.sql)
-- Выполнить один раз в Supabase → SQL Editor. Безопасно повторять.
-- Что делает:
--   * таблица journal_entries — запись за день: текст, настроение 1–5 и ♥ «важный день».
--     Одна запись на день. В JSON-экспорт и восстановление дневник добавляет само приложение.
-- =====================================================================

begin;

create table if not exists public.journal_entries (
  user_id    uuid        not null default auth.uid() references auth.users (id) on delete cascade,
  day        date        not null,
  text       text        check (text is null or length(text) <= 20000),
  mood       smallint    check (mood is null or mood between 1 and 5),
  favorite   boolean     not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (user_id, day)
);

drop trigger if exists journal_entries_updated_at on public.journal_entries;
create trigger journal_entries_updated_at before update on public.journal_entries
  for each row execute function public.set_updated_at();

alter table public.journal_entries enable row level security;
drop policy if exists journal_entries_own on public.journal_entries;
create policy journal_entries_own on public.journal_entries for all to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

revoke all on public.journal_entries from anon;
grant select, insert, update, delete on public.journal_entries to authenticated;

commit;
