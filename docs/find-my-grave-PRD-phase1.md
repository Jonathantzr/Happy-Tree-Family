# Happy Tree Family (formerly "Find My Grave") — Product Requirements Document (Phase 1 / MVP)

> Name note: play on *Happy Tree Friends* — dark-comedy tone intentional, consistent with the original working title. Before any public/commercial launch, run a trademark check (HTF is an existing registered trademark held by Mondo Media).

## 1. Vision
A mobile-first app that stops a Malaysian-Chinese family's ancestral knowledge — grave locations, lineage, and naming traditions — from dying out as the eldest generation passes and Ching Ming (all souls' day / 清明节) observance fades.

**Not** a general genealogy app, **not** a family chat app. The wedge is: *"I don't know exactly where my ancestor is buried, and no one left who does."*

## 2. Target User
- Malaysian-Chinese, 30–60, urban (KL/Klang Valley), diaspora from smaller towns (e.g. Segamat)
- Returns 1–2x/year for Ching Ming, increasingly without the "uncle" who knows the cemetery layout
- Comfortable with smartphones, not necessarily tech-savvy — design must be low-friction

## 3. Problem Statement
1. Buddhist/Taoist cemeteries in Malaysia are often informally organized — no addresses, dense unmarked plots, knowledge held only by aging relatives.
2. Christian/formal cemeteries are already solved (numbered lots) — **out of scope**, or trivial add-on.
3. Generational naming conventions (字辈 / 辈分, "pai hang") are half-remembered; no family reference exists once elders pass.
4. Family history (who someone was, their story) isn't recorded anywhere accessible to younger generations.

## 4. Phase 1 Scope (MVP)

### 4.1 Grave Locator
- Add a grave record: GPS coordinates (captured on-site), cemetery name, section/row notes, photos of the plot and surrounding landmarks, free-text directions ("100m past the big banyan tree, 3rd row from the shrine").
- **Design constraint:** GPS accuracy in dense cemeteries can be poor (±5–10m, which is the wrong row). MVP should support "walk-to" turn-by-turn *plus* landmark photos/notes as the real fallback — don't over-promise pin accuracy alone.
- Offline map caching for the cemetery area (spotty rural signal is likely).
- View all graves for a family, filterable by relative/branch.

### 4.2 QR Code Memorial / Bio
- Each grave record gets a generated QR code (printable, laminatable, plantable at the site).
- Scanning opens a bio page: photo, name (Chinese + English), birth/death dates, relationship to viewer, a short written history/story, who tends to it.
- Works without login (public-readable link) so any relative present at the grave can scan it, even non-users.

### 4.3 Family Tree (Core)
- Add immediate + extended family members (parents, siblings, spouses, children, grandparents, aunts/uncles/cousins).
- Node = person record: name (Chinese characters + pinyin/romanization + English name), birth/death, photo, relationship links, free-text notes.
- Link a person node to a grave record (many people won't have one yet — that's fine).
- Visual tree view, pinch-zoom, collapsible branches.

### 4.4 Interactive Family Tree (Viewer)
- Visual, pannable/zoomable tree built from `persons` + `person_relationships` — spans immediate, extended, and overseas branches (e.g. relatives still in China who local family has never met).
- **Scanning a grave's QR code opens the bio page AND deep-links into the tree, auto-centered on and highlighting that person's node** — this is the core "payoff" moment connecting the graveside visit to the bigger family picture.
- Tap any node to see: name (CN/pinyin/EN), relationship to viewer, dates, and — if they have a grave record — a shortcut to their route/bio.
- **Phase 1 = view only.** Adding/correcting people happens through simple admin forms (not drag-and-drop tree editing). Collapsible branches so a huge tree doesn't overwhelm on a small screen.
- **Deferred to Phase 2:** in-tree drag-and-drop editing, merging duplicate/conflicting records, multi-admin conflict resolution — this is real UX complexity on its own and shouldn't block the Phase 1 wedge.

### 4.5 Generation Name (字辈) Tracker
- Family can define their generation naming poem/sequence (a string of characters, one assigned per generation).
- App auto-suggests the correct generation character for the next generation based on the tree depth, and shows which character was used by which generation historically.
- Editable/correctable by a designated family admin — this data will often be incomplete or disputed, so allow notes/uncertainty flags rather than forcing false precision.

### 4.6 Roles & Access
- Family "admin"(s) can invite members, edit tree/grave data.
- Regular members: view everything, propose edits (admin approves) — prevents vandalism/errors while staying low-friction.
- Data is private to the family group by default; QR bio pages are the one public-facing exception (necessary for graveside use).

## 5. Explicitly Out of Scope for Phase 1
- In-app chat (use existing WhatsApp/family groups)
- Event planning / RSVP
- Web app / bulk media sharing
- Hell money burning-by-proxy or any payment feature (legal/trust review required first)
- Multi-religion grave types beyond "just store an address" for Christian/Muslim plots (already solved for those users)

## 6. Success Metrics
- % of family graves recorded with GPS + photo within first season of use
- Return usage the following Ching Ming (does the app actually get opened once a year, or does it die like the tradition it's trying to save?)
- # of generation-name entries completed per family
- QR scans at graveside (proxy for "did this actually help someone find the grave")

## 7. Decisions (resolved)

**7.1 Multi-family membership**
A user can belong to more than one family group (e.g. tracking both sides after marriage, or informal/adoptive family circles). Not a headline feature, but the data model and account system support it from day one — `family_members` is a many-to-many join, not a one-to-one field on the user.

**7.2 Admin model**
No single designated "first admin" role baked into the product. Whoever creates a family group in the app automatically becomes its first admin. That admin can invite others and promote them to admin as well — admin status is per-family, and a user can be an admin of one family and a regular member of another.

**7.3 Data entry — no GPS capture requirement, photos optional**
No GPS survey work assumed for Phase 1 — that was the right call to cut, since accurate GPS capture at dense cemeteries would need dedicated fieldwork/budget. Instead:
- Grave/route data is entered by family admins, whenever and however they're able to visit.
- Photos of route landmarks are **optional, not required** — some families may be uncomfortable photographing gravesites. A pure text-based description ("100m past the big banyan tree, 3rd row") is a fully valid substitute for every route step.
- This means the app launches empty and grows entirely through family admins filling it in — no crowdsourced/public-pin model needed for Phase 1, since each family's graves are only relevant to that family anyway.

**7.4 Login method**
Email + Google sign-in for Phase 1 — free, no extra SMS service required, low setup complexity. Phone/SMS login can be added later if real usage shows people want it; the schema already has a `phone_number` field to support that without restructuring.

**7.5 UI language**
English + Chinese toggle from Phase 1. Decided early deliberately — retrofitting bilingual support after screens are built is far more expensive than building it in from the start. (This is separate from family data itself, e.g. names in Chinese characters, which was already supported regardless of UI language.)
