// lib/nameBook.js
// Generation Name Book (字辈) logic — no UI. A family's naming poem gives one
// character per generation. The poem is lined up with the tree from ONE person
// whose character is known (the "anchor"); everyone else is counted from them.
// The poem follows the father's line only: a man's children (sons AND
// daughters) are in it, a daughter's children and people who married in are not.
// Everything here is a suggestion — nothing is ever written into a name.

import { supabase } from './supabase';
import { findCharacters } from './characterSounds';

function isChineseCharacter(ch) {
  const cp = ch.codePointAt(0);
  return (cp >= 0x3400 && cp <= 0x9fff) || (cp >= 0xf900 && cp <= 0xfaff) || (cp >= 0x20000 && cp <= 0x323af);
}

// Is this generation written in Chinese ("志") or only by its sound ("Zhi")?
export function isChinese(text) {
  return !!text && isChineseCharacter(text);
}

// One piece per generation: every Chinese character is one, and so is every
// word in English letters — for families who only know how a generation name
// sounds. "文德 Zhi, En" -> ['文', '德', 'Zhi', 'En']. Punctuation is ignored.
export function splitPoem(text) {
  const pieces = [];
  let word = '';
  for (const ch of Array.from(text || '')) {
    if (/[A-Za-zÀ-ɏ]/.test(ch)) {
      word += ch;
      continue;
    }
    if (word) pieces.push(word);
    word = '';
    if (isChineseCharacter(ch)) pieces.push(ch);
  }
  if (word) pieces.push(word);
  return pieces;
}

// The family's book and its characters in order. { book: null, entries: [] }
// when there is none yet (or the Stage 6 database update hasn't been run).
export async function loadNameBook(familyId) {
  const { data: book, error } = await supabase.from('generation_books').select('*').eq('family_id', familyId).maybeSingle();
  if (error || !book) return { book: null, entries: [], error: error || null };
  const { data: entries, error: entriesError } = await supabase
    .from('generation_entries')
    .select('*')
    .eq('generation_book_id', book.id)
    .order('generation_index', { ascending: true });
  return { book, entries: entries || [], error: entriesError || null };
}

function fatherOf(graph, id) {
  const parents = graph.parentsOf(id).map((pid) => graph.byId.get(pid)).filter(Boolean);
  const father = parents.find((p) => p.gender === 'M');
  if (father) return father.id;
  // gender not filled in: the one parent who isn't the mother
  const notMothers = parents.filter((p) => p.gender !== 'F');
  return notMothers.length === 1 ? notMothers[0].id : null;
}

// Does this person hand the family's character on to their children?
function passesOn(graph, id) {
  return graph.byId.get(id)?.gender !== 'F';
}

// Map of person id -> position in the poem (0 = first character) for everyone
// on the father's line. Positions can fall before the poem (negative) or after
// its end. Empty when the book hasn't been lined up with anyone yet.
export function lineGenerations(graph, book) {
  const line = new Map();
  const anchorId = book?.anchor_person_id;
  if (!anchorId || book.anchor_index == null || !graph.byId.has(anchorId)) return line;

  // up to the earliest known forefather...
  let top = anchorId;
  let index = book.anchor_index;
  const seen = new Set([top]);
  for (let father = fatherOf(graph, top); father && !seen.has(father); father = fatherOf(graph, top)) {
    seen.add(father);
    top = father;
    index -= 1;
  }

  // ...then down through every man's children
  line.set(top, index);
  const queue = [top];
  while (queue.length) {
    const cur = queue.shift();
    if (!passesOn(graph, cur)) continue;
    for (const kid of graph.childrenOf(cur)) {
      if (line.has(kid) || fatherOf(graph, kid) !== cur) continue;
      line.set(kid, line.get(cur) + 1);
      queue.push(kid);
    }
  }
  return line;
}

function nameWords(person) {
  return (person?.name_en || person?.name_pinyin || '').split(/[^A-Za-zÀ-ɏ]+/).filter(Boolean);
}

// A guess at which part of someone's name is their generation name, for the
// "What is a generation name?" explanation: { name, word, sure }.
// sure = true: a brother, sister or cousin on the father's side has the same
// word and the father doesn't (so it isn't the surname).
// sure = false: nobody to compare with — the middle of the last three words,
// "Jon Tan Zhi Ren" -> "Zhi", which is the usual place but not always.
// null when the name is too short to tell.
export function guessGenerationName(graph, personId) {
  const person = graph.byId.get(personId);
  const words = nameWords(person);
  if (words.length < 3) return null;
  const name = words.join(' ');
  const lower = (list) => list.map((w) => w.toLowerCase());

  const father = fatherOf(graph, personId);
  const fatherWords = new Set(father ? lower(nameWords(graph.byId.get(father))) : []);
  const grandfather = father ? fatherOf(graph, father) : null;
  const fathers = [father, ...(grandfather ? graph.childrenOf(grandfather).filter((id) => graph.byId.get(id)?.gender === 'M') : [])].filter(Boolean);
  const peerWords = new Set();
  for (const f of new Set(fathers)) {
    for (const kid of graph.childrenOf(f)) {
      if (kid !== personId && fatherOf(graph, kid) === f) lower(nameWords(graph.byId.get(kid))).forEach((w) => peerWords.add(w));
    }
  }
  // the given name is the last two words; the surname sits before them
  const given = words.slice(-2);
  const shared = given.find((w) => peerWords.has(w.toLowerCase()) && !fatherWords.has(w.toLowerCase()));
  if (shared) return { name, word: shared, sure: true };
  return { name, word: given[0], sure: false };
}

// Position in the poem for a child of this person: taken from the person
// themself or, for someone who married in, from their husband. null = this
// family's poem doesn't apply to their children.
export function childIndexOf(graph, line, personId) {
  const candidates = [personId, ...graph.spousesOf(personId)].filter((id) => line.has(id) && passesOn(graph, id));
  return candidates.length ? line.get(candidates[0]) + 1 : null;
}

// What to show for one position: { status: 'ok', entry } | 'before' (older
// than the first character) | 'after' (the poem has run out) | 'none'.
export function characterAt(entries, index) {
  if (index == null || !entries.length) return { status: 'none' };
  if (index < 0) return { status: 'before' };
  const entry = entries.find((e) => e.generation_index === index);
  return entry ? { status: 'ok', entry } : { status: 'after' };
}

// One-line hint for a form or a card, e.g. "恩 (en)" / "恩 (en) — not confirmed".
export function characterText(entry) {
  if (!entry) return '';
  const pinyin = entry.character_pinyin ? ` (${entry.character_pinyin})` : '';
  return `${entry.character_cn}${pinyin}${entry.is_confirmed === false ? ' — not confirmed' : ''}`;
}

// Does this person's name use the generation name? true / false when it can
// be told, null when it can't. A Chinese character is looked for in their
// Chinese name; a sound ("Zhi") is looked for as a word in their usual name —
// and never counts against them, since people go by nicknames.
export function usesCharacter(person, entry) {
  if (!person || !entry) return null;
  const words = (person.name_en || person.name_pinyin || '').toLowerCase().split(/[^a-zÀ-ɏ]+/).filter(Boolean);
  if (!isChinese(entry.character_cn)) return words.includes(entry.character_cn.toLowerCase()) ? true : null;

  // A Chinese character: their Chinese name settles it when there is one.
  if (person.name_cn) return person.name_cn.includes(entry.character_cn);
  // Otherwise go by sound: a word in their usual name that is how this
  // character is said ("How it is said" on the entry), or that is a known
  // spelling of it — "Zhi" or "Chee" for 志. Likely, not certain.
  const said = (entry.character_pinyin || '').toLowerCase().split(/[^a-zÀ-ɏ]+/).filter(Boolean);
  return words.some((w) => said.includes(w) || findCharacters(w).includes(entry.character_cn)) ? true : null;
}
