-- =====================================================================
-- KolaApp: сфера → проект другой сферы (дополнение к planner_schema.sql)
-- Выполнить один раз в Supabase → SQL Editor. Безопасно повторять.
-- Что делает:
--   * projects_propagate_sphere: проект перенесли в другую сферу — его задачи, повторы и привычки
--     (а через них и учтённое время) переезжают следом. Раньше они оставались в старой сфере;
--   * sphere_to_project(p_sphere, p_target): сфера становится проектом в сфере p_target.
--     Задачи, повторы и привычки сферы без проекта попадают в новый проект с именем сферы,
--     проекты сферы становятся проектами p_target (после нового), время по сфере — тоже в новый проект.
--     Главная сфера итогов недели и сфера календаря цикла меняются на p_target, сама сфера удаляется
--     (её цели по неделям — вместе с ней). Всё в одной транзакции: либо целиком, либо ничего.
--     Возвращает id нового проекта.
-- =====================================================================

begin;

create or replace function public.projects_propagate_sphere() returns trigger
language plpgsql set search_path = public as $$
begin
  update public.tasks       set sphere_id = new.sphere_id where project_id = new.id and user_id = new.user_id and sphere_id is distinct from new.sphere_id;
  update public.recurrences set sphere_id = new.sphere_id where project_id = new.id and user_id = new.user_id and sphere_id is distinct from new.sphere_id;
  update public.habits      set sphere_id = new.sphere_id where project_id = new.id and user_id = new.user_id and sphere_id is distinct from new.sphere_id;
  -- время без задачи и привычки (таймер на проект): у остального сферу поправят триггеры задач и привычек
  update public.time_entries set sphere_id = new.sphere_id
   where project_id = new.id and user_id = new.user_id and task_id is null and habit_id is null and sphere_id is distinct from new.sphere_id;
  return null;
end $$;

drop trigger if exists projects_propagate_sphere on public.projects;
create trigger projects_propagate_sphere after update of sphere_id on public.projects
  for each row when (old.sphere_id is distinct from new.sphere_id) execute function public.projects_propagate_sphere();

create or replace function public.sphere_to_project(p_sphere uuid, p_target uuid) returns uuid
language plpgsql set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  v_name text;
  v_pos integer;
  v_project uuid;
begin
  if p_sphere = p_target then raise exception 'Сферу нельзя сделать проектом её самой'; end if;
  select s.name into v_name from public.spheres s where s.id = p_sphere and s.user_id = v_uid;
  if not found then raise exception 'Сфера не найдена'; end if;
  perform 1 from public.spheres s where s.id = p_target and s.user_id = v_uid and s.archived_at is null;
  if not found then raise exception 'Сфера, в которую переносим, не найдена'; end if;

  -- новый проект — в конец списка проектов p_target, следом за ним — проекты бывшей сферы
  select coalesce(max(p.position), -1) + 1 into v_pos from public.projects p where p.sphere_id = p_target and p.user_id = v_uid;
  insert into public.projects (user_id, sphere_id, name, position) values (v_uid, p_target, v_name, v_pos) returning id into v_project;
  update public.projects set sphere_id = p_target, position = v_pos + 1 + position
   where sphere_id = p_sphere and user_id = v_uid;          -- их задачи и привычки переедут триггером выше

  -- всё, что лежало в сфере без проекта, — в новый проект
  update public.tasks       set project_id = v_project, sphere_id = p_target where sphere_id = p_sphere and project_id is null and user_id = v_uid;
  update public.recurrences set project_id = v_project, sphere_id = p_target where sphere_id = p_sphere and project_id is null and user_id = v_uid;
  update public.habits      set project_id = v_project, sphere_id = p_target where sphere_id = p_sphere and project_id is null and user_id = v_uid;
  -- таймер на саму сферу и время по удалённым задачам
  update public.time_entries set sphere_id = p_target, project_id = coalesce(project_id, v_project)
   where sphere_id = p_sphere and user_id = v_uid and task_id is null and habit_id is null;

  update public.weekly_reviews set focus_sphere_id = p_target where focus_sphere_id = p_sphere and user_id = v_uid;
  if to_regclass('public.cycle_settings') is not null then
    execute 'update public.cycle_settings set sphere_id = $1 where sphere_id = $2 and user_id = $3' using p_target, p_sphere, v_uid;
  end if;

  delete from public.spheres where id = p_sphere and user_id = v_uid;
  return v_project;
end $$;

revoke all on function public.sphere_to_project(uuid, uuid) from public, anon;
grant execute on function public.sphere_to_project(uuid, uuid) to authenticated;

commit;
