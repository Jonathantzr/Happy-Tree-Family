-- Happy Tree Family — Stage 5f database update: lock down the family tables
--
-- HOW TO RUN: Supabase dashboard -> SQL Editor -> New query (+) -> paste this
-- whole file -> Run. Safe to run more than once.
-- Run supabase/stage5b-who-am-i-and-requests.sql first (this uses its helpers).
-- Update the app (reload it) at the same time: joining a family by code now
-- goes through the join_family() function below.
--
-- WHY: Supabase's Advisor reported "RLS Disabled in Public" on six tables.
-- Without row level security, anyone holding the app's public key (it is
-- inside the app and the memorial web page, so it is not a secret) could read,
-- change or delete every family's people. After this file:
--   - only members of a family can see or change that family's data
--   - people who aren't logged in can see nothing in these tables
--   - the public memorial page still works (it goes through get_memorial)

-- ------------------------------------------------------------
-- Helper: can the logged-in user see this person? (member of their family)
-- ------------------------------------------------------------
create or replace function public.htf_can_see_person(pid uuid) returns boolean
language sql security definer set search_path = public stable as $$
  select exists (
    select 1 from persons p
    join family_members fm on fm.family_id = p.family_id
    where p.id = pid and fm.user_id = auth.uid()
  );
$$;

-- ------------------------------------------------------------
-- Start clean: remove any old rules on these tables (while security was off
-- they did nothing, but a forgotten "allow everyone" rule would come alive
-- the moment security is switched on).
-- ------------------------------------------------------------
do $$
declare r record;
begin
  for r in
    select policyname, tablename from pg_policies
    where schemaname = 'public'
      and tablename in ('families','family_members','persons','person_relationships','generation_books','generation_entries')
  loop
    execute format('drop policy if exists %I on public.%I', r.policyname, r.tablename);
  end loop;
end $$;

alter table public.families enable row level security;
alter table public.family_members enable row level security;
alter table public.persons enable row level security;
alter table public.person_relationships enable row level security;
alter table public.generation_books enable row level security;
alter table public.generation_entries enable row level security;

-- ------------------------------------------------------------
-- families: members see their family; whoever creates one can see it straight
-- away (before they've been added as its first member); admins can rename it.
-- ------------------------------------------------------------
create policy htf_families_select on public.families for select
  using (public.htf_is_member(id) or created_by = auth.uid());
create policy htf_families_insert on public.families for insert
  with check (created_by = auth.uid());
create policy htf_families_update on public.families for update
  using (public.htf_is_admin(id)) with check (public.htf_is_admin(id));

-- ------------------------------------------------------------
-- family_members: you see the member list of your own families. The only row
-- you can add yourself is "me, as admin, of the family I just created" —
-- joining someone else's family goes through join_family() below.
-- Admins can change roles or remove members.
-- ------------------------------------------------------------
create policy htf_members_select on public.family_members for select
  using (user_id = auth.uid() or public.htf_is_member(family_id));
create policy htf_members_insert on public.family_members for insert
  with check (
    user_id = auth.uid()
    and role = 'admin'
    and exists (select 1 from public.families f where f.id = family_id and f.created_by = auth.uid())
  );
create policy htf_members_update on public.family_members for update
  using (public.htf_is_admin(family_id)) with check (public.htf_is_admin(family_id));
create policy htf_members_delete on public.family_members for delete
  using (public.htf_is_admin(family_id));

-- ------------------------------------------------------------
-- persons + their links: members of that family only
-- ------------------------------------------------------------
create policy htf_persons_select on public.persons for select
  using (public.htf_is_member(family_id));
create policy htf_persons_insert on public.persons for insert
  with check (public.htf_is_member(family_id));
create policy htf_persons_update on public.persons for update
  using (public.htf_is_member(family_id)) with check (public.htf_is_member(family_id));
create policy htf_persons_delete on public.persons for delete
  using (public.htf_is_member(family_id));

create policy htf_links_select on public.person_relationships for select
  using (public.htf_can_see_person(person_id));
create policy htf_links_insert on public.person_relationships for insert
  with check (public.htf_can_see_person(person_id) and public.htf_can_see_person(related_person_id));
create policy htf_links_update on public.person_relationships for update
  using (public.htf_can_see_person(person_id))
  with check (public.htf_can_see_person(person_id) and public.htf_can_see_person(related_person_id));
create policy htf_links_delete on public.person_relationships for delete
  using (public.htf_can_see_person(person_id));

-- ------------------------------------------------------------
-- generation name book (Stage 6, not built yet): members read, admins edit
-- ------------------------------------------------------------
create policy htf_genbooks_select on public.generation_books for select
  using (public.htf_is_member(family_id));
create policy htf_genbooks_insert on public.generation_books for insert
  with check (public.htf_is_admin(family_id));
create policy htf_genbooks_update on public.generation_books for update
  using (public.htf_is_admin(family_id)) with check (public.htf_is_admin(family_id));
create policy htf_genbooks_delete on public.generation_books for delete
  using (public.htf_is_admin(family_id));

create policy htf_genentries_select on public.generation_entries for select
  using (exists (select 1 from public.generation_books b where b.id = generation_book_id and public.htf_is_member(b.family_id)));
create policy htf_genentries_insert on public.generation_entries for insert
  with check (exists (select 1 from public.generation_books b where b.id = generation_book_id and public.htf_is_admin(b.family_id)));
create policy htf_genentries_update on public.generation_entries for update
  using (exists (select 1 from public.generation_books b where b.id = generation_book_id and public.htf_is_admin(b.family_id)));
create policy htf_genentries_delete on public.generation_entries for delete
  using (exists (select 1 from public.generation_books b where b.id = generation_book_id and public.htf_is_admin(b.family_id)));

-- ------------------------------------------------------------
-- Joining by code. A non-member can no longer look families up directly, so
-- this function checks the code and adds you as a member in one step.
-- Returns the family's id and name, and whether you were already in it.
-- ------------------------------------------------------------
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

  select exists (select 1 from family_members fm where fm.family_id = f.id and fm.user_id = auth.uid()) into was_member;
  if not was_member then
    insert into family_members (family_id, user_id, role) values (f.id, auth.uid(), 'member');
  end if;
  return query select f.id, f.name, was_member;
end $$;

grant execute on function public.join_family(text) to authenticated;
revoke execute on function public.join_family(text) from anon;

-- ------------------------------------------------------------
-- The public memorial page reads one deceased person through get_memorial().
-- Make sure that function runs with its own rights ("security definer"), so
-- the page keeps working now that the tables themselves are closed.
-- ------------------------------------------------------------
do $$
declare r record;
begin
  for r in
    select p.oid::regprocedure as fn from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'get_memorial'
  loop
    execute format('alter function %s security definer', r.fn);
    execute format('alter function %s set search_path = public', r.fn);
  end loop;
end $$;
