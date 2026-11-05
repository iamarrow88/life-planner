-- =====================================================================
-- KolaApp: приоритет задачи (дополнение к planner_schema.sql)
-- Выполнить один раз в Supabase → SQL Editor. Безопасно повторять.
-- Что делает:
--   * tasks.priority — 1 высокий (красный), 2 средний (оранжевый), 3 низкий (жёлтый), пусто — без приоритета.
-- =====================================================================

alter table public.tasks add column if not exists priority smallint check (priority is null or priority between 1 and 3);
