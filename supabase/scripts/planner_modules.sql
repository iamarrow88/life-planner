-- =====================================================================
-- KolaApp: модули, которые можно выключить во «Ещё» (дополнение к planner_schema.sql)
-- Выполнить один раз в Supabase → SQL Editor. Безопасно повторять.
-- Что делает:
--   * user_settings.hidden_modules — список ВЫКЛЮЧЕННЫХ модулей (budget, complexity, cycle, books,
--     movies, wishes, shopping, monthly). Пусто — включено всё. Выбор общий для сайта и телефона.
--     Данные выключенных модулей не удаляются.
-- =====================================================================

begin;

alter table public.user_settings add column if not exists hidden_modules text[] not null default '{}';

alter table public.user_settings drop constraint if exists user_settings_hidden_modules_check;
alter table public.user_settings add constraint user_settings_hidden_modules_check check (cardinality(hidden_modules) <= 32);

commit;
