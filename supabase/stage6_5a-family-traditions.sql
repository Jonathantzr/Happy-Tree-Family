-- Happy Tree Family — Stage 6.5a database update: family traditions
--
-- HOW TO RUN: Supabase dashboard -> SQL Editor -> New query (+) -> paste this
-- whole file -> Run. Safe to run more than once.
-- If Supabase shows a "creates a table without Row Level Security" popup, it is
-- a false alarm: choose "Run without RLS".
--
-- WHY: the app now starts neutral — a plain family tree. The Chinese parts
-- (generation name book, Chinese name boxes, Chinese surname) only appear for
-- families that say they follow Chinese traditions. Each family remembers its
-- own choice, so one person can belong to two families with different answers.
--
-- WHAT IT DOES: adds a "traditions" list to each family ('chinese', 'malay',
-- 'indian' — any, or none). Families that exist ALREADY are marked 'chinese',
-- so nothing disappears from them. New families start with an empty list and
-- choose when they are created.

alter table public.families add column if not exists traditions text[];

-- existing families keep everything they have today
update public.families set traditions = '{chinese}' where traditions is null;

alter table public.families alter column traditions set default '{}';
alter table public.families alter column traditions set not null;
