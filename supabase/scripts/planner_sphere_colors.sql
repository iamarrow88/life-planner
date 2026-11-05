-- =====================================================================
-- KolaApp: свой набор цветов для сфер (дополнение к planner_schema.sql)
-- Выполнить один раз в Supabase → SQL Editor. Безопасно повторять.
-- Что делает:
--   * user_settings.sphere_colors — цвета, которые предлагаются при создании и редактировании сферы,
--     по порядку, в формате #RRGGBB. Пусто — набор по умолчанию. Набор общий для сайта и телефона.
-- =====================================================================

begin;

alter table public.user_settings add column if not exists sphere_colors text[];

alter table public.user_settings drop constraint if exists user_settings_sphere_colors_check;
alter table public.user_settings add constraint user_settings_sphere_colors_check check (
  sphere_colors is null or (
    cardinality(sphere_colors) between 1 and 48
    and array_to_string(sphere_colors, ' ') ~ '^#[0-9A-Fa-f]{6}( #[0-9A-Fa-f]{6})*$'
  )
);

commit;
