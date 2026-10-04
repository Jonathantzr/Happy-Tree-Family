// lib/relationships.js
// Works out how people in a family are related, from the stored links.
// Only 'parent' and 'spouse' links are stored in the database — everything
// else (siblings, grandparents, cousins, in-laws...) is computed here.
//
// The logic here produces FACTS (relationFacts): side, generations, blood or
// by-marriage, genders, older/younger. The WORDS come from a separate word
// list per language in lib/relationWords/ — so adding Malay, Chinese or Tamil
// later means adding a word list, not changing this file's logic.

import english from './relationWords/en';

// Turns the raw lists into quick lookups. Links pointing at someone who is
// not in the people list (e.g. just deleted) are ignored.
export function buildGraph(people, relationships) {
  const byId = new Map(people.map((p) => [p.id, p]));
  const parents = new Map();
  const children = new Map();
  const spouses = new Map();
  const add = (map, key, value) => {
    if (!map.has(key)) map.set(key, []);
    if (!map.get(key).includes(value)) map.get(key).push(value);
  };

  for (const r of relationships) {
    const a = r.person_id;
    const b = r.related_person_id;
    if (!byId.has(a) || !byId.has(b) || a === b) continue;
    if (r.relation_type === 'parent') {
      // 'parent' rows mean: a's parent is b
      add(parents, a, b);
      add(children, b, a);
    } else if (r.relation_type === 'spouse') {
      add(spouses, a, b);
      add(spouses, b, a);
    }
  }

  return {
    byId,
    parentsOf: (id) => parents.get(id) || [],
    childrenOf: (id) => children.get(id) || [],
    spousesOf: (id) => spouses.get(id) || [],
  };
}

// Generation of everyone, counted within each connected group of people:
// Map id -> { gen, group }. Parents are gen - 1, children gen + 1, spouses equal.
export function generationsOf(graph) {
  const result = new Map();
  let group = 0;
  for (const id of graph.byId.keys()) {
    if (result.has(id)) continue;
    group += 1;
    result.set(id, { gen: 0, group });
    const queue = [id];
    while (queue.length) {
      const cur = queue.shift();
      const g = result.get(cur).gen;
      const visit = (other, value) => {
        if (result.has(other)) return;
        result.set(other, { gen: value, group });
        queue.push(other);
      };
      graph.parentsOf(cur).forEach((x) => visit(x, g - 1));
      graph.childrenOf(cur).forEach((x) => visit(x, g + 1));
      graph.spousesOf(cur).forEach((x) => visit(x, g));
    }
  }
  return result;
}

function collect(start, next) {
  const found = new Set();
  const stack = [...next(start)];
  while (stack.length) {
    const id = stack.pop();
    if (found.has(id) || id === start) continue;
    found.add(id);
    stack.push(...next(id));
  }
  return found;
}

export function siblingIdsOf(graph, id) {
  const ids = new Set();
  graph.parentsOf(id).forEach((p) => graph.childrenOf(p).forEach((kid) => kid !== id && ids.add(kid)));
  return [...ids];
}

// People who could sensibly be linked to targetId as their parent / child /
// spouse / sibling. Leaves out anyone it obviously can't be: already linked,
// in their own line (an ancestor can't be their child), the wrong generation
// within the same family group, or born on the wrong side of them.
export function linkCandidates(graph, targetId, kind) {
  const target = graph.byId.get(targetId);
  if (!target) return [];
  const gens = generationsOf(graph);
  const mine = gens.get(targetId);
  const ancestors = collect(targetId, graph.parentsOf);
  const descendants = collect(targetId, graph.childrenOf);
  const spouses = new Set(graph.spousesOf(targetId));
  const siblings = new Set(siblingIdsOf(graph, targetId));
  const offset = { parent: -1, child: 1, spouse: 0, sibling: 0 }[kind];
  const born = (p) => p.birth_date || null;

  // Anyone already related by blood (sharing an ancestor) or married to such a
  // relative is already placed in the family — they can't also become this
  // person's new parent, child, spouse or sibling.
  const blood = new Set();
  for (const a of [targetId, ...ancestors]) {
    blood.add(a);
    collect(a, graph.childrenOf).forEach((d) => blood.add(d));
  }
  const married = new Set();
  blood.forEach((id) => graph.spousesOf(id).forEach((s) => married.add(s)));
  // ...and their husband's/wife's own parents and grandparents (in-laws)
  spouses.forEach((s) => collect(s, graph.parentsOf).forEach((a) => married.add(a)));

  if (kind === 'parent' && graph.parentsOf(targetId).length >= 2) return [];

  return [...graph.byId.values()].filter((p) => {
    if (p.id === targetId) return false;
    if (kind !== 'parent' && (p.name_en || '').startsWith('Unknown parent of')) return false;
    if (blood.has(p.id) || married.has(p.id)) return false;
    if (kind === 'sibling' && graph.parentsOf(targetId).length && graph.parentsOf(p.id).length) return false;
    const theirs = gens.get(p.id);
    if (theirs.group === mine.group && theirs.gen !== mine.gen + offset) return false;
    if (kind === 'parent') {
      if (descendants.has(p.id) || spouses.has(p.id) || siblings.has(p.id) || ancestors.has(p.id)) return false;
      if (born(p) && born(target) && born(p) >= born(target)) return false;
    } else if (kind === 'child') {
      if (ancestors.has(p.id) || spouses.has(p.id) || descendants.has(p.id)) return false;
      if (graph.parentsOf(p.id).length >= 2) return false;
      if (born(p) && born(target) && born(p) <= born(target)) return false;
    } else if (kind === 'spouse') {
      if (ancestors.has(p.id) || descendants.has(p.id) || siblings.has(p.id) || spouses.has(p.id)) return false;
    } else if (kind === 'sibling') {
      if (ancestors.has(p.id) || descendants.has(p.id) || spouses.has(p.id) || siblings.has(p.id)) return false;
    }
    return true;
  });
}

// Everyone above a person: Map of ancestor id -> { dist, child }.
// dist = how many generations up (0 = the person themselves),
// child = the person one step below on the way up (to rebuild the line).
function ancestorsOf(graph, id) {
  const found = new Map([[id, { dist: 0, child: null }]]);
  let layer = [id];
  while (layer.length) {
    const next = [];
    for (const cur of layer) {
      const info = found.get(cur);
      for (const parentId of graph.parentsOf(cur)) {
        if (found.has(parentId)) continue;
        found.set(parentId, { dist: info.dist + 1, child: cur });
        next.push(parentId);
      }
    }
    layer = next;
  }
  return found;
}

// the line of people from the start of an ancestorsOf() map up to one ancestor
function lineUp(found, ancestorId) {
  const line = [];
  for (let id = ancestorId; id; id = found.get(id).child) line.unshift(id);
  return line;
}

// Blood relation as "up" generations from the viewer to the shared ancestor,
// then "down" generations to the target, with the people on each line:
// upIds = [viewer, ..., ancestor], downIds = [ancestor, ..., target].
// null if they share no ancestor.
function bloodPath(graph, viewerId, targetId) {
  const mine = ancestorsOf(graph, viewerId);
  const theirs = ancestorsOf(graph, targetId);
  let best = null;
  for (const [ancestorId, info] of mine) {
    const other = theirs.get(ancestorId);
    if (!other) continue;
    const total = info.dist + other.dist;
    if (!best || total < best.up + best.down) best = { up: info.dist, down: other.dist, ancestorId };
  }
  if (!best) return null;
  return {
    up: best.up,
    down: best.down,
    upIds: lineUp(mine, best.ancestorId),
    downIds: lineUp(theirs, best.ancestorId).reverse(),
  };
}

// Is x older or younger than y? 'unknown' when a birth date is missing.
function compareAge(graph, x, y) {
  const bx = graph.byId.get(x)?.birth_date;
  const by = graph.byId.get(y)?.birth_date;
  if (!bx || !by || bx === by) return 'unknown';
  return bx < by ? 'older' : 'younger';
}

// The blood part of the facts (see relationFacts below)
function bloodFacts(graph, fromId, toId) {
  const path = bloodPath(graph, fromId, toId);
  if (!path) return null;
  const { up, down, upIds, downIds } = path;
  const genderOf = (id) => graph.byId.get(id)?.gender || null;
  const firstParent = up >= 1 ? genderOf(upIds[1]) : null;
  return {
    kind: 'blood',
    up,
    down,
    side: firstParent === 'M' ? 'father' : firstParent === 'F' ? 'mother' : null,
    upChain: upIds.slice(1).map(genderOf), // genders going up from the viewer
    downChain: downIds.slice(1).map(genderOf), // genders coming down to the target
    gender: genderOf(toId),
    age: compareAge(graph, toId, fromId), // target compared with the viewer
    // where the two family lines split: the target's side compared with the
    // viewer's side (for an uncle: is he older or younger than your parent?)
    branchAge: up >= 1 && down >= 1 ? compareAge(graph, downIds[1], upIds[up - 1]) : 'unknown',
  };
}

// HOW two people are related, as plain facts with no words in any language:
//   kind     'blood' | 'spouse' | 'spouseOfBlood' | 'bloodOfSpouse' | 'marriage' | 'none'
//   gender   the target's gender ('M' | 'F' | 'other' | null)
// blood (shares an ancestor with the viewer):
//   up, down             generations up to the shared ancestor, then down
//   side                 'father' | 'mother' | null — which parent's side
//   upChain, downChain   gender of each person along the line
//   age, branchAge       'older' | 'younger' | 'unknown' (from birth dates)
// spouseOfBlood (married to the viewer's blood relative): partner = that relative's blood facts, through = their id
// bloodOfSpouse (blood relative of the viewer's husband/wife): inner = blood facts from the spouse, spouseGender, through
// marriage (linked only through a marriage further away): through = the nearest person whose marriage links them
// Returns null for the same person or someone missing.
export function relationFacts(graph, viewerId, targetId) {
  if (!viewerId || !targetId || viewerId === targetId) return null;
  const target = graph.byId.get(targetId);
  if (!target || !graph.byId.has(viewerId)) return null;
  const gender = target.gender || null;

  const blood = bloodFacts(graph, viewerId, targetId);
  if (blood) return blood;

  if (graph.spousesOf(viewerId).includes(targetId)) {
    return { kind: 'spouse', gender, age: compareAge(graph, targetId, viewerId) };
  }

  for (const partnerId of graph.spousesOf(targetId)) {
    const partner = bloodFacts(graph, viewerId, partnerId);
    if (partner) return { kind: 'spouseOfBlood', gender, through: partnerId, partner };
  }

  for (const spouseId of graph.spousesOf(viewerId)) {
    const inner = bloodFacts(graph, spouseId, targetId);
    if (inner) return { kind: 'bloodOfSpouse', gender, through: spouseId, spouseGender: graph.byId.get(spouseId)?.gender || null, inner };
  }

  // Connected only through marriages further out (e.g. a cousin's wife's
  // parents): never a cousin/uncle of any kind, just "through X's marriage".
  const path = relationPath(graph, viewerId, targetId);
  if (path) {
    const firstMarriage = path.findIndex((s) => s.step === 'spouse');
    const through = firstMarriage > 0 ? path[firstMarriage - 1].id : viewerId;
    return { kind: 'marriage', gender, through, throughIsViewer: through === viewerId };
  }

  return { kind: 'none', gender };
}

function pick(gender, ifM, ifF, ifOther) {
  if (gender === 'M') return ifM;
  if (gender === 'F') return ifF;
  return ifOther;
}

function greats(n) {
  return 'great-'.repeat(Math.max(0, n));
}

function capitalise(text) {
  return text.charAt(0).toUpperCase() + text.slice(1);
}

// One word list per language. Each takes the facts and returns
// { text, side, standalone } — see lib/relationWords/en.js.
const LANGUAGES = { en: english };

const displayName = (graph, id) => {
  const p = graph.byId.get(id);
  return p?.name_en || p?.name_pinyin || p?.name_cn || 'Someone';
};

// How targetId is related to viewerId, in words. Returns
// { text, side, standalone, facts } — text like "dad's elder brother" or
// "cousin", side like "dad's side" (or null), standalone true when it isn't a
// "your ..." phrase — or null when it's the same person / someone is missing.
export function describeRelation(graph, viewerId, targetId, language = 'en', nameOf) {
  const facts = relationFacts(graph, viewerId, targetId);
  if (!facts) return null;
  const words = (LANGUAGES[language] || english)(facts, nameOf || ((id) => displayName(graph, id)));
  return { ...words, facts };
}

// The chain of people linking viewer to target, shortest first, preferring
// blood links over marriages. Returns [{ id, step }] where step is how this
// person relates to the previous one: 'parent' | 'child' | 'spouse' (null for
// the viewer). null if they aren't connected at all.
export function relationPath(graph, viewerId, targetId) {
  if (!graph.byId.has(viewerId) || !graph.byId.has(targetId)) return null;
  const prev = new Map([[viewerId, null]]);
  const queue = [viewerId];
  while (queue.length) {
    const id = queue.shift();
    if (id === targetId) break;
    const next = [
      ...graph.parentsOf(id).map((x) => [x, 'parent']),
      ...graph.childrenOf(id).map((x) => [x, 'child']),
      ...graph.spousesOf(id).map((x) => [x, 'spouse']),
    ];
    for (const [other, step] of next) {
      if (prev.has(other)) continue;
      prev.set(other, { from: id, step });
      queue.push(other);
    }
  }
  if (!prev.has(targetId)) return null;
  const path = [];
  for (let id = targetId; id; id = prev.get(id)?.from) {
    path.unshift({ id, step: prev.get(id)?.step || null });
    if (id === viewerId) break;
  }
  return path;
}

const STEP_WORDS = {
  parent: ['father', 'mother', 'parent'],
  child: ['son', 'daughter', 'child'],
  spouse: ['husband', 'wife', 'spouse'],
};

// "dad" / "grandmother" / "great-grandfather" for n generations up
function ancestorWord(n, gender) {
  if (n === 1) return pick(gender, 'dad', 'mum', 'parent');
  return greats(n - 2) + pick(gender, 'grandfather', 'grandmother', 'grandparent');
}

function siblingWord(graph, a, b) {
  const ga = graph.byId.get(a)?.gender;
  const gb = graph.byId.get(b)?.gender;
  if (ga === 'M' && gb === 'M') return 'brothers';
  if (ga === 'F' && gb === 'F') return 'sisters';
  if ((ga === 'M' && gb === 'F') || (ga === 'F' && gb === 'M')) return 'brother and sister';
  return 'siblings';
}

function joinNames(names) {
  if (names.length <= 1) return names[0] || '';
  return `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`;
}

// Turns a raw chain into "hops" people think in. Going up to a parent and
// straight back down to another of their children becomes ONE brother/sister
// hop, so it reads "Dad and Daniel are brothers" instead of passing through
// Grandma. Each hop: { from, to, type: 'parent'|'child'|'spouse'|'sibling', parents? }
export function pathHops(graph, path) {
  const hops = [];
  for (let i = 1; i < path.length; i++) {
    const from = path[i - 1].id;
    if (path[i].step === 'parent' && path[i + 1]?.step === 'child') {
      const to = path[i + 1].id;
      const genderOrder = (id) => ({ M: 0, F: 1 })[graph.byId.get(id)?.gender] ?? 2;
      const shared = graph
        .parentsOf(from)
        .filter((p) => graph.parentsOf(to).includes(p))
        .sort((x, y) => genderOrder(x) - genderOrder(y)); // "Dad and Mum", not "Mum and Dad"
      hops.push({ from, to, type: 'sibling', parents: shared });
      i += 1;
    } else {
      hops.push({ from, to: path[i].id, type: path[i].step });
    }
  }
  return hops;
}

// Everything needed to explain how two people are related, in plain words.
// From "you" (isMe = true) it says "your"; between any two other people it
// uses their names. Returns:
// { summary: "Nat is your cousin (dad's side)",
//   keyLink: "Your dad (Dad) and Nat's dad (Daniel Tan) are brothers.",
//   steps:   ["Dad is your father", "Dad and Daniel Tan are brothers — both children of Grandad and Grandma", "Nat is Daniel Tan's daughter"],
//   hops, people: [ids on the way] }
// The further apart two people are, the more steps there are.
export function explainRelation(graph, viewerId, targetId, isMe = true) {
  const path = relationPath(graph, viewerId, targetId);
  if (!path) return null;
  const nameOf = (id) => displayName(graph, id);
  const subject = (id) => (isMe && id === viewerId ? 'You' : nameOf(id));
  const whose = (id) => (isMe && id === viewerId ? 'your' : `${nameOf(id)}'s`);

  const relation = describeRelation(graph, viewerId, targetId, 'en', nameOf);
  let summary = `${nameOf(targetId)} is part of ${whose(viewerId)} family`;
  if (relation?.standalone) {
    summary = `${nameOf(targetId)} is ${relation.text}`;
  } else if (relation) {
    const side = relation.side ? ` (${isMe ? relation.side : `${nameOf(viewerId)}'s ${relation.side}`})` : '';
    summary = `${nameOf(targetId)} is ${whose(viewerId)} ${relation.text}${side}`;
  }

  const hops = pathHops(graph, path);
  const steps = hops.map((hop) => {
    if (hop.type === 'sibling') {
      const parents = hop.parents.length ? ` — both children of ${joinNames(hop.parents.map(nameOf))}` : '';
      return `${subject(hop.from)} and ${nameOf(hop.to)} are ${siblingWord(graph, hop.from, hop.to)}${parents}`;
    }
    const [m, f, o] = STEP_WORDS[hop.type];
    return `${nameOf(hop.to)} is ${whose(hop.from)} ${pick(graph.byId.get(hop.to)?.gender, m, f, o)}`;
  });

  // The one sentence that explains it best: for brothers/sisters it's that
  // step itself; for cousins, uncles, nieces... it's the pair of brothers or
  // sisters where the two family lines split.
  let keyLink = null;
  if (hops.length === 1 && hops[0].type === 'sibling') keyLink = `${steps[0]}.`;
  const kinds = path.slice(1).map((s) => s.step);
  const up = kinds.findIndex((k) => k !== 'parent');
  const ups = up === -1 ? kinds.length : up;
  const downs = kinds.length - ups;
  const pureBlood = kinds.every((k, i) => (i < ups ? k === 'parent' : k === 'child'));
  if (pureBlood && ups >= 1 && downs >= 1 && ups + downs > 2) {
    const a = path[ups - 1].id; // the viewer's side, just below the shared ancestors
    const b = path[ups + 1].id; // the target's side, just below the shared ancestors
    const aRef = ups === 1 ? subject(a) : `${capitalise(whose(viewerId))} ${ancestorWord(ups - 1, graph.byId.get(a)?.gender)} (${nameOf(a)})`;
    const bRef = downs === 1 ? nameOf(b) : `${nameOf(targetId)}'s ${ancestorWord(downs - 1, graph.byId.get(b)?.gender)} (${nameOf(b)})`;
    keyLink = `${aRef} and ${bRef} are ${siblingWord(graph, a, b)}.`;
  }

  const people = [...new Set(hops.flatMap((h) => [h.from, h.to]))];
  return { summary, keyLink, steps, hops, people };
}

// Ready-to-show sentence, e.g. "Your great-grandmother · dad's side"
export function relationText(relation) {
  if (!relation) return '';
  if (relation.standalone) return capitalise(relation.text);
  const base = `Your ${relation.text}`;
  return relation.side ? `${base} · ${relation.side}` : base;
}