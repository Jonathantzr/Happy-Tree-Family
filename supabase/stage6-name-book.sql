-- Happy Tree Family — Stage 6 database update: Generation Name Book
--
-- HOW TO RUN: Supabase dashboard -> SQL Editor -> New query (+) -> paste this
-- whole file -> Run. Safe to run more than once.
-- Run supabase/stage5b-who-am-i-and-requests.sql first (this uses its helpers).
-- It does NOT need stage5f to be run first, and stage5f can still be run later.
--
-- WHAT IT DOES:
--   - makes sure the two name-book tables exist (they were designed at the very
--     start, so they are probably there already — then nothing is changed)
--   - remembers which person lines the poem up with the family tree
--     ("Tan Zhi Ren = the 3rd character"); everyone else is counted from them
--   - makes sure people have a place for their Chinese name
--   - rules: everyone in the family can read the name book, only family admins
--     can change it, people who aren't logged in see nothing

-- ------------------------------------------------------------
-- Tables (only created if they are missing)
-- ------------------------------------------------------------
create table if not exists public.generation_books (
  id            uuid primary key default gen_random_uuid(),
  family_id     uuid references public.families(id) on delete cascade unique,
  poem_text     text,
  origin_notes  text,
  created_at    timestamptz default now()
);

create table if not exists public.generation_entries (
  id                  uuid primary key default gen_random_uuid(),
  generation_book_id  uuid references public.generation_books(id) on delete cascade,
  generation_index    int not null,
  character_cn        text not null,
  character_pinyin    text,
  is_confirmed        boolean default true,
  notes               text,
  unique (generation_book_id, generation_index)
);

-- ------------------------------------------------------------
-- New columns
-- ------------------------------------------------------------
-- The person the poem is lined up from, and which character (0 = first) is theirs.
alter table public.generation_books
  add column if not exists anchor_person_id uuid references public.persons(id) on delete set null;
alter table public.generation_books
  add column if not exists anchor_index int;

-- A person's name in Chinese characters (optional), e.g. 陈志仁.
alter table public.persons add column if not exists name_cn text;

-- ------------------------------------------------------------
-- Rules: members read, admins edit (the same rules stage5f sets)
-- ------------------------------------------------------------
alter table public.generation_books enable row level security;
alter table public.generation_entries enable row level security;

drop policy if exists htf_genbooks_select on public.generation_books;
drop policy if exists htf_genbooks_insert on public.generation_books;
drop policy if exists htf_genbooks_update on public.generation_books;
drop policy if exists htf_genbooks_delete on public.generation_books;
create policy htf_genbooks_select on public.generation_books for select
  using (public.htf_is_member(family_id));
create policy htf_genbooks_insert on public.generation_books for insert
  with check (public.htf_is_admin(family_id));
create policy htf_genbooks_update on public.generation_books for update
  using (public.htf_is_admin(family_id)) with check (public.htf_is_admin(family_id));
create policy htf_genbooks_delete on public.generation_books for delete
  using (public.htf_is_admin(family_id));

drop policy if exists htf_genentries_select on public.generation_entries;
drop policy if exists htf_genentries_insert on public.generation_entries;
drop policy if exists htf_genentries_update on public.generation_entries;
drop policy if exists htf_genentries_delete on public.generation_entries;
create policy htf_genentries_select on public.generation_entries for select
  using (exists (select 1 from public.generation_books b where b.id = generation_book_id and public.htf_is_member(b.family_id)));
create policy htf_genentries_insert on public.generation_entries for insert
  with check (exists (select 1 from public.generation_books b where b.id = generation_book_id and public.htf_is_admin(b.family_id)));
create policy htf_genentries_update on public.generation_entries for update
  using (exists (select 1 from public.generation_books b where b.id = generation_book_id and public.htf_is_admin(b.family_id)));
create policy htf_genentries_delete on public.generation_entries for delete
  using (exists (select 1 from public.generation_books b where b.id = generation_book_id and public.htf_is_admin(b.family_id)));

grant select, insert, update, delete on public.generation_books to authenticated;
grant select, insert, update, delete on public.generation_entries to authenticated;
