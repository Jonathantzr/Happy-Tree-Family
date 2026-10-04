-- Happy Tree Family — one-time tidy-up: link parents as husband and wife
--
-- HOW TO RUN: Supabase dashboard -> SQL Editor -> New query (+) -> paste this
-- whole file -> Run. Safe to run more than once (the second time it finds
-- nothing left to do).
--
-- WHY: when two people were each added as a parent of the same child but never
-- linked to each other, the tree drew them as two strangers with two separate
-- lines (e.g. "Ben Gf Mum" and "Ben Gf Dad"). The app now links such parents as
-- a couple when the second one is added; this file does the same for parents
-- added BEFORE that change.
--
-- WHAT IT DOES: for every child with exactly two parents, links those two
-- parents as husband and wife — but ONLY when neither of them is linked to a
-- husband/wife yet, and neither has children with someone else. Those cases
-- (remarriage, step-families) are left for a person to sort out by hand.
-- Nobody is deleted and no existing link is changed.
--
-- RESULT: a list of the couples it linked. "No rows returned" = nothing to do.

with pairs as (
  select distinct p1.related_person_id as a, p2.related_person_id as b
  from public.person_relationships p1
  join public.person_relationships p2
    on p2.person_id = p1.person_id
   and p2.relation_type = 'parent'
   and p1.related_person_id < p2.related_person_id
  where p1.relation_type = 'parent'
    and (select count(*) from public.person_relationships c
         where c.person_id = p1.person_id and c.relation_type = 'parent') = 2
),
married as (
  select person_id as id from public.person_relationships where relation_type = 'spouse'
  union
  select related_person_id from public.person_relationships where relation_type = 'spouse'
),
linked as (
  insert into public.person_relationships (person_id, related_person_id, relation_type)
  select pr.a, pr.b, 'spouse'
  from pairs pr
  where pr.a not in (select id from married)
    and pr.b not in (select id from married)
    and (select count(*) from pairs x where x.a in (pr.a, pr.b) or x.b in (pr.a, pr.b)) = 1
  on conflict do nothing
  returning person_id, related_person_id
)
select coalesce(pa.name_en, pa.name_cn) as parent_1, coalesce(pb.name_en, pb.name_cn) as parent_2, 'linked as a couple' as result
from linked l
join public.persons pa on pa.id = l.person_id
join public.persons pb on pb.id = l.related_person_id
order by 1;
