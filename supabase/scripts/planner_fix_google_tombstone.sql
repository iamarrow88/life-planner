-- =====================================================================
-- KolaApp: исправление удаления задач, связанных с Google Календарём
-- Выполнить один раз в Supabase → SQL Editor. Безопасно повторять.
-- Что делает:
--   * при удалении такой задачи база записывает пометку «удалить событие в Google» в google_tombstones.
--     Пользователям доступа к этой таблице нет, поэтому триггер падал с «permission denied» и задача не удалялась.
--     Теперь он работает с правами владельца базы и пишет только эту пометку.
--   * если база восстановлена из planner_full_schema.sql до этого исправления, у колонки id
--     не было автонумерации, и пометка не записывалась бы. Возвращает автонумерацию.
-- =====================================================================

create or replace function public.tasks_google_tombstone() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if old.google_event_id is not null and not public.is_service_role() then
    insert into public.google_tombstones (user_id, event_id, calendar_id) values (old.user_id, old.google_event_id, old.google_calendar_id);
  end if;
  return old;
end $$;

do $$
begin
  if not exists (select 1 from pg_attribute where attrelid = 'public.google_tombstones'::regclass and attname = 'id' and attidentity <> '') then
    alter table public.google_tombstones alter column id add generated always as identity;
    perform setval(pg_get_serial_sequence('public.google_tombstones', 'id'), coalesce((select max(id) from public.google_tombstones), 0) + 1, false);
  end if;
end $$;

-- вызывать её напрямую не нужно никому: она работает только как триггер
revoke all on function public.tasks_google_tombstone() from public, anon, authenticated;
