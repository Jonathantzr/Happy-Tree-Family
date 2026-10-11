-- Happy Tree Family — Stage 6.5a follow-up: "Something else?" tradition requests
--
-- HOW TO RUN: Supabase dashboard -> SQL Editor -> New query (+) -> paste this
-- whole file -> Run. Safe to run more than once.
-- Run supabase/stage6_5a-family-traditions.sql first.
-- If Supabase shows a "creates a table without Row Level Security" popup, it is
-- a false alarm: choose "Run without RLS".
--
-- WHY: the traditions list is short (Chinese, Malay, Indian). When a family
-- follows something that isn't listed, they can type it in. That is the
-- request to us, the developers, to consider adding it.
--
-- TO READ THE REQUESTS LATER, run this on its own:
--   select name, tradition_other from public.families
--   where coalesce(tradition_other, '') <> '' order by name;

alter table public.families add column if not exists tradition_other text;
