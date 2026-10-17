-- Happy Tree Family — Stage 6.5c follow-up: red "new changes" counts for admins
--
-- HOW TO RUN: Supabase dashboard -> SQL Editor -> New query (+) -> paste this
-- whole file -> Run. Safe to run more than once.
-- Run supabase/stage6_5c-recent-changes.sql first.
-- When it finishes, the Results box shows a short checklist — every line
-- should say "yes".
--
-- WHY: admins shouldn't have to keep opening Recent changes to find out if
-- anything happened. Each admin now has a "last looked at" time per family;
-- changes by OTHER people after that time are counted (the red number on the
-- family card and the family list) and shown in a highlighted colour on the
-- Recent changes screen. Opening the screen marks them as seen.

alter table public.family_members add column if not exists changes_seen_at timestamptz;

-- "I've looked at Recent changes now" (only touches your own row)
create or replace function public.mark_changes_seen(p_family_id uuid) returns void
language sql security definer set search_path = public as $$
  update family_members set changes_seen_at = now()
  where family_id = p_family_id and user_id = auth.uid();
$$;

-- How many saves by other people you haven't seen yet, per family where you
-- are an admin. Someone who has never opened the screen counts the last 7 days.
create or replace function public.unseen_changes()
returns table (family_id uuid, unseen bigint)
language sql security definer set search_path = public stable as $$
  select fm.family_id, count(distinct c.batch)
  from family_members fm
  join change_log c on c.family_id = fm.family_id
  where fm.user_id = auth.uid()
    and fm.role = 'admin'
    and not c.via_undo
    and c.changed_by is distinct from auth.uid()
    and c.changed_at > coalesce(fm.changes_seen_at, now() - interval '7 days')
  group by fm.family_id;
$$;

revoke execute on function public.mark_changes_seen(uuid) from public, anon;
revoke execute on function public.unseen_changes() from public, anon;
grant execute on function public.mark_changes_seen(uuid) to authenticated;
grant execute on function public.unseen_changes() to authenticated;

-- Checklist — every line should say "yes"
select 'Admins remember when they last looked' as "check",
       case when exists (select 1 from information_schema.columns
                         where table_schema = 'public' and table_name = 'family_members' and column_name = 'changes_seen_at')
            then 'yes' else 'NO - tell Claude' end as "ok?"
union all
select 'New changes can be counted',
       case when exists (select 1 from pg_proc where proname = 'unseen_changes') then 'yes' else 'NO - tell Claude' end;
