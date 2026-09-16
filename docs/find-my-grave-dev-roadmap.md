# Happy Tree Family — Development Roadmap (Phase 1)

Written for a non-technical reader: each stage says what gets built and — more importantly — **what you'll actually be able to do/test on your phone at the end of it.** We build in this order because each stage depends on the one before it; there's no point building the grave finder before people can log in and create a family.

---

### Stage 0 — Foundation (no visible app yet)
**What happens:** Expo project created, connected to your GitHub. Supabase database set up using the schema already designed. Basic app shell that opens and shows a blank screen.
**You'll be able to:** Open the app on your phone via Expo Go and see it launch. Nothing functional yet — this is plumbing.

### Stage 1 — Accounts & Families
**What happens:** Email + Google sign-in. Create a family group. Invite others by link/code. Admin role assignment (whoever creates the family = first admin).
**You'll be able to:** Sign up, create "Tan Family," and invite a second account (e.g. your own second email, or a family member) to join it.

### Stage 2 — People & Biographies
**What happens:** Add a person record (name in Chinese + pinyin + English, dates, deceased/living toggle). Add a short life-summary biography with photos.
**You'll be able to:** Add your grandparents and a few relatives as records, write a short bio for one of them, upload a photo.

### Stage 3 — Grave Route Finder
**What happens:** Attach a grave to a person. Add the route: map link to the cemetery, then ordered steps (each with optional photo + text direction). View the route as a walkthrough.
**You'll be able to:** Create a real route for one of your Segamat ancestors — enter the cemetery name, add "enter via east gate," "park near red building," etc., and scroll through it like a mini guide.

### Stage 4 — QR Codes
**What happens:** Auto-generate a QR code per grave. Scanning it (or tapping "preview" in-app before you've printed anything) opens that person's bio page — publicly viewable, editable only by family members.
**You'll be able to:** Generate a QR code, scan it with your phone's camera, and see the bio page pop up exactly as a relative at the grave would.

### Stage 5 — Interactive Family Tree
**What happens:** Visual tree view built from your person records and relationships. Pan/zoom, collapsible branches. QR scan deep-links into the tree, centered and highlighted on that person.
**You'll be able to:** See your test family laid out as an actual tree, tap between generations, and confirm the "scan QR → jump to this person in the tree" moment works end to end.

### Stage 6 — Generation Name Book
**What happens:** Set up your family's generation-name sequence (字辈). App suggests the correct character for the next generation based on a person's place in the tree.
**You'll be able to:** Enter your family's naming poem, and see the app correctly suggest a character for a hypothetical next-generation child.

### Stage 7 — Bilingual Toggle & Polish
**What happens:** English/Chinese language switch applied across all screens built so far. Visual polish — colors, icons, app branding — layered on top of the wireframe layouts.
**You'll be able to:** Flip the whole app between English and Chinese, and see it start looking like a real app instead of a wireframe.

### Stage 8 — Real Family Pilot
**What happens:** No new features — this is you (and willing relatives) actually using it with real data ahead of/during your next Ching Ming trip.
**You'll be able to:** Find out what's actually broken or annoying in real use, which matters more than anything I can guess at from here.

---

### After Phase 1 (not started yet, just so it's visible)
- iPhone-specific testing/polish (partner's phone)
- Editable/collaborative family tree
- Malay & Indian community adaptation (pending the human-touch research you mentioned)
- App Store / Play Store submission (developer fees apply at this point)

---

**How we'll actually work through this:** one stage at a time, in this chat or via Claude Code once code needs to run on your machine. Don't feel like you need to fully understand each technical piece — your job at each stage is to test it on your phone and tell me what feels wrong, not to review the code.
