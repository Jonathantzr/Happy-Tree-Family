-- Happy Tree Family — Stage 6.5b database update: permissions and admins
--
-- HOW TO RUN: Supabase dashboard -> SQL Editor -> New query (+) -> paste this
-- whole file -> Run. Safe to run more than once.
-- Run the earlier files first (stage5b, stage5f, stage6, stage6c, stage6_5a).
-- If Supabase shows a "creates a table without Row Level Security" popup, it is
-- a false alarm (the file switches it on itself): choose "Run without RLS".
-- When it finishes, the Results box shows a short checklist — every line
-- should say "yes".
--
-- WHY: until now any member of a family could change or delete anything in it.
-- Someone who only has the join code could wipe or deface the whole tree.
--
-- THE RULES AFTER THIS FILE
--   Your circle = you, your husband/wife, parents, children, brothers, sisters.
--   - Anyone in the family can ADD a person, and can write the first story or
--     the first grave directions for someone who has none yet.
--   - You can CHANGE: people in your circle, and anything you added yourself
--     (a person you added, a story you started, directions you wrote).
--   - Everything else: you send a request and an admin approves it.
--   - Only admins delete people, edit the Name book and make QR codes.
--   - Each family has ONE owner (whoever created it). Only the owner can make
--     or remove admins, remove a member, or hand the family on to someone else.
--   - A removed member cannot come back with the join code unless the owner
--     lets them back in.

-- ------------------------------------------------------------
-- 1. New columns: who owns a family, and who added what
-- ------------------------------------------------------------
alter table public.families add column if not exists owner_id uuid references public.users(id) on delete set null;

alter table public.persons add column if not exists created_by uuid;
alter table public.persons alter column created_by set default auth.uid();

alter table public.biographies add column if not exists created_by uuid;
alter table public.biographies alter column created_by set default auth.uid();

alter table public.graves add column if not exists created_by uuid;
alter table public.graves alter column created_by set default auth.uid();

-- Existing families: the owner is whoever created it (if they are still a
-- member), otherwise one of its admins.
update public.families f set owner_id = coalesce(
    (select fm.user_id from public.family_members fm where fm.family_id = f.id and fm.user_id = f.created_by limit 1),
    (select fm.user_id from public.family_members fm where fm.family_id = f.id order by (fm.role = 'admin') desc limit 1)
  )
  where f.owner_id is null;

-- the owner is always an admin as well
update public.family_members fm set role = 'admin'
  from public.families f
  where f.id = fm.family_id and f.owner_id = fm.user_id and fm.role <> 'admin';

-- A new family's owner is always the person creating it, and nobody but the
-- owner can pass the family on (admins can still rename it etc.).
create or replace function public.htf_guard_family_owner() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' then
    if auth.uid() is not null then new.owner_id := auth.uid(); end if;
  elsif new.owner_id is distinct from old.owner_id
        and auth.uid() is not null and old.owner_id is not null and auth.uid() <> old.owner_id then
    raise exception 'Only the family owner can hand the family on.';
  end if;
  return new;
end $$;

drop trigger if exists htf_family_owner_guard on public.families;
create trigger htf_family_owner_guard before insert or update on public.families
  for each row execute function public.htf_guard_family_owner();

-- People the owner removed (so the join code no longer works for them)
create table if not exists public.family_blocks (
  family_id     uuid not null references public.families(id) on delete cascade,
  user_id       uuid not null references public.users(id) on delete cascade,
  display_name  text,                       -- kept so the owner can still see who it was
  removed_at    timestamptz not null default now(),
  primary key (family_id, user_id)
);
alter table public.family_blocks enable row level security;

drop policy if exists htf_blocks_select on public.family_blocks;
create policy htf_blocks_select on public.family_blocks for select
  using (public.htf_is_admin(family_id));
grant select on public.family_blocks to authenticated;

-- ------------------------------------------------------------
-- 2. Helpers: who may change what
-- ------------------------------------------------------------
create or replace function public.htf_is_owner(fid uuid) returns boolean
language sql security definer set search_path = public stable as $$
  select exists (select 1 from families where id = fid and owner_id = auth.uid());
$$;

-- Is this person in the logged-in user's circle? (themselves, husband/wife,
-- parent, child, brother/sister.) 'parent' rows mean: person_id's parent is
-- related_person_id. Someone not linked to a person in the family has no circle.
create or replace function public.htf_in_circle(pid uuid) returns boolean
language sql security definer set search_path = public stable as $$
  select exists (
    select 1
    from persons target
    join persons me on me.family_id = target.family_id and me.linked_user_id = auth.uid()
    where target.id = pid
      and public.htf_is_member(target.family_id)
      and (
        me.id = target.id
        or exists (
          select 1 from person_relationships r
          where r.relation_type in ('spouse', 'parent')
            and ((r.person_id = me.id and r.related_person_id = target.id)
              or (r.person_id = target.id and r.related_person_id = me.id))
        )
        or exists (
          select 1 from person_relationships a
          join person_relationships b on b.related_person_id = a.related_person_id
          where a.relation_type = 'parent' and b.relation_type = 'parent'
            and a.person_id = me.id and b.person_id = target.id
        )
      )
  );
$$;

-- May the logged-in user change this person's details?
create or replace function public.htf_can_edit_person(pid uuid) returns boolean
language sql security definer set search_path = public stable as $$
  select exists (
    select 1 from persons p
    where p.id = pid
      and public.htf_is_member(p.family_id)
      and (public.htf_is_admin(p.family_id) or p.created_by = auth.uid() or public.htf_in_circle(p.id))
  );
$$;

-- ...their story and photos? (also: nobody has written one yet, or you started it)
create or replace function public.htf_can_edit_story(pid uuid) returns boolean
language sql security definer set search_path = public stable as $$
  select public.htf_can_see_person(pid) and (
    public.htf_can_edit_person(pid)
    or not exists (select 1 from biographies b where b.person_id = pid)
    or exists (select 1 from biographies b where b.person_id = pid and b.created_by = auth.uid())
  );
$$;

-- ...their grave directions? (same idea)
create or replace function public.htf_can_edit_grave_of(pid uuid) returns boolean
language sql security definer set search_path = public stable as $$
  select public.htf_can_see_person(pid) and (
    public.htf_can_edit_person(pid)
    or not exists (select 1 from graves g where g.person_id = pid)
    or exists (select 1 from graves g where g.person_id = pid and g.created_by = auth.uid())
  );
$$;

create or replace function public.htf_can_edit_grave(gid uuid) returns boolean
language sql security definer set search_path = public stable as $$
  select exists (
    select 1 from graves g
    where g.id = gid and public.htf_can_see_person(g.person_id)
      and (g.created_by = auth.uid() or public.htf_can_edit_person(g.person_id))
  );
$$;

create or replace function public.htf_can_see_grave(gid uuid) returns boolean
language sql security definer set search_path = public stable as $$
  select exists (select 1 from graves g where g.id = gid and public.htf_can_see_person(g.person_id));
$$;

-- text -> uuid, or nothing if the text isn't one (photo folders are named
-- after a person or a grave)
create or replace function public.htf_uuid(t text) returns uuid
language plpgsql immutable as $$
begin
  return t::uuid;
exception when others then
  return null;
end $$;

-- What the app asks before showing Edit / Delete buttons for a person.
create or replace function public.htf_person_rights(p_person_id uuid) returns json
language sql security definer set search_path = public stable as $$
  select json_build_object(
    'family_id', p.family_id,
    'is_admin', public.htf_is_admin(p.family_id),
    'is_owner', public.htf_is_owner(p.family_id),
    'can_edit', public.htf_can_edit_person(p.id),
    'can_edit_story', public.htf_can_edit_story(p.id),
    'can_edit_grave', public.htf_can_edit_grave_of(p.id)
  )
  from persons p
  where p.id = p_person_id and public.htf_is_member(p.family_id);
$$;

-- ------------------------------------------------------------
-- 3. People and their links
-- (adding stays open to every member — see stage5f; only changing and
-- deleting are tightened here)
-- ------------------------------------------------------------
drop policy if exists htf_persons_update on public.persons;
create policy htf_persons_update on public.persons for update
  using (public.htf_can_edit_person(id)) with check (public.htf_is_member(family_id));

drop policy if exists htf_persons_delete on public.persons;
create policy htf_persons_delete on public.persons for delete
  using (public.htf_is_admin(family_id));

-- removing or changing a link counts as editing: you need to be allowed to
-- edit one of the two people
drop policy if exists htf_links_update on public.person_relationships;
create policy htf_links_update on public.person_relationships for update
  using (public.htf_can_edit_person(person_id) or public.htf_can_edit_person(related_person_id))
  with check (public.htf_can_see_person(person_id) and public.htf_can_see_person(related_person_id));

drop policy if exists htf_links_delete on public.person_relationships;
create policy htf_links_delete on public.person_relationships for delete
  using (public.htf_can_edit_person(person_id) or public.htf_can_edit_person(related_person_id));

-- ------------------------------------------------------------
-- 4. Stories, graves and route steps. Old rules on these three tables are
-- removed first (their names aren't known here), then set again.
-- ------------------------------------------------------------
do $$
declare r record;
begin
  for r in
    select policyname, tablename from pg_policies
    where schemaname = 'public' and tablename in ('biographies', 'graves', 'route_steps')
  loop
    execute format('drop policy if exists %I on public.%I', r.policyname, r.tablename);
  end loop;
end $$;

alter table public.biographies enable row level security;
alter table public.graves enable row level security;
alter table public.route_steps enable row level security;

create policy htf_bios_select on public.biographies for select
  using (public.htf_can_see_person(person_id));
create policy htf_bios_insert on public.biographies for insert
  with check (public.htf_can_edit_story(person_id));
create policy htf_bios_update on public.biographies for update
  using (public.htf_can_edit_story(person_id)) with check (public.htf_can_edit_story(person_id));
create policy htf_bios_delete on public.biographies for delete
  using (exists (select 1 from public.persons p where p.id = person_id and public.htf_is_admin(p.family_id)));

create policy htf_graves_select on public.graves for select
  using (public.htf_can_see_person(person_id));
create policy htf_graves_insert on public.graves for insert
  with check (public.htf_can_edit_grave_of(person_id));
create policy htf_graves_update on public.graves for update
  using (public.htf_can_edit_grave_of(person_id)) with check (public.htf_can_edit_grave_of(person_id));
create policy htf_graves_delete on public.graves for delete
  using (exists (select 1 from public.persons p where p.id = person_id and public.htf_is_admin(p.family_id)));

create policy htf_steps_select on public.route_steps for select
  using (public.htf_can_see_grave(grave_id));
create policy htf_steps_insert on public.route_steps for insert
  with check (public.htf_can_edit_grave(grave_id));
create policy htf_steps_update on public.route_steps for update
  using (public.htf_can_edit_grave(grave_id)) with check (public.htf_can_edit_grave(grave_id));
create policy htf_steps_delete on public.route_steps for delete
  using (public.htf_can_edit_grave(grave_id));

-- ------------------------------------------------------------
-- 5. Photos (Storage). Same rules as the story / directions they belong to.
-- bio-photos files sit in a folder named after the person, route-photos in a
-- folder named after the grave. If this part cannot be applied, the rest of
-- the file still is — the checklist at the end says which.
-- ------------------------------------------------------------
do $storage$
declare r record;
begin
  for r in
    select policyname from pg_policies
    where schemaname = 'storage' and tablename = 'objects'
      and (coalesce(qual, '') || coalesce(with_check, '')) ~ '(bio-photos|route-photos)'
  loop
    execute format('drop policy if exists %I on storage.objects', r.policyname);
  end loop;

  create policy htf_bio_photos_select on storage.objects for select to authenticated
    using (bucket_id = 'bio-photos' and public.htf_can_see_person(public.htf_uuid((storage.foldername(name))[1])));
  create policy htf_bio_photos_insert on storage.objects for insert to authenticated
    with check (bucket_id = 'bio-photos' and public.htf_can_edit_story(public.htf_uuid((storage.foldername(name))[1])));
  create policy htf_bio_photos_delete on storage.objects for delete to authenticated
    using (bucket_id = 'bio-photos' and public.htf_can_edit_story(public.htf_uuid((storage.foldername(name))[1])));

  create policy htf_route_photos_select on storage.objects for select to authenticated
    using (bucket_id = 'route-photos' and public.htf_can_see_grave(public.htf_uuid((storage.foldername(name))[1])));
  create policy htf_route_photos_insert on storage.objects for insert to authenticated
    with check (bucket_id = 'route-photos' and public.htf_can_edit_grave(public.htf_uuid((storage.foldername(name))[1])));
  create policy htf_route_photos_delete on storage.objects for delete to authenticated
    using (bucket_id = 'route-photos' and public.htf_can_edit_grave(public.htf_uuid((storage.foldername(name))[1])));
exception when others then
  raise notice 'Photo rules were not changed: %', sqlerrm;
end $storage$;

-- ------------------------------------------------------------
-- 6. Members and admins. Roles can no longer be changed directly — only
-- through the owner-only functions below.
-- ------------------------------------------------------------
drop policy if exists htf_members_update on public.family_members;
drop policy if exists htf_members_delete on public.family_members;

create or replace function public.set_member_admin(p_family_id uuid, p_user_id uuid, p_admin boolean) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not public.htf_is_owner(p_family_id) then raise exception 'Only the family owner can do this.'; end if;
  if p_user_id = auth.uid() then raise exception 'The owner is always an admin.'; end if;
  update family_members set role = case when p_admin then 'admin' else 'member' end
    where family_id = p_family_id and user_id = p_user_id;
  if not found then raise exception 'This person is not a member of the family.'; end if;
end $$;

-- Takes someone out of the family. Their entry in the tree stays (unlinked
-- from their account), and the join code stops working for them.
create or replace function public.remove_member(p_family_id uuid, p_user_id uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not public.htf_is_owner(p_family_id) then raise exception 'Only the family owner can do this.'; end if;
  if p_user_id = auth.uid() then raise exception 'You cannot remove yourself. Hand the family on to someone else first.'; end if;
  delete from family_members where family_id = p_family_id and user_id = p_user_id;
  if not found then raise exception 'This person is not a member of the family.'; end if;
  update persons set linked_user_id = null, updated_at = now()
    where family_id = p_family_id and linked_user_id = p_user_id;
  insert into family_blocks (family_id, user_id, display_name)
    values (p_family_id, p_user_id, (select display_name from users where id = p_user_id))
    on conflict (family_id, user_id) do nothing;
end $$;

-- Lets a removed person use the join code again.
create or replace function public.allow_member_back(p_family_id uuid, p_user_id uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not public.htf_is_owner(p_family_id) then raise exception 'Only the family owner can do this.'; end if;
  delete from family_blocks where family_id = p_family_id and user_id = p_user_id;
end $$;

-- Hands the family on. The old owner stays an admin.
create or replace function public.transfer_ownership(p_family_id uuid, p_user_id uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not public.htf_is_owner(p_family_id) then raise exception 'Only the family owner can do this.'; end if;
  update family_members set role = 'admin' where family_id = p_family_id and user_id = p_user_id;
  if not found then raise exception 'This person is not a member of the family.'; end if;
  update families set owner_id = p_user_id where id = p_family_id;
end $$;

-- Joining by code: same as stage5f, plus the check for removed people.
create or replace function public.join_family(p_code text)
returns table (family_id uuid, family_name text, already_member boolean)
language plpgsql security definer set search_path = public as $$
declare
  f families%rowtype;
  was_member boolean;
begin
  if auth.uid() is null then raise exception 'Please log in first.'; end if;
  select * into f from families where join_code = upper(trim(p_code));
  if not found then raise exception 'Family not found. Double check the code and try again.'; end if;
  if exists (select 1 from family_blocks b where b.family_id = f.id and b.user_id = auth.uid()) then
    raise exception 'You were removed from this family. Ask the family owner to let you back in.';
  end if;

  select exists (select 1 from family_members fm where fm.family_id = f.id and fm.user_id = auth.uid()) into was_member;
  if not was_member then
    insert into family_members (family_id, user_id, role) values (f.id, auth.uid(), 'member');
  end if;
  return query select f.id, f.name, was_member;
end $$;

-- ------------------------------------------------------------
-- 7. Change requests: same function as stage6c, and it now also saves
-- "has passed away" and the date of passing. A request can also be just a
-- note (e.g. about a story) — approving that changes nothing by itself.
-- ------------------------------------------------------------
create or replace function public.review_change_request(p_request_id uuid, p_approve boolean) returns void
language plpgsql security definer set search_path = public as $$
declare
  r change_requests%rowtype;
begin
  select * into r from change_requests where id = p_request_id;
  if not found then raise exception 'This request could not be found.'; end if;
  if not public.htf_is_admin(r.family_id) then raise exception 'Only a family admin can do this.'; end if;
  if r.status <> 'pending' then raise exception 'This request has already been handled.'; end if;

  if p_approve then
    update persons set
      name_en = case when r.changes ? 'name_en' then r.changes->>'name_en' else name_en end,
      name_cn = case when r.changes ? 'name_cn' then r.changes->>'name_cn' else name_cn end,
      gender = case when r.changes ? 'gender' then r.changes->>'gender' else gender end,
      birth_date = case when r.changes ? 'birth_date' then (r.changes->>'birth_date')::date else birth_date end,
      date_precision = case
        when r.changes ? 'birth_date' then (case when r.changes->>'birth_date' is null then 'unknown' else 'exact' end)
        else date_precision end,
      is_deceased = case when r.changes ? 'is_deceased' then coalesce((r.changes->>'is_deceased')::boolean, false) else is_deceased end,
      death_date = case
        when r.changes ? 'is_deceased' and not coalesce((r.changes->>'is_deceased')::boolean, false) then null
        when r.changes ? 'death_date' then (r.changes->>'death_date')::date
        else death_date end,
      updated_at = now()
    where id = r.person_id;
  end if;

  update change_requests
    set status = case when p_approve then 'approved' else 'rejected' end,
        reviewed_by = auth.uid(),
        reviewed_at = now()
    where id = p_request_id;
end $$;

-- ------------------------------------------------------------
-- 8. Who may call the new functions: logged-in people only
-- ------------------------------------------------------------
revoke execute on function public.set_member_admin(uuid, uuid, boolean) from public, anon;
revoke execute on function public.remove_member(uuid, uuid) from public, anon;
revoke execute on function public.allow_member_back(uuid, uuid) from public, anon;
revoke execute on function public.transfer_ownership(uuid, uuid) from public, anon;
revoke execute on function public.htf_person_rights(uuid) from public, anon;
revoke execute on function public.join_family(text) from public, anon;
grant execute on function public.set_member_admin(uuid, uuid, boolean) to authenticated;
grant execute on function public.remove_member(uuid, uuid) to authenticated;
grant execute on function public.allow_member_back(uuid, uuid) to authenticated;
grant execute on function public.transfer_ownership(uuid, uuid) to authenticated;
grant execute on function public.htf_person_rights(uuid) to authenticated;
grant execute on function public.join_family(text) to authenticated;
grant execute on function public.review_change_request(uuid, boolean) to authenticated;

-- ------------------------------------------------------------
-- 9. Checklist — every line should say "yes"
-- ------------------------------------------------------------
select 'Every family has an owner' as "check",
       case when not exists (select 1 from public.families where owner_id is null) then 'yes' else 'NO - tell Claude' end as "ok?"
union all
select 'Only admins can delete people',
       case when exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'persons'
                         and policyname = 'htf_persons_delete' and qual like '%htf_is_admin%') then 'yes' else 'NO - tell Claude' end
union all
select 'Story and grave rules are in place',
       case when (select count(*) from pg_policies where schemaname = 'public'
                  and tablename in ('biographies', 'graves', 'route_steps') and policyname like 'htf_%') = 12 then 'yes' else 'NO - tell Claude' end
union all
select 'Photo rules are in place',
       case when (select count(*) from pg_policies where schemaname = 'storage' and tablename = 'objects'
                  and policyname like 'htf_%photos_%') = 6 then 'yes' else 'NO - tell Claude' end;
