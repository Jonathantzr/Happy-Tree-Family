-- FIND MY GRAVE — Phase 1 Database Schema
-- Scope: Grave Route Finder, QR Memorial/Bio, Generation Name Book
-- (Family tree tables kept minimal — just enough to power relationship labels + name book)

-- ============================================================
-- 1. CORE IDENTITY
-- ============================================================

CREATE TABLE users (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  phone_number  TEXT UNIQUE,           -- Malaysian numbers, primary login method
  email         TEXT UNIQUE,
  display_name  TEXT NOT NULL,
  avatar_url    TEXT,
  created_at    TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE families (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name          TEXT NOT NULL,          -- e.g. "Tan Family (Segamat)"
  surname_cn    TEXT,                   -- 陈, for name book defaults
  created_by    UUID REFERENCES users(id),
  created_at    TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE family_members (
  family_id     UUID REFERENCES families(id) ON DELETE CASCADE,
  user_id       UUID REFERENCES users(id) ON DELETE CASCADE,
  role          TEXT NOT NULL DEFAULT 'member' CHECK (role IN ('admin','member')),
  joined_at     TIMESTAMPTZ DEFAULT now(),
  PRIMARY KEY (family_id, user_id)
);

-- ============================================================
-- 2. PERSON RECORDS (living or deceased — minimal tree, not full genealogy UI yet)
-- ============================================================

CREATE TABLE persons (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  family_id       UUID REFERENCES families(id) ON DELETE CASCADE,
  name_cn         TEXT,                 -- 陈志仁
  name_pinyin     TEXT,                 -- Tan Zhi Ren
  name_en         TEXT,                 -- English/alias name if any
  gender          TEXT CHECK (gender IN ('M','F','other')),
  is_deceased     BOOLEAN DEFAULT false,
  birth_date      DATE,                 -- nullable/approximate — see notes field
  death_date      DATE,
  date_precision  TEXT DEFAULT 'exact' CHECK (date_precision IN ('exact','year_only','approximate','unknown')),
  generation_index INT,                 -- which generation in the name book sequence (0 = root)
  notes           TEXT,                 -- free text: uncertain facts, disputes, etc.
  linked_user_id  UUID REFERENCES users(id),  -- if this person is also an app user
  created_at      TIMESTAMPTZ DEFAULT now(),
  updated_at      TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE person_relationships (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  person_id         UUID REFERENCES persons(id) ON DELETE CASCADE,
  related_person_id UUID REFERENCES persons(id) ON DELETE CASCADE,
  relation_type     TEXT NOT NULL CHECK (relation_type IN ('parent','spouse')),
  -- 'parent' means related_person_id is the PARENT of person_id.
  -- child/sibling/etc. are all derived at query time from parent+spouse edges.
  created_at        TIMESTAMPTZ DEFAULT now(),
  UNIQUE (person_id, related_person_id, relation_type)
);

-- Relationship-to-viewer (e.g. "great-grandmother on dad's side") is COMPUTED,
-- not stored: walk the parent/spouse graph from viewer's linked person_id to
-- the target person_id. Cache the computed label per (viewer, person) pair if
-- performance becomes an issue — do not hand-maintain it.

-- ============================================================
-- 3. GRAVES + ROUTE FINDER (the core differentiator)
-- ============================================================

CREATE TABLE graves (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  person_id          UUID REFERENCES persons(id) ON DELETE CASCADE,
  cemetery_name       TEXT NOT NULL,
  cemetery_map_link   TEXT,             -- Waze/Google Maps deep link to the cemetery entrance itself
  cemetery_address    TEXT,
  general_notes        TEXT,            -- "busiest during Ching Ming week, arrive early"
  qr_code_uuid         UUID UNIQUE DEFAULT gen_random_uuid(), -- encoded into the printed QR
  created_by            UUID REFERENCES users(id),
  created_at             TIMESTAMPTZ DEFAULT now(),
  updated_at             TIMESTAMPTZ DEFAULT now()
);

-- The breadcrumb trail. Ordered steps from cemetery entrance to the exact tombstone.
CREATE TABLE route_steps (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  grave_id      UUID REFERENCES graves(id) ON DELETE CASCADE,
  step_order    INT NOT NULL,            -- 1, 2, 3...
  title         TEXT NOT NULL,           -- "Enter via the east gate"
  description   TEXT,                    -- "Park near the red temple building, walk ~100m north"
  photo_url     TEXT,                    -- landmark photo for this step
  distance_hint TEXT,                    -- "~100m", "just past the big banyan tree" (free text, not GPS-computed)
  created_at    TIMESTAMPTZ DEFAULT now(),
  UNIQUE (grave_id, step_order)
);

-- ============================================================
-- 4. QR MEMORIAL / BIOGRAPHY
-- ============================================================

CREATE TABLE biographies (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  person_id    UUID REFERENCES persons(id) ON DELETE CASCADE UNIQUE,
  summary      TEXT,                     -- short life summary shown on QR scan
  occupation   TEXT,
  hometown     TEXT,
  photo_urls   TEXT[],                   -- gallery
  updated_by   UUID REFERENCES users(id),
  updated_at   TIMESTAMPTZ DEFAULT now()
);
-- QR scan resolves: qr_code_uuid -> grave -> person -> biography
-- Bio page is publicly readable (no login) via a signed short link; editing requires family membership.

-- ============================================================
-- 5. GENERATION NAME BOOK (字辈 / 辈分)
-- ============================================================

CREATE TABLE generation_books (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  family_id     UUID REFERENCES families(id) ON DELETE CASCADE UNIQUE,
  poem_text     TEXT,                    -- the full traditional poem, if known, for display/provenance
  origin_notes  TEXT,                    -- "brought from Fujian, great-grandfather's copy"
  created_at    TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE generation_entries (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  generation_book_id  UUID REFERENCES generation_books(id) ON DELETE CASCADE,
  generation_index    INT NOT NULL,      -- 0, 1, 2, 3... matches persons.generation_index
  character_cn        TEXT NOT NULL,     -- the assigned character, e.g. 志
  character_pinyin     TEXT,
  is_confirmed          BOOLEAN DEFAULT true,  -- false = "best guess / disputed"
  notes                 TEXT,
  UNIQUE (generation_book_id, generation_index)
);

-- App logic: to suggest a newborn's name, find the parent's generation_index + 1,
-- look up generation_entries for that index, and surface the character as a
-- suggestion (never auto-assign — always human-confirmed, since these records
-- are frequently incomplete or contested within families).

-- ============================================================
-- INDEXES
-- ============================================================
CREATE INDEX idx_persons_family ON persons(family_id);
CREATE INDEX idx_relationships_person ON person_relationships(person_id);
CREATE INDEX idx_relationships_related ON person_relationships(related_person_id);
CREATE INDEX idx_route_steps_grave ON route_steps(grave_id, step_order);
CREATE INDEX idx_graves_person ON graves(person_id);
