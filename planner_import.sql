-- =====================================================================
-- KolaApp: восстановление из JSON-файла экспорта (дополнение к planner_schema.sql)
-- Выполнить один раз в Supabase → SQL Editor. Безопасно повторять. Выполнять после остальных файлов.
-- Что делает:
--   * import_all(файл) — добавляет записи из файла и заменяет записи с теми же id. Всё или ничего: при ошибке база не меняется;
--   * ничего не удаляет, кроме двух случаев, когда файл иначе не загрузить:
--     незавершённая копия задачи по тому же повтору и дню без записанного времени и курс таблеток на тот же цикл;
--   * записи всегда привязываются к вошедшему пользователю, поэтому файл подходит и для нового аккаунта;
--   * поля, которых нет в файле, получают значения по умолчанию, а незнакомые поля пропускаются и попадают в отчёт;
--   * не восстанавливает запущенный таймер и ссылки на события Google Календаря.
-- Возвращает отчёт: сколько записей по таблицам, что пропущено.
-- =====================================================================

begin;

create or replace function public.import_all(p_data jsonb) returns jsonb
language plpgsql set search_path = public as $$
declare
  v_uid     uuid := auth.uid();
  v_data    jsonb := p_data;
  v_counts  jsonb := '{}'::jsonb;
  v_skipped text[] := '{}';
  v_dropped text[] := '{}';
  v_merged  integer := 0;
  v_no_rule integer := 0;
  -- ключ в файле, таблица, уникальный ключ, поля, которые не берём из файла. Порядок важен: сначала то, на что ссылаются
  v_specs   text[][] := array[
    ['settings',       'user_settings',     'user_id',           ''],
    ['spheres',        'spheres',           'id',                ''],
    ['projects',       'projects',          'id',                ''],
    ['recurrences',    'recurrences',       'id',                ''],
    ['habits',         'habits',            'id',                ''],
    ['tasks',          'tasks',             'id',                'google_event_id,google_etag,google_dirty'],
    ['habit_entries',  'habit_entries',     'habit_id,entry_date', 'id'],
    ['time_entries',   'time_entries',      'id',                ''],
    ['week_goals',     'sphere_week_goals', 'sphere_id,week_start', ''],
    ['weekly_reviews', 'weekly_reviews',    'user_id,week_start', 'id'],
    ['week_work',      'week_work',         'user_id,week_start', ''],
    ['wishes',         'wishes',            'id',                ''],
    ['books',          'books',             'id',                ''],
    ['movies',         'movies',            'id',                ''],
    ['monthly_items',  'monthly_items',     'id',                ''],
    ['pill_courses',   'pill_courses',      'id',                ''],
    ['cycle_days',     'cycle_days',        'user_id,day',       ''],
    ['cycle_settings', 'cycle_settings',    'user_id',           '']
  ];
  v_spec    text[];
  v_rows    jsonb;
  v_cols    text[];
  v_conf    text[];
  v_excl    text[];
  v_sets    text;
  v_n       integer;
  v_id      uuid;
  v_sphere  record;
begin
  if v_uid is null then
    raise exception 'Нужно войти в аккаунт';
  end if;
  if jsonb_typeof(p_data) is distinct from 'object' or not p_data ? 'exported_at' or jsonb_typeof(p_data -> 'tasks') is distinct from 'array' then
    raise exception 'Это не файл экспорта KolaApp';
  end if;

  -- Имя действующей сферы уникально: сфера из файла с именем уже существующей становится ею, и все ссылки переходят на неё
  for v_sphere in
    select e ->> 'id' as id, e ->> 'name' as name
    from jsonb_array_elements(coalesce(p_data -> 'spheres', '[]'::jsonb)) e
    where e ->> 'archived_at' is null
  loop
    select s.id into v_id from public.spheres s
    where s.user_id = v_uid and s.archived_at is null and lower(s.name) = lower(v_sphere.name) and s.id::text <> v_sphere.id;
    if found then
      v_data := replace(v_data::text, v_sphere.id, v_id::text)::jsonb;
      v_merged := v_merged + 1;
    end if;
  end loop;

  -- Задача по повтору на тот же день уникальна: убираем незавершённую копию без времени, которая мешает записи из файла
  delete from public.tasks x
  using jsonb_array_elements(v_data -> 'tasks') e
  where x.user_id = v_uid
    and x.recurrence_id = (e ->> 'recurrence_id')::uuid
    and x.due_date = (e ->> 'due_date')::date
    and x.id <> (e ->> 'id')::uuid
    and x.status <> 'done'
    and not exists (select 1 from public.time_entries te where te.task_id = x.id);

  -- Один курс таблеток на цикл: запись из файла заменяет курс, созданный заново
  if to_regclass('public.pill_courses') is not null then
    delete from public.pill_courses x
    using jsonb_array_elements(coalesce(v_data -> 'pill_courses', '[]'::jsonb)) e
    where x.user_id = v_uid and x.cycle_start = (e ->> 'cycle_start')::date and x.id <> (e ->> 'id')::uuid;
  end if;

  foreach v_spec slice 1 in array v_specs loop
    v_rows := coalesce(v_data -> v_spec[1], '[]'::jsonb);
    -- настройки цикла экспорт пишет одним объектом, а не списком
    if v_spec[1] = 'cycle_settings' and jsonb_typeof(v_rows) = 'object' then
      v_rows := jsonb_build_array(v_rows);
    end if;
    if jsonb_typeof(v_rows) <> 'array' then
      raise exception 'В файле повреждён раздел %', v_spec[1];
    end if;
    if v_spec[1] = 'settings' and jsonb_array_length(v_rows) > 1 then
      v_rows := jsonb_build_array(v_rows -> 0);
    elsif v_spec[1] = 'time_entries' then
      -- запущенный таймер из прошлого не должен «идти» до сих пор
      select coalesce(jsonb_agg(e), '[]'::jsonb) into v_rows from jsonb_array_elements(v_rows) e where e ->> 'ended_at' is not null;
    elsif v_spec[1] = 'tasks' then
      -- связь с повтором ставим отдельным шагом: иначе база создаст лишние следующие задачи и заполнит поля из правила
      select coalesce(jsonb_agg(e || '{"recurrence_id": null}'::jsonb), '[]'::jsonb) into v_rows from jsonb_array_elements(v_rows) e;
    end if;
    continue when jsonb_array_length(v_rows) = 0;

    if to_regclass('public.' || v_spec[2]) is null then
      v_skipped := v_skipped || v_spec[2];
      continue;
    end if;

    v_conf := string_to_array(v_spec[3], ',');
    v_excl := coalesce(string_to_array(nullif(v_spec[4], ''), ','), '{}') || array['user_id', 'duration_seconds'];
    -- Берём только поля, которые есть и в файле, и в таблице
    select coalesce(array_agg(k order by k), '{}') into v_cols
    from (select distinct k from jsonb_array_elements(v_rows) e, jsonb_object_keys(e) k) keys
    where k <> all (v_excl)
      and exists (select 1 from pg_attribute a
                  where a.attrelid = ('public.' || v_spec[2])::regclass and a.attname = k
                    and a.attnum > 0 and not a.attisdropped and a.attgenerated = '');
    select v_dropped || coalesce(array_agg(v_spec[2] || '.' || k order by k), '{}') into v_dropped
    from (select distinct k from jsonb_array_elements(v_rows) e, jsonb_object_keys(e) k) keys
    where k <> all (v_excl) and k <> all (v_cols);
    continue when cardinality(v_cols) = 0;

    select string_agg(format('%I = excluded.%I', c, c), ', ') into v_sets
    from unnest(v_cols) c where c <> all (v_conf);

    execute format(
      'insert into public.%I (user_id, %s) select $1, %s from jsonb_populate_recordset(null::public.%I, $2) r on conflict (%s) %s',
      v_spec[2],
      (select string_agg(format('%I', c), ', ') from unnest(v_cols) c),
      (select string_agg(format('r.%I', c), ', ') from unnest(v_cols) c),
      v_spec[2],
      (select string_agg(format('%I', c), ', ') from unnest(v_conf) c),
      case when v_sets is null then 'do nothing' else 'do update set ' || v_sets end
    ) using v_uid, v_rows;
    get diagnostics v_n = row_count;
    v_counts := v_counts || jsonb_build_object(v_spec[2], v_n);
  end loop;

  -- Связь задач с повторами. Если на этот день уже есть выполненная задача по тому же повтору, запись из файла остаётся без связи
  update public.tasks t
     set recurrence_id = (e ->> 'recurrence_id')::uuid
    from jsonb_array_elements(v_data -> 'tasks') e
   where t.id = (e ->> 'id')::uuid
     and t.user_id = v_uid
     and e ->> 'recurrence_id' is not null
     and t.recurrence_id is distinct from (e ->> 'recurrence_id')::uuid
     and not exists (select 1 from public.tasks x
                     where x.recurrence_id = (e ->> 'recurrence_id')::uuid and x.due_date = t.due_date and x.id <> t.id);
  select count(*) into v_no_rule
    from jsonb_array_elements(v_data -> 'tasks') e
    join public.tasks t on t.id = (e ->> 'id')::uuid
   where e ->> 'recurrence_id' is not null and t.recurrence_id is null;

  return jsonb_build_object('counts', v_counts, 'skipped_tables', to_jsonb(v_skipped), 'dropped_columns', to_jsonb(v_dropped),
                            'merged_spheres', v_merged, 'tasks_without_rule', v_no_rule);
end $$;

revoke all on function public.import_all(jsonb) from public, anon;
grant execute on function public.import_all(jsonb) to authenticated;

commit;
