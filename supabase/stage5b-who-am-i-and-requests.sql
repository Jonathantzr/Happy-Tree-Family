-- Happy Tree Family — Stage 5b database update: "who am I" + change requests
--
-- HOW TO RUN: Supabase dashboard -> SQL Editor -> New query -> paste this whole
-- file -> Run. Safe to run more than once.
--
-- What it adds:
-- 1. Your own details on your account (name, birth date, gender), filled in once after sign-up.
-- 2. "This is me": an app user can be linked to their person in a family.
-- 3. Change requests: members ask, family admins approve or reject.

-- ------------------------------------------------------------
-- 1. Profile details on public.users (one row per account, made by the sign-up trigger)
-- ------------------------------------------------------------
alter table public.users add column if not exists birth_date date;
alter table public.users add column if not exists gender text;
alter table public.users add column if not exists profile_complete boolean not null default false;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'users_gender_check_htf') then
    alter table public.users add constraint users_gender_check_htf check (gender in ('M','F','other'));
  end if;
end $$;

-- ------------------------------------------------------------
-- Helpers. "security definer" lets them look at family_members without
-- tripping over that table's own access rules.
-- ------------------------------------------------------------
create or replace function public.htf_is_member(fid uuid) returns boolean
language sql security definer set search_path = public stable as $$
  select exists (select 1 from family_members where family_id = fid and user_id = auth.uid());
$$;

create or replace function public.htf_is_admin(fid uuid) returns boolean
language sql security definer set search_path = public stable as $$
  select exists (select 1 from family_members where family_id = fid and user_id = auth.uid() and role = 'admin');
$$;

create or replace function public.htf_shares_family(other_user uuid) returns boolean
language sql security definer set search_path = public stable as $$
  select exists (
    select 1 from family_members mine
    join family_members theirs on theirs.family_id = mine.family_id
    where mine.user_id = auth.uid() and theirs.user_id = other_user
  );
$$;

-- You can read and update your own account details, and read the names of
-- people who share a family with you (so admins can see who sent a request).
-- Turning on row level security stops anyone editing someone else's account.
-- (New accounts are still created by the sign-up trigger, which runs as
-- "security definer". If sign-up ever fails after this, run:
--   alter table public.users disable row level security;
-- and ask Claude to look at the trigger.)
alter table public.users enable row level security;

drop policy if exists htf_users_select on public.users;
create policy htf_users_select on public.users for select
  using (id = auth.uid() or public.htf_shares_family(id));

drop policy if exists htf_users_update_self on public.users;
create policy htf_users_update_self on public.users for update
  using (id = auth.uid()) with check (id = auth.uid());

-- ------------------------------------------------------------
-- 2. "This is me" — link / unlink your account to a person
-- ------------------------------------------------------------
create or replace function public.claim_person(p_person_id uuid) returns void
language plpgsql security definer set search_path = public as $$
declare
  fid uuid;
  linked uuid;
begin
  select family_id, linked_user_id into fid, linked from persons where id = p_person_id;
  if fid is null then raise exception 'This person could not be found.'; end if;
  if not public.htf_is_member(fid) then raise exception 'You are not a member of this family.'; end if;
  if linked is not null and linked <> auth.uid() then
    raise exception 'Someone else is already linked to this person. Ask a family admin if this is wrong.';
  end if;
  if exists (select 1 from persons where family_id = fid and linked_user_id = auth.uid() and id <> p_person_id) then
    raise exception 'You are already linked to another person in this family.';
  end if;
  update persons set linked_user_id = auth.uid(), updated_at = now() where id = p_person_id;
end $$;

-- you can unlink yourself; an admin can unlink anyone
create or replace function public.release_person(p_person_id uuid) returns void
language plpgsql security definer set search_path = public as $$
declare
  fid uuid;
  linked uuid;
begin
  select family_id, linked_user_id into fid, linked from persons where id = p_person_id;
  if fid is null then raise exception 'This person could not be found.'; end if;
  if linked is distinct from auth.uid() and not public.htf_is_admin(fid) then
    raise exception 'Only you or a family admin can do this.';
  end if;
  update persons set linked_user_id = null, updated_at = now() where id = p_person_id;
end $$;

-- ------------------------------------------------------------
-- 3. Change requests
-- ------------------------------------------------------------
create table if not exists public.change_requests (
  id            uuid primary key default gen_random_uuid(),
  family_id     uuid not null references public.families(id) on delete cascade,
  person_id     uuid not null references public.persons(id) on delete cascade,
  requested_by  uuid not null default auth.uid() references public.users(id) on delete cascade,
  changes       jsonb not null default '{}'::jsonb,   -- e.g. {"name_en": "Jonathan", "birth_date": "1995-03-02"}
  note          text,
  status        text not null default 'pending' check (status in ('pending','approved','rejected')),
  reviewed_by   uuid references public.users(id),
  reviewed_at   timestamptz,
  created_at    timestamptz default now()
);
create index if not exists idx_change_requests_family on public.change_requests(family_id, status);

alter table public.change_requests enable row level security;

-- you see your own requests; admins see every request in their family
drop policy if exists htf_requests_select on public.change_requests;
create policy htf_requests_select on public.change_requests for select
  using (requested_by = auth.uid() or public.htf_is_admin(family_id));

-- any family member can send one, about a person in that family
drop policy if exists htf_requests_insert on public.change_requests;
create policy htf_requests_insert on public.change_requests for insert
  with check (
    requested_by = auth.uid()
    and public.htf_is_member(family_id)
    and exists (select 1 from public.persons p where p.id = person_id and p.family_id = change_requests.family_id)
  );

-- approving/rejecting goes through this function (admins only)
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
      gender = case when r.changes ? 'gender' then r.changes->>'gender' else gender end,
      birth_date = case when r.changes ? 'birth_date' then (r.changes->>'birth_date')::date else birth_date end,
      date_precision = case
        when r.changes ? 'birth_date' then (case when r.changes->>'birth_date' is null then 'unknown' else 'exact' end)
        else date_precision end,
      updated_at = now()
    where id = r.person_id;
  end if;

  update change_requests
    set status = case when p_approve then 'approved' else 'rejected' end,
        reviewed_by = auth.uid(),
        reviewed_at = now()
    where id = p_request_id;
end $$;

grant execute on function public.claim_person(uuid) to authenticated;
grant execute on function public.release_person(uuid) to authenticated;
grant execute on function public.review_change_request(uuid, boolean) to authenticated;
grant select, insert on public.change_requests to authenticated;
