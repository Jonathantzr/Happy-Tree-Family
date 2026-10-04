# Happy Tree Family — Master Build Guide

This is your single reference document for the whole build. Keep it open/saved somewhere you can find it. When you start a new Claude chat, come back here first.

---

## HOW TO RESUME IN A NEW CHAT

Development is now done with **Claude Code inside VS Code** (since Stage 4.5f). Claude reads and edits the files itself — nothing needs attaching or pasting.

1. In VS Code, open the Claude Code panel and start a new chat (the + / "new chat" button at the top of the panel).
2. Type something like:

   > Read docs/happy-tree-family-master-guide.md, then start **[STAGE NAME HERE]**.

3. If something broke rather than just continuing, say that instead — describe or screenshot exactly what you see on the phone.

**How we work (rules for Claude):**
1. Read this guide first. The stage checklist and "CURRENT CODEBASE STATE" below say where things stand.
2. Claude makes the code changes directly; the owner tests on an Android phone through Expo Go and reports back with screenshots. Claude cannot see the phone — always say plainly what has NOT been tested on a device.
3. Explain like I'm 5: plain words, numbered steps, exact names of buttons and files.
4. For bigger design choices, give a recommendation and ask before building. The owner's suggestions are ideas, not exact wording to copy.
5. Database changes: write a file in `supabase/` and tell the owner to paste it into Supabase → SQL Editor → Run. Claude only has the app's public key and cannot see the database's functions or rules — when it needs to look at something, it gives the owner a query to run and paste back. Never ask for the database password or secret key.
6. Commit and push only when the owner says so.
7. Keep this guide updated (checklist + "CURRENT CODEBASE STATE") as part of every stage.
8. Every screen must follow the "DEVICE COMPATIBILITY & USABILITY RULES" section below, and every stage's test list must include those checks.

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
The app must look and feel like a normal, polished app people would happily download (proper navigation, consistent theme, logo slot) — not a functionality-only prototype. Functionality comes first, but the look-and-feel foundation (Stage 4.5) is built BEFORE the family tree; every new screen from Stage 5 onward must use lib/theme.js and the shared components from day one.

---

## KEY PRODUCT DECISIONS (the "why" behind the PRD/schema)

- **QR codes are for deceased people only, and only family admins can generate them.** They are shared as a printable image (WhatsApp, email, etc.) so relatives print and laminate them at home before Ching Ming. The memorial page is public, so the database function refuses to show anyone not marked deceased.
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
- **Relationship-linking (parent/sibling/spouse/child) moved ahead of biographies within Stage 2**, even though the roadmap originally grouped "People & Biographies" as one stage with relationships implied to come later (at Stage 5, the tree viewer). Reasoning: Stage 5 is a *viewer* for relationships that need to already exist — building it before any relationships are recorded would have nothing to draw. People are added relative to someone already in the tree (starting with yourself), via buttons like "+ Add Parent" / "+ Add Sibling" / "+ Add Spouse" / "+ Add Child" on a person's card — no artificial "how many people in your family" upfront step, since that doesn't capture how people relate to each other anyway.
- **Person names are captured as a single free-text field** (not separate Chinese/pinyin/English fields as originally scoped) — simpler data entry, works with any keyboard/script. Consequence for later: Stage 6 (Generation Name Book) will need to separately ask for a person's Chinese character when matching it against the family's naming poem, since it's no longer captured automatically as its own field.
- **Auto-linking parents (Stage 5a):** the app assumes a normal family and links the obvious second parent without asking — adding a child to someone married links the spouse too; adding a spouse to someone with single-parent children makes the spouse their parent too. It only asks when someone has more than one spouse. No setting for this, on purpose (a toggle would be confusing); messy cases (divorce, adoption, step-children) are fixed by removing the wrong link in the Edit form.
- **No "Living"/"Deceased" label shown by default** — a person's birth/death date (or date range) is shown instead, since that reads more naturally for a memorial app. "Deceased" only appears as a fallback when someone is marked deceased but no date is known at all.

---

## TECHNICAL & WORKFLOW DECISIONS

- **Stack: React Native (via Expo) + Supabase (Postgres-based).** Chosen specifically because the owner is open to eventually monetizing the app and handing it off to a third party/developer if it becomes self-sustaining — so standard, widely-known, portable tools were prioritized over convenient-but-locked-in ones. Firebase was explicitly considered and rejected for this reason (harder to migrate data off later; Postgres data is portable).
- **Platform priority: Android first** (owner's own phone). Partner has an iPhone — will be tested/polished once the Android build is in a solid place. Not a separate build from scratch either way, since Expo/React Native is one codebase for both.
- **Development is done with Claude Code in VS Code** (changed at Stage 4.5f; before that it was free Claude chat with manual copy-paste). Claude edits the files; the owner tests via the **Expo Go** app on Android (same WiFi network, or `--tunnel` mode if needed) and says when to commit and push to GitHub.
- The owner has some past coding background (attended 42, a coding bootcamp/academy, a few months, some years ago) but doesn't remember much — treat as a rusty beginner, not a fresh one. Comfortable with copy-pasting terminal commands when given exact instructions, but needs things spelled out step by step, not assumed.
- **Every future chat should give copy-pasteable commands and exact file contents/locations — never assume familiarity with tooling.**
- **Working style:** at the start of each stage/sub-stage, after Claude has whatever file contents it needs, it gives one standalone step-by-step document covering the whole stage (not piecemeal chat replies) — so testing and commits mostly happen without going back and forth in chat. Return to chat only when stuck on a specific step.
- **Master guide edits are given as find-and-replace snippets** (a line to Ctrl+F, then what to replace/insert), never as a full copy of the file — the full file wastes limited chat tokens.

---

## DEVICE COMPATIBILITY & USABILITY RULES (mandatory for every screen, every stage)

The app must work well on any phone, not just the owner's Android. Found in Stage 4 testing: the last button (Back) was hidden behind Android's navigation buttons. Rules:

- **Safe areas:** every screen keeps its content clear of the status bar, notch, Android navigation buttons/gesture bar and iPhone home indicator. Scrollable screens add bottom padding of at least 40 + the bottom safe-area inset (useSafeAreaInsets from react-native-safe-area-context). Non-scrolling screens use SafeAreaView or the same insets. The LAST button on any screen must always be fully visible and tappable.
- **Keyboards:** every screen with text fields uses KeyboardAvoidingView (behavior "padding" on iOS, "height" on Android) or an equivalent, inside a ScrollView with keyboardShouldPersistTaps="handled". The focused field AND the submit button must stay visible with the keyboard open, and tapping outside dismisses the keyboard. Set the right keyboardType, autoCapitalize and returnKeyType on each field.
- **Touch targets:** buttons and tappable rows are at least 48 x 48 dp with spacing between them, so fingers (including older relatives') can hit them.
- **Text size:** screens must still work when the phone's system font size is set to large. No fixed heights that clip text; long names wrap or truncate cleanly.
- **Screen sizes:** works on small phones (about 5 inches), tall phones and tablets-in-portrait, with nothing cut off or overlapping. Portrait is the supported orientation.
- **Light/dark mode:** every text and background colour is set explicitly (via lib/theme.js once it exists), so text never becomes unreadable when the phone is in dark mode.
- **No dead ends:** every screen has a clear way back, plus loading, empty and error states.
- **Existing screens** built before this rule get a compatibility pass in Stage 4.5, using a shared Screen wrapper component that handles safe areas and keyboard behaviour in ONE place. New screens use the wrapper from day one.
- **Test checklist for every stage:** (1) scroll to the bottom of every new screen and confirm the last button is visible; (2) open the keyboard on every form and confirm the field and submit button are visible; (3) set the phone's font size to large and check nothing is cut off; (4) try both Android navigation styles (3 buttons and gestures) if possible; (5) before the real family pilot, repeat on an iPhone and on at least one small-screen Android.

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

## SETUP & TROUBLESHOOTING
Part 1 (Node/GitHub/first app), Part 2 (Supabase setup) and the full troubleshooting notes are in `master-guide-archive.md` — only attach that file if setup breaks or a strange error appears. Reminder: always run `npx expo start --tunnel`.

## PART 3 — BUILDING THE ACTUAL APP (Stages 1–8)

These stages match the `find-my-grave-dev-roadmap.md` document. Each one needs Claude to write real code specific to that feature — so the pattern for every stage below is the same:

**The repeating pattern for every stage:**
1. Start a new chat (or continue current one) referencing this guide and saying which stage you're starting.
2. Claude gives you code — either new files to create, or exact changes to existing files.
3. You create/edit those files in VS Code exactly as instructed (copy-paste, following exact file names/locations given).
4. Run `npx expo start`, scan the QR code again, test on your phone.
5. Works as expected → commit & push (Source Control → message → checkmark → Sync).
6. Doesn't work / looks wrong → come back and describe/screenshot what happened instead.
7. Once a stage (or sub-stage) is fully working and committed, use your own discretion on whether to suggest a new chat:
   - If this chat is still short, just continue with the next step/stage in the same chat — no need to force a switch.
   - If the current step/stage/phase is getting long (lots of back-and-forth, long code blocks), find a natural checkpoint and suggest starting a new chat to keep things manageable.
   - Either way, when a new chat is warranted, guide me through exactly what to do: update this guide's checklist and "Current Codebase State" section to reflect what's done, commit those doc changes, then give me the exact copy-pasteable resume message to paste into the new chat (see "HOW TO RESUME IN A NEW CHAT" at the top).

**The stages, in order (see roadmap doc for full descriptions):**
- Stage 1 — Accounts & Families (sign up, create/join family, invites)
- Stage 2 — People & Biographies (add relatives, life summaries, photos)
- Stage 3 — Grave Route Finder (cemetery routes, landmark steps)
- Stage 4 — QR Codes (generate + scan to bio page)
- Stage 4.5 — Look & Feel Foundation (theme file, shared components incl. a Screen wrapper handling safe areas + keyboard, logo/icon/splash placeholders, bottom-tab navigation + Settings screen, Person screen replacing crowded cards, translation helper, compatibility pass on older screens)
- Stage 5 — Interactive Family Tree (visual tree, QR deep-link) — built with the theme + shared components from day one
- Stage 6 — Generation Name Book (字辈 tracker)
- Stage 7 — Bilingual Toggle & Final Polish (English/Chinese switch, restyle + translate older screens, empty/loading states, icons, animations)
- Stage 8 — Real Family Pilot (using it for real, no new code)
### ⚠️ Before Stage 8 (Real Family Pilot) — pre-launch checklist
- [ ] Choose the PERMANENT memorial web address (own domain ideally) BEFORE printing any QR. Update lib/qrConfig.js and point the domain at the memorial-site page. The Netlify site must be claimed with a Netlify account, or it gets deleted.
- [ ] **SECURITY (fix written as Stage 5f — run `supabase/stage5f-lock-down-tables.sql`, then reload the app and re-check the Advisor shows no red items):** Supabase's Advisor reports "RLS Disabled in Public" (critical) on families, family_members, persons, person_relationships, generation_books and generation_entries. Until row level security is switched on for these with proper rules, anyone holding the app's public key could read or change that data. Needs a database update plus a small app change (joining by code must go through a database function). The "Auth RLS Initialization Plan" warnings are only a speed tip and can wait.
- [ ] DECIDE before the pilot — joining needs approval: today anyone with the 6-character join code becomes a member instantly and can see the whole family. Safer: code-joiners (and any future "request to join" from the memorial page for long-lost relatives) wait as *pending* until a family admin approves them on the requests screen. Owner's idea, not built yet.
- [ ] Two-account tests (left until the end on purpose — needs a second login): join a family by code → "Are you already in…?" → link or add yourself; member sends "Request a change" → admin approves/rejects on Change requests; "This isn't me" unlinking; a member can't see other members' requests.
- [ ] Turn **Confirm email** back ON in Supabase (Authentication → Sign In / Providers → User Signups) — it was switched off during Stage 1b for easier testing.

Mark off each stage here as you complete it, so your "resume" message can just say the stage name:

- [X] Setup (Part 1)
- [X] Database connected (Part 2)
- [X] Stage 1 — Accounts & Families
  - [X] Stage 1a — Navigation shell (Welcome/Home screens wired up)
  - [X] Stage 1b — Email/password sign up, login, session persistence, logout
  - [X] Stage 1c — Create a family
  - [X] Stage 1d — Join a family via a short join code (in place of a formal invite system — no `invites` table exists in the schema)
- [X] Stage 2 — People & Biographies
  - [X] Stage 2a — People list + add a person (name, gender, living/deceased, date picker)
  - [X] Stage 2b — Linking people (parent/sibling/spouse/child relationships)
  - [X] Stage 2c — Biography view/edit
  - [X] Stage 2d — Photos
- [X] Stage 3 — Grave Route Finder
- [X] Stage 4 — QR Codes
- [X] Stage 4.5 — Look & Feel Foundation (iPhone test still to do — left for the end, before Stage 8)
    - [X] Stage 4.5a — Theme file (lib/theme.js) + shared Screen wrapper (components/Screen.js)
    - [X] Stage 4.5b — Translation helper plumbing (lib/i18n.js) — full bilingual toggle still deferred to Stage 7
    - [X] Stage 4.5c — Logo/icon/splash placeholders
    - [X] Stage 4.5d — Bottom-tab navigation (Families/Settings) + Settings screen
    - [X] Stage 4.5e — Person screen — all known gaps fixed: (a) Families tab has its own nested stack navigator, so the tab icon jumps to Home from any depth, and a "Family" header button on the Person screen jumps straight to that family's member list from any depth; (b) keyboard no longer dismisses on scroll; (c) "Add a Person" is now a floating + button that reveals the form; (d) link-picker wording and Cancel button position fixed, plus validation blocking contradictory links (e.g. spouse vs already parent/child) — PersonScreen.js's dedupe kept as a safety net. Known minor item: system "Large text" compatibility check not done this round — flagged for Stage 4.5f.
- Idea logged for Stage 5 (Interactive Family Tree): the flat person list in FamilyDetailScreen doesn't scale well for big families — plan for the tree view (already grouped by generation per the mockup rules) to be the real answer, rather than adding a second immediate/extended grouping scheme to the flat list.
    - [X] Stage 4.5f — Compatibility + polish pass on every screen (done with Claude Code). All screens now use the shared Screen wrapper and theme; new shared components AppButton, TextField, DateField, Avatar, EmptyState; HomeScreen restyled with cards and Log Out removed (it lives in Settings). Checked on the owner's Android phone; a doubled keyboard/bottom gap found there was fixed in components/Screen.js. Still to do before Stage 8: the iPhone test, and the system "Large text" check carried over from 4.5e if not already done.
- [ ] Stage 5 — Interactive Family Tree
    - [X] Stage 5a — Tree screen (built with Claude Code, checked by the owner on Android): drag/pinch-zoom tree, open/close branches, tap a person for their relationship to you + shortcuts, "Tree" button on the family list and on each Person screen (opens the tree centred on that person). Relationship labels now work at any distance ("Your great-grandmother · dad's side").
    - [X] Stage 5b — "Who am I" + change requests (database update run; single-account parts checked on Android; the two-account tests are in the pre-launch checklist). NEEDS the database update first: run `supabase/stage5b-who-am-i-and-requests.sql` in the Supabase SQL Editor. After sign-up you fill in your name, birth date and gender once ("Tell us about you"). Creating a family adds you as its first person automatically. Joining a family opens "Which one is you?" (possible matches by nickname/short name/birth date listed first) with a confirm popup; or "add me". If your details differ from the family's record, admins can update it on the spot and members send a change request. Members change their own entry via ⋯ → "Request a change"; admins approve/reject on the Change requests screen (banner on the family list). ⋯ menu also has "This is me" / "This isn't me".
    - [X] Stage 5c — Family-centred tree (checked by the owner on Android): opens on your immediate family (or the person you came from); "▲ Dad's side" / "▲ Mum's side" buttons open each side upwards (dad's family always left, mum's always right, so lines don't cross); "Hide" under opened parents closes it; "Their family" on the bottom card re-centres on anyone; "whole family" toolbar button keeps the old everyone view (with fold buttons). Bigger boxes with initials/photos, dashed "Unknown parent" boxes, one slim toolbar, readable zoom on open.
    - [X] Stage 5e — Multi-language-ready relationship engine (checked by the owner on Android). No database change. (A personal "What I call them" label feature was built alongside it and then removed at the owner's request — not wanted.)
    - [ ] Stage 5f — Database lock-down (built; NOT yet run/tested): `supabase/stage5f-lock-down-tables.sql` switches on row level security for families, family_members, persons, person_relationships, generation_books, generation_entries (members of a family only; logged-out visitors see nothing; public memorial page still goes through get_memorial). Joining by code now uses the database function `join_family(code)` (HomeScreen). New helper `htf_can_see_person`.
    - [ ] Stage 5d — QR scan → opens the app's tree on that person (deep link). Not started. Needs an app web-address scheme, so it can only be fully tested in a standalone build, not Expo Go.
- [ ] Stage 6 — Generation Name Book
- [ ] Stage 7 — Bilingual Toggle & Final Polish
- [ ] Stage 8 — Real Family Pilot

---

## CURRENT CODEBASE STATE (update this as you go)

- `lib/supabase.js` — Supabase client, reads keys from `.env` (`EXPO_PUBLIC_SUPABASE_URL`, `EXPO_PUBLIC_SUPABASE_ANON_KEY`). Uses AsyncStorage for session persistence.
`formatISOToDisplay`, `isoToDate`), the date-range text under a name (`formatPersonMeta`), and a Yes/No popup (`askYesNo`).
- `lib/theme.js` — shared style rulebook (colors, spacing, radius, fontSize, fontWeight, touchTarget) — jade green (#2F5D4E) + warm gold accent palette. New/updated screens should pull colors from here instead of hard-coding them.
- `components/Screen.js` — shared screen wrapper used by EVERY screen: background colour, safe areas, keyboard handling (iPhone: KeyboardAvoidingView offset by the title-bar height; Android: KeyboardAvoidingView "height"). Screens inside the bottom tabs skip the bottom safe-area padding because the tab bar already covers it. Props: `scroll`, `keyboardAvoiding`, `safeTop` (only for screens with no title bar, i.e. Welcome), `scrollRef`, `overlay` (floating + button), `refreshControl`.
- `components/AppButton.js` — the one button for the whole app (variants: primary, secondary, ghost, danger, dangerOutline; optional icon and loading spinner). Do not use React Native's built-in `<Button>` — it looks different on iPhone and Android.
- `components/TextField.js` (labelled text box), `components/DateField.js` (tap-to-pick date: Android calendar popup, iPhone scroll-wheel with Done, plus a clear button), `components/Avatar.js` (gold initial circle), `components/EmptyState.js` (icon + title + hint for empty/error states).
- Navigation notes (Stage 4.5f): title bars and screen backgrounds are themed once in `navigation/RootNavigator.js` (`headerOptions`, `navTheme`); Welcome has no title bar; FamilyDetail's title comes from the route. FamilyDetailScreen reloads its list whenever it comes back into view, and when its form was opened from a Person screen (Edit / + relative), saving or cancelling returns to that Person screen. The Person screen's ⋯ menu is now a bottom sheet.
- `lib/i18n.js` — translation helper plumbing (Stage 4.5b): `LanguageProvider` + `useTranslation()` hook with a small EN/ZH string dictionary. App always shows English for now — screens don't call `t()` yet; the full bilingual pass is Stage 7.
- `App.js` — wraps `RootNavigator` in `SafeAreaProvider` (react-native-safe-area-context) and `LanguageProvider` (lib/i18n.js).
- `app.json` — icon/splash/Android adaptive-icon assets replaced with jade-tree placeholders (Stage 4.5c); `expo-splash-screen` plugin configured pointing at `assets/splash.png`. Note: Expo Go always shows its own default loading screen while the JS bundle loads — the custom splash/icon only appears once built as a standalone app (near Stage 8).
- `navigation/RootNavigator.js` — switches between Welcome (logged out) and a logged-in area based on Supabase auth session. Logged-in area is now a bottom-tab navigator (`MainTabs`, Stage 4.5d) with "Families" (HomeScreen) and "Settings" (SettingsScreen) tabs, nested inside the top-level stack alongside FamilyDetail/Biography/GraveQR/GraveRoute (so those still push forward from either tab). Uses `@react-navigation/bottom-tabs` + `@expo/vector-icons`. Stage 4.5e update: the Families tab now has its own nested stack (FamiliesStackScreen) holding Home/FamilyDetail/Person/Biography/GraveQR/GraveRoute, so the tab icon jumps to Home from any depth. The Person screen's header has a "Family" button that jumps straight to that family's member list from any depth.
- `screens/SettingsScreen.js` — Settings tab (Stage 4.5d): language toggle (EN/中文 buttons via `lib/i18n.js`, cosmetic only until Stage 7) and a Log out button (`supabase.auth.signOut()`).
- `screens/WelcomeScreen.js` — email/password sign up + login form.
- `screens/HomeScreen.js` — shows the logged-in user's families (name + role), lets the user create a new family or join one by code, and tapping a family navigates to `FamilyDetailScreen`. Uses `families.join_code` in Supabase. Each family row has a "Copy" button (expo-clipboard) that copies the join code and shows "Copied" briefly (tracked per-family via `copiedId` state) instead of a popup, plus a two-line row layout (name+role, then join code+copy button) to stop content overflowing off-screen. Note: if changes here don't seem to apply after a restart, test via local WiFi (`npx expo start -c`, no `--tunnel`) first — ngrok tunnels were found to occasionally serve a stale cached bundle.
- `screens/FamilyDetailScreen.js` — shows the list of people in a family (from `persons`, filtered by `family_id`), each showing a birth/death date range under their name (falls back to "Deceased" only if no date is known, or shows nothing if there's no info at all). Form below adds a new person: single free-text Name field (auto-capitalizes), gender, living/deceased toggle, and a native tap-to-pick date for birth/death, allowing dates back to year 1500 (stored as YYYY-MM-DD, shown as DD/MM/YYYY). Stage 2b is built here too: each person card has + Parent / + Sibling / + Spouse / + Child (add a new person or link one already added), Edit, and Delete. One shared form at the bottom handles add/edit/link modes. Links show under each name (Parents, Siblings, Spouse, Children — siblings are derived from shared parents, not stored). + Sibling on someone with no parent creates an "Unknown parent of …" placeholder. Linking a parent who has a spouse asks whether the spouse is also a parent. Links can be removed from the Edit form. Only 'parent' and 'spouse' rows are stored in `person_relationships`.
- Note: this project requires `npx expo start --tunnel` every time (details in `master-guide-archive.md`).
- `lib/personHelpers.js` — small helper functions for the people screen: date formatting (`formatDateDisplay`, `toISODate`, `formatISOToDisplay`, `isoToDate`), the date-range text under a name (`formatPersonMeta`), and a Yes/No popup (`askYesNo`).
- Stage 2b is built inside `screens/FamilyDetailScreen.js`: person cards with + Parent / + Sibling / + Spouse / + Child (new or existing person), Edit, Delete; one shared form at the bottom; links shown under names (siblings are derived from shared parents); a placeholder "Unknown parent of …" is created when adding a sibling with no parent; the Edit form lets you remove links. Only 'parent' and 'spouse' rows are stored in `person_relationships`.
- `screens/BiographyScreen.js` — view/edit one person's biography (occupation, hometown, life summary) stored in `biographies` (one row per person, saved with upsert on `person_id`). Reached from the "Biography" button on each person card in `FamilyDetailScreen.js`; registered as `Biography` in `navigation/RootNavigator.js`. Row Level Security policies let only members of that person's family read/insert/update it. Photos: "Add photo" picks an image (expo-image-picker), uploads it to the public Supabase Storage bucket `bio-photos` at `<person_id>/<timestamp>.<ext>`, and stores the public links in `biographies.photo_urls`; long-press a photo to delete. Storage policies let only members of that person's family upload/delete.
- Uploads use base64 via the base64-arraybuffer package.
- screens/GraveRouteScreen.js — one grave per person (table graves) plus ordered breadcrumb steps (route_steps, optional photo per step, Up/Down reorder). Reached from the "Grave" button on each person card; registered as GraveRoute in RootNavigator.js. Step photos go in the public Storage bucket route-photos at <grave_id>/<timestamp>.<ext>. Row Level Security limits graves, steps and photo uploads to members of that person's family (public read is done via the Supabase function get_memorial(qr), not by opening these tables).
- memorial-site/index.html — public memorial page hosted free on Netlify (site claimed under my Netlify account; to update, log in to Netlify, open the site, Deploys tab, drag the folder). It reads one memorial via the Supabase function get_memorial(qr) using the anon key, and only returns people marked deceased.
- lib/qrConfig.js — holds MEMORIAL_BASE_URL (the Netlify address). QR value = that address + /?q=<graves.qr_code_uuid>.
- screens/GraveQRScreen.js — registered as GraveQR, reached from the "QR" button on person cards (shown only for deceased people). Deceased-only and family-admin-only. Shows a printable card, shares it as a PNG (react-native-view-shot + expo-sharing), also shares a link, and has in-app tips for making the printed QR last on the grave. Uses useSafeAreaInsets so the Back button isn't hidden by Android buttons. Known gap: there is no "make admin" screen yet, so only the family creator can make QR codes.
- `screens/PersonScreen.js` — new in Stage 4.5e: full-detail view for one person (green banner, relationship-to-viewer pill, Story/Directions/QR tiles, grave summary card when a grave exists, family list with computed relationship labels like Son/Mother/Aunt, "+ Add relative" chips, ⋯ menu for Edit/Delete). Reached by tapping a person in FamilyDetailScreen's list; registered as `Person` in RootNavigator.js. Sends the user back to FamilyDetailScreen (via `openEdit`/`openRelative` route params) to reuse its existing add/edit/link form. Header has a "Family" button for a one-tap jump to the member list.
- `screens/FamilyDetailScreen.js` — Stage 4.5e update: each person row is now a simple tappable row (avatar + name + dates) opening PersonScreen.js, instead of a wall of buttons. The add/edit/link form at the bottom is unchanged and auto-opens itself when arriving back from PersonScreen. A border now separates the people list from the form. The add/edit/link form is now hidden by default behind a floating + button (bottom-right) and auto-opens when arriving back from PersonScreen. Link-picker wording and Cancel position were clarified, and `linkExisting()` blocks contradictory links before saving.
- `lib/relationships.js` — Stage 5a: `buildGraph(people, relationships)` (quick parent/child/spouse lookups) and `describeRelation(graph, viewerId, targetId)` → `{ label, side }`, e.g. Great-grandmother / dad's side; covers ancestors, descendants, uncles/aunts, cousins, in-laws and step-relations. `relationText()` turns it into "Your …". Used by PersonScreen and TreeScreen — don't write relationship logic anywhere else.
- `lib/treeLayout.js` — Stage 5a: the maths for the tree drawing (no UI). Married people are grouped side by side, each generation is a row, children sit under their parents. When both husband and wife have parents in the tree, the couple hangs under one set and the other set is drawn as a neighbouring tree joined by a line. Returns boxes, lines and open/close buttons.
- `screens/TreeScreen.js` — Stage 5a: registered as `Tree` in the Families stack. Draws the layout with plain Views; drag and pinch-zoom use React Native's built-in PanResponder + Animated (no extra packages). Round buttons: zoom in/out, show whole tree, names/pictures switch (picture icon ↔ text icon; uses each person's first biography photo, falls back to the name; choice remembered on the phone via AsyncStorage), find me. Brothers/sisters are ordered eldest-left by birth date (no date = placed after those with one). Tapping a person shows a bottom card (relationship to you, dates, Open profile, Directions if they have a grave). Opened from the "Tree" button in FamilyDetail's title bar, or the "Tree" tile on a Person screen (route param `focusPersonId` centres and highlights that person). View-only by design.
- `supabase/` — database updates to paste into the Supabase SQL Editor (Stage 5b onwards). `stage5b-who-am-i-and-requests.sql`: adds `birth_date`, `gender`, `profile_complete` to `public.users` (and turns on its row level security: read/update your own row, read names of people sharing a family); functions `claim_person`, `release_person`, `review_change_request` (admins only), helpers `htf_is_member/htf_is_admin/htf_shares_family`; new table `change_requests` (family_id, person_id, requested_by, changes jsonb, note, status pending/approved/rejected).
- `lib/profile.js` — Stage 5b: `getMyProfile`, `saveMyProfile`, `claimPerson`, `releasePerson`, `addMeToFamily`, `matchScore` (nickname/short-name/birth-date matching), `profileDifferences`, `describeChanges`, `sendChangeRequest`.
- `navigation/RootNavigator.js` — Stage 5b: after login, if `users.profile_complete` is false the only screen is "Tell us about you" (ProfileScreen). If the profile can't be read (database update not run) it lets you in anyway. Root stack also has `Profile` (Settings → Your details). Families stack adds `Claim`, `Requests`, `RequestChange`.
- `screens/ProfileScreen.js` (your details), `screens/ClaimScreen.js` ("Which one is you?"), `screens/RequestChangeScreen.js` (member asks for their entry to change), `screens/RequestsScreen.js` (admins approve/reject; members see their own) — Stage 5b. `components/GenderPicker.js` — shared Male/Female/Other buttons.
- `screens/PersonFormScreen.js` — Stage 5c: the ONE add/edit-person form (registered as `PersonForm`, params `familyId`, `mode` = add | edit | parent | child | spouse | sibling, `personId`). Replaced the old form at the bottom of FamilyDetailScreen (FamilyDetail is now just the list + banners; its + button opens PersonForm). Opens the same way from every entry point. For relatives, the new-person form shows first; "Already in the family?" (collapsed) only lists people who could actually fit — `linkCandidates()` in lib/relationships.js leaves out anyone already a blood relative or married to one, in-laws, the wrong generation, or born on the wrong side. Edit mode shows Family links with Remove. Auto-linking of the second parent lives here now.
- `lib/relationships.js` — Stage 5c additions: `generationsOf`, `siblingIdsOf`, `linkCandidates`, `relationPath` (shortest chain of people between two people) and `explainRelation` (summary "X is your cousin (dad's side)", the key sentence "Your dad (A) and X's dad (B) are brothers.", and every step "B is A's son…").
- Tree toolbar (Stage 5c): fit-to-screen and names/pictures only. Selecting people: tap a box to select it (green border), tap again to unselect, up to two at once (a third replaces the first). One selected: bottom card with details, "How are we related?" link (from you), Profile / Their family / Grave. Two selected: card with both names and a "How are they related?" button. The gold highlight follows the tree's own lines (child → bar under the parents → that one parent; brothers/sisters joined along the bar under their parents, not via a parent's box). Explanation from `explainRelation()`: summary, one key sentence (e.g. "Your dad (Dad) and Nat's dad (Daniel Tan) are brothers.") and "Show every step" only when there's more than one step; brothers/sisters are a single step naming both parents. Top-left switch "My family | Everyone": tapping either always resets the view (all opened sides/folds closed, My family back to you) and switches instantly, no sliding. Zoom buttons removed (pinch instead). "Hide" buttons only on the newest opened level and one per side. `layoutTree` returns `childLinks` (each child's line up to its parents) for the highlight.
- Stage 5e — relationship engine: `relationFacts()` in lib/relationships.js returns FACTS, no words: kind (blood / spouse / spouseOfBlood / bloodOfSpouse / marriage / none), up, down, side (father/mother), upChain + downChain (gender of everyone along the line), gender, age and branchAge (older/younger/unknown from birth dates). Words come from one file per language in `lib/relationWords/` (only `en.js` so far) registered in `LANGUAGES`. To add Malay/Chinese/Tamil: copy en.js, translate, register — no logic changes. English style: uncles/aunts are spelled out ("Dad's elder brother", "Mum's sister" when ages unknown), siblings "Elder brother"; marriage-only people are never cousins/uncles — "Cousin's husband", "Wife's cousin", and further out "Related through [name]'s marriage".
- Family list (FamilyDetailScreen, Stage 5f): search box (appears once there are more than 6 people; searches everyone). Once you are linked to a person: "Your immediate family" first (you, spouse, parents, siblings, children) with each person's relationship to you, then folded sections "Dad's side", "Mum's side", "Other relatives" with counts. Not linked yet: one A–Z list.
- `lib/treeLayout.js` — Stage 5c: `familyView(graph, centreId, openIds)` decides who is shown in the family-centred view and where the "▲ side" / "Hide" buttons go; `layoutTree(..., { anchorId })` puts each father's family left and mother's right as seen from that person.
---
---

