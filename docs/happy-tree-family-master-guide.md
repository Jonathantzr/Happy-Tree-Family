# Happy Tree Family — Master Build Guide

This is your single reference document for the whole build. Keep it open/saved somewhere you can find it. When you start a new Claude chat, come back here first.

---

## HOW TO RESUME IN A NEW CHAT

When your free usage resets and you need to start a new conversation, do this:

1. Start a new chat with Claude.
2. Attach/paste this document, plus the other project files if you have them handy: the PRD (`find-my-grave-PRD-phase1.md`), the database schema (`find-my-grave-db-schema.sql`), and the roadmap (`find-my-grave-dev-roadmap.md`). (Tip: see "Keep Your Files Together" below — if they're saved in your GitHub repo, this gets much easier.)
3. Copy-paste this exact message, filling in the blank:

   > I'm building an app called Happy Tree Family — attached is the master guide, PRD, database schema, and roadmap. I've completed up to **[STAGE/PHASE NAME HERE]**. Please pick up from there and give me the next step-by-step instructions, written for a non-technical beginner working in VS Code. I don't have a paid Claude plan, so no Claude Code — just give me copy-pasteable commands and clear instructions.

4. If something broke or you're stuck rather than just continuing, say that instead — describe or screenshot exactly what you see.

**Important — how to explain things to me:**
I have some old coding background but I'm rusty and not confident. Please explain everything as if I'm a complete beginner — don't assume I know what a term means just because it sounds common (e.g. explain what "commit," "terminal," "package," "session" mean in context if you use them). Always give exact copy-pasteable commands and exact file locations, not just descriptions of what to do.

---

## PROJECT VISION & CONTEXT (so a new chat understands the full picture, not just the specs)

### The personal story behind this app
The app owner is based in KL and returns to Segamat every year for Ching Ming (all souls' day) to pay respects to ancestors. Christian graves are no problem — lot numbers are known. **Buddhist cemeteries are the real problem**: layouts are informal, "everything is everywhere," and only certain older relatives ("uncles") know exact grave locations from memory. As the family becomes less traditional and the eldest generation (the last surviving grandparent) passes on, that knowledge is at real risk of being lost permanently, and fewer people are making the trip at all. This app exists to capture that knowledge before it disappears — not as a generic genealogy product.

### Naming history
Originally called "Find My Grave" (intentionally morbid-but-funny). Renamed to **Happy Tree Family** — a play on the cartoon *Happy Tree Friends*, same dark-comedy spirit. Note: before any public/commercial launch, do a trademark check — Happy Tree Friends is a registered trademark held by Mondo Media. Not a blocker for building, just don't skip it before shipping publicly.

### Target users & why scope was deliberately narrowed
Original vision was much bigger: family event planning, in-app chat, family history records, grave locator, QR bio pages, a full family tree (including relatives in China no one here has met), a generation-naming guide, and even — half-jokingly, inspired by COVID lockdown — accepting Buddhist hell money burning by proxy on a family's behalf. Web app for photo/video sharing was also floated.

That got deliberately cut down. Reasoning that should persist across all future work:
- **Chat was cut** — reinventing WhatsApp gets a worse WhatsApp nobody switches to.
- **Event planning and media sharing** were identified as scope creep — pushed to a possible future phase.
- **Hell money burning-by-proxy** was identified as a legal/trust minefield (payment handling, "did they actually do it" trust issues, temple/cemetery regulations) — deferred indefinitely, needs real legal review before ever being considered again.
- **The grave locator is the actual differentiator.** Family tree apps already exist (MyHeritage, FamilySearch). Nothing else solves "the person who knew where the plot is has passed, and now no one does." Every scoping decision should protect this core value, not dilute it.

### Target audience — race/culture scope (important, nuanced)
Original target was Malaysian-Chinese, aged 30–60. The owner later said they'd like this to eventually cover **all Malaysian races — Malay, Chinese, and Indian — in Phase 1 if feasible**, then possibly expand globally later.

**Current decision: build the original Chinese-centric framework first. Multi-race adaptation is explicitly deferred**, pending real human input from Malay and Indian friends/contacts — not something to guess at from research alone. Important research findings already surfaced, to inform that future work when it happens:
- **Malay (Muslim) burials** are typically already organized on a grid with plot markers in state-managed cemeteries — the "everything is everywhere" wayfinding problem is much less severe here. Also, Islamic burial custom discourages elaborate/monumental grave markers, so mounting a QR code directly on a Muslim grave may not be culturally appropriate — would need a lighter-touch or optional solution.
- **Malaysian Indians (majority Hindu)** typically practice cremation with ashes scattered at sea — **there is often no physical grave at all.** The "grave route finder" concept doesn't map onto this ritual. A future adaptation would likely need to anchor to a home shrine, temple, or the remembrance occasion itself instead of a physical burial site.
- Do not build culturally-specific features/copy for these communities without validating with real people from them first.

### Design style
Simple, modern, with a touch of traditional — not sterile/generic, not overly ornate either.

---

## KEY PRODUCT DECISIONS (the "why" behind the PRD/schema)

- **No GPS pins for the grave locator — deliberately.** GPS accuracy in dense, informally-laid-out cemeteries can be off by enough meters to mean the wrong row. Instead: a **photo/landmark breadcrumb trail** — e.g. "take Waze/Google Maps to the cemetery → here's which entrance (photo if there's more than one) → park near this landmark (photo) → walk ~100m past this tree → tombstone is here." Photos are **optional, not required**, per step — some families won't want to photograph gravesites, so a pure text description is a fully valid substitute.
- **QR code on the tombstone** resolves to a bio page: who this person was, their relationship to the viewer (computed, not manually typed each time — see below), dates, a short life summary, photos. Publicly viewable without login (so any relative present can scan it), editable only by logged-in family members.
- **Relationship-to-viewer labels (e.g. "great-grandmother, dad's side") are computed on the fly** by walking the parent/spousal relationship graph from the viewer to the target person — never hand-typed or stored as a static label.
- **Interactive family tree is Phase 1, but view-only.** Spans immediate, extended, and overseas branches (including relatives in China no one locally has met). Scanning a grave's QR code should deep-link straight into the tree, auto-centered and highlighted on that person — this is meant to be the emotional "payoff" moment connecting a graveside visit to the bigger family picture. Full drag-and-drop editing, merging duplicate records, and multi-admin conflict resolution are deliberately deferred to Phase 2 — real UX complexity that shouldn't block the core wedge.
- **Generation Name Book (字辈/辈分):** tracks a family's generational naming poem/sequence (example given: owner is "Tan Zhi Ren," children would be "Tan En ___," where the character comes from a family naming book many people have lost track of). The app suggests the correct character for the next generation based on tree depth, but never auto-assigns — always human-confirmed, since these records are often incomplete or disputed within families. Supports an "unconfirmed/disputed" flag rather than forcing false precision.
- **Multi-family membership is supported but not a headline feature** — a user can belong to more than one family group (e.g. tracking both sides after marriage). Reasoning given: even loosely-defined/informal "family" groupings (the owner mentioned old Facebook-era jokes of adding friends as siblings) should be technically possible even if not the target use case.
- **Admin model:** whoever creates a family group automatically becomes its first admin, and can invite/promote others to admin. Admin status is per-family, not global — a user can be an admin of one family and a regular member of another.
- **No GPS survey work and no crowdsourced/public-pin model for Phase 1.** Each family's grave/route data is only relevant to that family anyway, so the app launches empty and grows entirely through family admins entering their own data whenever they're able to visit.
- **Login: Email + Google sign-in** for Phase 1 (free, simple) — Phone/SMS was considered but requires a paid SMS service at scale, deferred unless real usage demands it.
- **UI language: English + Chinese toggle from Phase 1**, decided early deliberately since retrofitting bilingual support after screens are built is much more expensive than building it in from the start. (Separate from family data itself — names in Chinese characters were always supported regardless of UI language.)
- **Auto-matching/consolidating duplicate edit requests** (e.g. two family members separately adding the same relative) is deliberately deferred to Phase 2, same as the tree-editing conflict resolution already noted above — a simple "pending request queue" approach is enough for Phase 1, admin can eyeball duplicates manually.

---

## TECHNICAL & WORKFLOW DECISIONS

- **Stack: React Native (via Expo) + Supabase (Postgres-based).** Chosen specifically because the owner is open to eventually monetizing the app and handing it off to a third party/developer if it becomes self-sustaining — so standard, widely-known, portable tools were prioritized over convenient-but-locked-in ones. Firebase was explicitly considered and rejected for this reason (harder to migrate data off later; Postgres data is portable).
- **Platform priority: Android first** (owner's own phone). Partner has an iPhone — will be tested/polished once the Android build is in a solid place. Not a separate build from scratch either way, since Expo/React Native is one codebase for both.
- **No Claude Code, no paid Claude plan.** The owner does not want to pay for Claude Code or GitHub Codespaces. All development happens via: Claude (free chat) providing code/instructions → owner manually implementing them in **VS Code**, which is already installed → testing via the **Expo Go** app on Android (same WiFi network, or `--tunnel` mode if needed) → committing/pushing to GitHub manually via VS Code's Source Control panel.
- The owner has some past coding background (attended 42, a coding bootcamp/academy, a few months, some years ago) but doesn't remember much — treat as a rusty beginner, not a fresh one. Comfortable with copy-pasting terminal commands when given exact instructions, but needs things spelled out step by step, not assumed.
- **Every future chat should give copy-pasteable commands and exact file contents/locations — never assume familiarity with tooling.**

---

## DEFERRED / FUTURE PHASES (don't build these yet, but keep in mind for architecture decisions)
- Phase 2: editable/collaborative family tree, expanded overseas branches, family history documents, offline map caching for cemetery visits.
- Phase 3: event planning (Ching Ming trip coordination/RSVP), web app for photo/video sharing.
- Phase 4 (maybe, maybe never): hell money burning-by-proxy — only after real legal/trust-model review.
- Malay & Indian community-specific adaptation — pending human validation from people in those communities, per the notes above.
- App Store / Play Store submission (Apple charges $99/year, Google a one-time $25) — not relevant until much later.

---

Rather than juggling downloaded files, save them inside your project folder so they travel with your code and are visible on GitHub too:

1. Inside your `happy-tree-family` folder (the one VS Code has open), create a new folder called `docs`.
2. Move/save these files into it: this master guide, the PRD, the database schema, the roadmap, the wireframes, the user flow diagram.
3. In VS Code's Source Control panel, commit and push (same as Phase 5 below) with a message like `Add project docs`.
4. Now everything lives at `github.com/yourname/happy-tree-family/docs` — viewable anytime, and easy to reference in new chats by just saying "check the docs folder in my repo" (Claude will need you to paste contents in, as it can't browse your private repo directly — but at least you'll always know where to find them).

---

## PART 1 — SETUP (Node, GitHub, first blank app running)

### Phase 1 — Check/install Node.js
1. Open VS Code → **Terminal → New Terminal**.
2. Type `node -v` and press Enter.
3. Version number shown → done, skip to Phase 2.
4. Error shown → install from https://nodejs.org (LTS version), restart PC, retest.

### Phase 2 — Clone your GitHub repo into VS Code
1. On github.com, open your `happy-tree-family` repo (empty repos still have this).
2. Click green **Code** button → **HTTPS** tab → copy the URL.
3. In VS Code: `Ctrl+Shift+P` → type `Git: Clone` → paste URL → choose a save folder → **Open** when prompted.

### Phase 3 — Create the app project
1. Terminal in VS Code, confirm you're inside the `happy-tree-family` folder.
2. Run: `npx create-expo-app@latest . --template blank`
3. Accept any defaults, wait for it to finish.

### Phase 4 — Run it and see it on your phone
1. Run: `npx expo start`
2. Scan the QR code shown using the **Expo Go** app on your Android phone.
3. A blank/plain screen loading on your phone = success.
4. `Ctrl+C` in terminal to stop it later.

### Phase 5 — Save progress to GitHub
1. VS Code → **Source Control** icon (left sidebar).
2. Type a commit message (e.g. `Initial Expo project setup`).
3. Click the checkmark (**Commit**), then **Sync Changes** / **Push**.
4. Refresh your repo on github.com to confirm files are there.

**✅ Checkpoint: "Setup complete" — you should have a blank app running on your phone, and code saved on GitHub.**

---

## PART 2 — CONNECT THE DATABASE (Supabase)

### Phase 6 — Create your Supabase project
1. Go to supabase.com, log in (you've already connected your account).
2. Click **New Project**. Name it `happy-tree-family`, set a database password (save it somewhere safe — a notes app is fine), pick a region close to Malaysia (e.g. Singapore).
3. Wait a minute or two for it to finish setting up.

### Phase 7 — Load the database structure
1. In your Supabase project, click **SQL Editor** in the left sidebar.
2. Open the `find-my-grave-db-schema.sql` file (from earlier in this project) in VS Code, copy its entire contents.
3. Paste it into the Supabase SQL Editor, click **Run**.
4. Check the **Table Editor** in Supabase — you should now see tables like `persons`, `graves`, `route_steps`, etc.

### Phase 8 — Connect your app to Supabase
1. In Supabase, go to **Project Settings → API**. Copy the **Project URL** and the **anon public key**.
2. In VS Code terminal (inside your project folder), run:
   ```
   npx expo install @supabase/supabase-js
   ```
3. Come back to a new Claude chat at this point and say you've reached Phase 8 — Claude will give you the exact code file to create that connects your app to these keys (this part needs real code written, not just commands).

**✅ Checkpoint: "Database connected" — your app can now talk to a real database.**

---

## PART 3 — BUILDING THE ACTUAL APP (Stages 1–8)

These stages match the `find-my-grave-dev-roadmap.md` document. Each one needs Claude to write real code specific to that feature — so the pattern for every stage below is the same:

**The repeating pattern for every stage:**
1. Start a new chat (or continue current one) referencing this guide and saying which stage you're starting.
2. Claude gives you code — either new files to create, or exact changes to existing files.
3. You create/edit those files in VS Code exactly as instructed (copy-paste, following exact file names/locations given).
4. Run `npx expo start`, scan the QR code again, test on your phone.
5. Works as expected → commit & push (Source Control → message → checkmark → Sync).
6. Doesn't work / looks wrong → come back and describe/screenshot what happened instead.
7. Once a stage (or sub-stage) is fully working and committed, suggest starting a new chat to keep conversations short and Claude's usage efficient. If so, guide me through exactly what to do: update this guide's checklist and "Current Codebase State" section to reflect what's done, commit those doc changes, then give me the exact copy-pasteable resume message to paste into the new chat (see "HOW TO RESUME IN A NEW CHAT" at the top).

**The stages, in order (see roadmap doc for full descriptions):**
- Stage 1 — Accounts & Families (sign up, create/join family, invites)
- Stage 2 — People & Biographies (add relatives, life summaries, photos)
- Stage 3 — Grave Route Finder (cemetery routes, landmark steps)
- Stage 4 — QR Codes (generate + scan to bio page)
- Stage 5 — Interactive Family Tree (visual tree, QR deep-link)
- Stage 6 — Generation Name Book (字辈 tracker)
- Stage 7 — Bilingual Toggle & Polish (English/Chinese switch, visuals)
- Stage 8 — Real Family Pilot (using it for real, no new code)
### ⚠️ Before Stage 8 (Real Family Pilot) — pre-launch checklist
- [ ] Turn **Confirm email** back ON in Supabase (Authentication → Sign In / Providers → User Signups) — it was switched off during Stage 1b for easier testing.

Mark off each stage here as you complete it, so your "resume" message can just say the stage name:

- [X] Setup (Part 1)
- [X] Database connected (Part 2)
- [ ] Stage 1 — Accounts & Families
  - [X] Stage 1a — Navigation shell (Welcome/Home screens wired up)
  - [X] Stage 1b — Email/password sign up, login, session persistence, logout
  - [ ] Stage 1c — Create a family
  - [ ] Stage 1d — Join a family via a short join code (in place of a formal invite system — no `invites` table exists in the schema)
- [ ] Stage 2 — People & Biographies
- [ ] Stage 3 — Grave Route Finder
- [ ] Stage 4 — QR Codes
- [ ] Stage 5 — Interactive Family Tree
- [ ] Stage 6 — Generation Name Book
- [ ] Stage 7 — Bilingual Toggle & Polish
- [ ] Stage 8 — Real Family Pilot

---

## CURRENT CODEBASE STATE (update this as you go)

- `lib/supabase.js` — Supabase client, reads keys from `.env` (`EXPO_PUBLIC_SUPABASE_URL`, `EXPO_PUBLIC_SUPABASE_ANON_KEY`). Uses AsyncStorage for session persistence.
- `navigation/RootNavigator.js` — switches between Welcome (logged out) and Home (logged in) screens automatically based on Supabase auth session.
- `screens/WelcomeScreen.js` — email/password sign up + login form.
- `screens/HomeScreen.js` — placeholder "logged in" screen with a Log Out button. This is where Stage 1c/1d (create/join family) should be built.
- Note: this project requires `npx expo start --tunnel` every time (see Troubleshooting).

---

## TROUBLESHOOTING NOTES
- If `npx expo start` shows errors mentioning missing packages, try running `npm install` first, then `npx expo start` again.
- If the QR code won't scan/connect, make sure your phone and PC are on the **same WiFi network**. If they're not (or can't be), add `--tunnel` to the command: `npx expo start --tunnel`.
- **This project specifically needs `--tunnel` every time** — plain `npx expo start` gives "Cannot connect to Expo CLI" on this setup. Always run `npx expo start --tunnel` instead.
- If VS Code's Source Control panel shows nothing to commit, it means nothing changed since your last push — that's fine, not an error.
- When in doubt, screenshot what you're seeing and bring it to Claude rather than guessing.
