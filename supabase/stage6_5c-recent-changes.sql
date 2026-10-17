-- Happy Tree Family — Stage 6.5c database update: recent changes with Undo
--
-- HOW TO RUN: Supabase dashboard -> SQL Editor -> New query (+) -> paste this
-- whole file -> Run. Safe to run more than once.
-- Run supabase/stage6_5b-permissions.sql first.
-- If Supabase shows a "creates a table without Row Level Security" popup, it is
-- a false alarm (the file switches it on itself): choose "Run without RLS".
-- When it finishes, the Results box shows a short checklist — every line
-- should say "yes".
--
-- WHY: people can change their own immediate family freely (Stage 6.5b), so a
-- spiteful or mistaken edit there needs a way back. From now on the database
-- writes down every change to people, links, stories, grave directions and
-- their steps — who did it, when, and what it was before — and family admins
-- can undo any of them from the app's "Recent changes" screen.
-- Changes made before this file is run are not in the list.

-- ------------------------------------------------------------
-- 1. The list of changes
-- ------------------------------------------------------------
create table if not exists public.change_log (
  id               bigserial primary key,
  family_id        uuid not null references public.families(id) on delete cascade,
  person_id        uuid,               -- whose page it belongs to (no link: the person may be deleted)
  table_name       text not null,      -- persons | person_relationships | biographies | graves | route_steps
  row_key          text not null,      -- the row's id (biographies: its person_id)
  action           text not null check (action in ('insert', 'update', 'delete')),
  old_row          jsonb,              -- before (update / delete)
  new_row          jsonb,              -- after (insert / update)
  changed_fields   text[],             -- update only
  changed_by       uuid,               -- null = made directly in the database
  changed_by_name  text,
  changed_at       timestamptz not null default now(),
  batch            bigint not null,    -- one save in the app = one batch (e.g. a person and everything deleted with them)
  via_undo         boolean not null default false,  -- written BY an undo (hidden in the app)
  undone_at        timestamptz,
  undone_by        uuid,
  undone_by_name   text
);
create index if not exists idx_change_log_family on public.change_log(family_id, id desc);
create index if not exists idx_change_log_row on public.change_log(table_name, row_key);

alter table public.change_log enable row level security;
drop policy if exists htf_change_log_select on public.change_log;
create policy htf_change_log_select on public.change_log for select
  using (public.htf_is_admin(family_id));
grant select on public.change_log to authenticated;
-- nobody writes to it directly: only the triggers and undo_change_batch below

-- ------------------------------------------------------------
-- 2. Writing changes down
-- ------------------------------------------------------------
-- When a person (or a grave) is deleted, the things attached to them are
-- deleted straight after, by which time the person is already gone. This
-- remembers, for the rest of that save, which family and person it was.
create or replace function public.htf_remember_deleting() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if tg_table_name = 'persons' then
    perform set_config('htf.deleting_family', old.family_id::text, true);
    perform set_config('htf.deleting_person', old.id::text, true);
  else
    perform set_config('htf.deleting_person', old.person_id::text, true);
    perform set_config('htf.deleting_family', (select family_id::text from persons where id = old.person_id), true);
  end if;
  return old;
end $$;

create or replace function public.htf_log_change() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  old_j jsonb := case when tg_op <> 'INSERT' then to_jsonb(old) end;
  new_j jsonb := case when tg_op <> 'DELETE' then to_jsonb(new) end;
  row_j jsonb;
  key_col text := case when tg_table_name = 'biographies' then 'person_id' else 'id' end;
  changed text[];
  pid uuid;
  fid uuid;
begin
  row_j := coalesce(new_j, old_j);

  -- for an update, only the fields that really changed (housekeeping fields,
  -- account links and step re-ordering are left out)
  if tg_op = 'UPDATE' then
    select array_agg(k order by k) into changed
    from jsonb_object_keys(new_j) k
    where k not in ('updated_at', 'updated_by', 'created_at', 'linked_user_id', 'step_order')
      and new_j -> k is distinct from old_j -> k;
    if changed is null then return null; end if;
  end if;

  -- whose page this is, and which family
  if tg_table_name = 'persons' then
    pid := (row_j ->> 'id')::uuid;
    fid := (row_j ->> 'family_id')::uuid;
  elsif tg_table_name = 'route_steps' then
    select g.person_id into pid from graves g where g.id = (row_j ->> 'grave_id')::uuid;
  else
    pid := (row_j ->> 'person_id')::uuid;
  end if;
  if pid is null then pid := nullif(current_setting('htf.deleting_person', true), '')::uuid; end if;
  if fid is null and pid is not null then select family_id into fid from persons where id = pid; end if;
  if fid is null then fid := nullif(current_setting('htf.deleting_family', true), '')::uuid; end if;
  if fid is null then return null; end if;

  insert into change_log (family_id, person_id, table_name, row_key, action, old_row, new_row, changed_fields,
                          changed_by, changed_by_name, batch, via_undo)
  values (fid, pid, tg_table_name, row_j ->> key_col, lower(tg_op), old_j, new_j, changed,
          auth.uid(), (select display_name from users where id = auth.uid()), txid_current(),
          coalesce(current_setting('htf.undoing', true), '') = '1');
  return null;
end $$;

do $$
declare t text;
begin
  foreach t in array array['persons', 'person_relationships', 'biographies', 'graves', 'route_steps'] loop
    execute format('drop trigger if exists htf_log on public.%I', t);
    execute format('create trigger htf_log after insert or update or delete on public.%I
                    for each row execute function public.htf_log_change()', t);
  end loop;
  foreach t in array array['persons', 'graves'] loop
    execute format('drop trigger if exists htf_remember_deleting on public.%I', t);
    execute format('create trigger htf_remember_deleting before delete on public.%I
                    for each row execute function public.htf_remember_deleting()', t);
  end loop;
end $$;

-- ------------------------------------------------------------
-- 3. Undo (family admins only). Undoes one whole save:
--   added    -> removed again (a person: with everything added to them since)
--   changed  -> the changed fields go back to what they were
--   deleted  -> put back, with everything that was deleted along with it
-- Refused when something newer changed the same thing — undo that first.
-- ------------------------------------------------------------
create or replace function public.undo_change_batch(p_family_id uuid, p_batch bigint) returns void
language plpgsql security definer set search_path = public as $$
declare
  e record;
  key_col text;
  cols text;
begin
  if not public.htf_is_admin(p_family_id) then raise exception 'Only a family admin can undo changes.'; end if;
  if not exists (select 1 from change_log where family_id = p_family_id and batch = p_batch
                 and undone_at is null and not via_undo) then
    raise exception 'This change has already been undone.';
  end if;
  if exists (
    select 1 from change_log a
    join change_log b on b.table_name = a.table_name and b.row_key = a.row_key
    where a.family_id = p_family_id and a.batch = p_batch and a.action in ('update', 'delete')
      and b.batch <> p_batch and b.id > a.id and b.undone_at is null and not b.via_undo
  ) then
    raise exception 'Something newer changed the same thing. Undo the newer change first.';
  end if;

  -- whatever this writes is marked via_undo, so it doesn't fill the list
  perform set_config('htf.undoing', '1', true);

  -- added -> remove (newest first)
  for e in select * from change_log where family_id = p_family_id and batch = p_batch
             and action = 'insert' and undone_at is null and not via_undo order by id desc loop
    key_col := case when e.table_name = 'biographies' then 'person_id' else 'id' end;
    execute format('delete from public.%I where %I = $1::uuid', e.table_name, key_col) using e.row_key;
  end loop;

  -- changed -> put the changed fields back (newest first)
  for e in select * from change_log where family_id = p_family_id and batch = p_batch
             and action = 'update' and undone_at is null and not via_undo order by id desc loop
    key_col := case when e.table_name = 'biographies' then 'person_id' else 'id' end;
    select string_agg(format('%I = r.%I', c, c), ', ') into cols from unnest(e.changed_fields) c;
    execute format('update public.%I t set %s from jsonb_populate_record(null::public.%I, $1) r where t.%I = $2::uuid',
                   e.table_name, cols, e.table_name, key_col)
      using e.old_row, e.row_key;
  end loop;

  -- deleted -> put back (people first, then what hangs off them)
  for e in select * from change_log where family_id = p_family_id and batch = p_batch
             and action = 'delete' and undone_at is null and not via_undo
           order by case table_name when 'persons' then 1 when 'graves' then 2 when 'biographies' then 3
                                    when 'route_steps' then 4 else 5 end, id loop
    begin
      execute format('insert into public.%I select * from jsonb_populate_record(null::public.%I, $1) on conflict do nothing',
                     e.table_name, e.table_name)
        using e.old_row;
    exception when foreign_key_violation then
      -- a link to someone who has since been deleted too: leave that one out
      if e.table_name <> 'person_relationships' then raise; end if;
    end;
  end loop;

  update change_log
    set undone_at = now(), undone_by = auth.uid(),
        undone_by_name = (select display_name from users where id = auth.uid())
    where family_id = p_family_id and batch = p_batch and undone_at is null and not via_undo;
end $$;

revoke execute on function public.undo_change_batch(uuid, bigint) from public, anon;
grant execute on function public.undo_change_batch(uuid, bigint) to authenticated;

-- ------------------------------------------------------------
-- 4. Checklist — every line should say "yes"
-- ------------------------------------------------------------
select 'Changes are being written down' as "check",
       case when (select count(*) from pg_trigger where tgname = 'htf_log' and not tgisinternal) = 5
            then 'yes' else 'NO - tell Claude' end as "ok?"
union all
select 'Only admins can read the list',
       case when exists (select 1 from pg_policies where tablename = 'change_log' and policyname = 'htf_change_log_select')
            then 'yes' else 'NO - tell Claude' end
union all
select 'Undo is ready',
       case when exists (select 1 from pg_proc where proname = 'undo_change_batch') then 'yes' else 'NO - tell Claude' end;
