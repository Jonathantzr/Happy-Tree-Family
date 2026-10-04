-- Happy Tree Family — Stage 6 follow-up: Chinese name in change requests
--
-- HOW TO RUN: Supabase dashboard -> SQL Editor -> New query (+) -> paste this
-- whole file -> Run. Safe to run more than once.
-- Run supabase/stage6-name-book.sql first (it makes sure persons.name_cn exists).
-- If Supabase shows a "creates a table without Row Level Security" popup, it is
-- a false alarm for this file too: choose "Run without RLS".
--
-- WHY: members change their own entry by sending a request that an admin
-- approves. The request form now has the same "Chinese name" box as the
-- admins' form — this teaches the approve step to save it. Until this is run,
-- approving such a request saves everything except the Chinese name.
--
-- This replaces the function from stage5b with the same one plus one line
-- (name_cn). Nothing else changes: admins only, pending requests only.

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
      updated_at = now()
    where id = r.person_id;
  end if;

  update change_requests
    set status = case when p_approve then 'approved' else 'rejected' end,
        reviewed_by = auth.uid(),
        reviewed_at = now()
    where id = p_request_id;
end $$;

grant execute on function public.review_change_request(uuid, boolean) to authenticated;
