-- =====================================================================
-- My life planner: теги задач (дополнение к planner_schema.sql)
-- Выполнить один раз в Supabase → SQL Editor. Безопасно повторять.
-- Что делает:
--   * tasks.tags и recurrences.tags — список тегов (строчными буквами, без «#»), индекс для поиска;
--   * триггер при создании задачи: «#теги» из названия переносятся в теги (так работает и быстрый ввод
--     с часов, и любые другие способы создать задачу), а задача по повтору получает теги правила;
--   * rename_tag(старый, новый) — переименовать тег или слить с существующим; новый = null — удалить тег.
-- =====================================================================

begin;

alter table public.tasks       add column if not exists tags text[] not null default '{}';
alter table public.recurrences add column if not exists tags text[] not null default '{}';
create index if not exists tasks_tags_idx on public.tasks using gin (tags);

-- Тег: строчные буквы (в том числе русские — lower() может не знать кириллицу при локали C), без «#», до 40 символов
create or replace function public.norm_tag(p text) returns text
language sql immutable as $$
  select left(translate(lower(btrim(p, ' #')),
    'АБВГДЕЁЖЗИЙКЛМНОПРСТУФХЦЧШЩЪЫЬЭЮЯ', 'абвгдеёжзийклмнопрстуфхцчшщъыьэюя'), 40)
$$;

create or replace function public.tasks_tags_on_insert() returns trigger
language plpgsql set search_path = public as $$
declare
  v_tags text[];
begin
  -- «Позвонить в банк #звонки» → название «Позвонить в банк», теги {звонки}
  if new.title ~ '(^|\s)#[A-Za-zА-Яа-яЁё]' then
    select coalesce(array_agg(distinct public.norm_tag(m[1])), '{}') into v_tags
      from regexp_matches(new.title, '(?:^|\s)#([A-Za-zА-Яа-яЁё][A-Za-zА-Яа-яЁё0-9_-]*)', 'g') as m;
    new.tags  := array(select distinct x from unnest(coalesce(new.tags, '{}') || v_tags) x order by x);
    new.title := btrim(regexp_replace(regexp_replace(new.title, '(^|\s)#[A-Za-zА-Яа-яЁё][A-Za-zА-Яа-яЁё0-9_-]*', '\1', 'g'), '\s+', ' ', 'g'));
    if new.title = '' then new.title := array_to_string(v_tags, ' '); end if;  -- задача из одних тегов
  end if;
  -- задача по повтору без своих тегов получает теги правила
  if new.recurrence_id is not null and cardinality(coalesce(new.tags, '{}')) = 0 then
    select r.tags into v_tags from public.recurrences r where r.id = new.recurrence_id;
    new.tags := coalesce(v_tags, '{}');
  end if;
  return new;
end $$;

drop trigger if exists tasks_tags_on_insert on public.tasks;
create trigger tasks_tags_on_insert before insert on public.tasks
  for each row execute function public.tasks_tags_on_insert();

-- Переименовать / слить / удалить тег во всех задачах и повторах текущего пользователя
create or replace function public.rename_tag(p_old text, p_new text default null) returns void
language plpgsql set search_path = public as $$
declare
  v_old text := public.norm_tag(p_old);
  v_new text := nullif(public.norm_tag(coalesce(p_new, '')), '');
begin
  update public.tasks t
     set tags = array(select distinct x from unnest(case when v_new is null then array_remove(t.tags, v_old)
                                                         else array_replace(t.tags, v_old, v_new) end) x order by x)
   where t.user_id = auth.uid() and v_old = any(t.tags);
  update public.recurrences r
     set tags = array(select distinct x from unnest(case when v_new is null then array_remove(r.tags, v_old)
                                                         else array_replace(r.tags, v_old, v_new) end) x order by x)
   where r.user_id = auth.uid() and v_old = any(r.tags);
end $$;

revoke all on function public.rename_tag(text, text) from public, anon;
grant execute on function public.rename_tag(text, text) to authenticated;

commit;
