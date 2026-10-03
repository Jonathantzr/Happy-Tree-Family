// lib/relationships.js
// Works out how people in a family are related, from the stored links.
// Only 'parent' and 'spouse' links are stored in the database — everything
// else (siblings, grandparents, cousins, in-laws...) is computed here.

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

// Everyone above a person: Map of ancestor id -> { dist, via }.
// dist = how many generations up (0 = the person themselves),
// via = which of the person's own parents that line goes through.
function ancestorsOf(graph, id) {
  const found = new Map([[id, { dist: 0, via: null }]]);
  let layer = [id];
  while (layer.length) {
    const next = [];
    for (const cur of layer) {
      const info = found.get(cur);
      for (const parentId of graph.parentsOf(cur)) {
        if (found.has(parentId)) continue;
        found.set(parentId, { dist: info.dist + 1, via: info.via || parentId });
        next.push(parentId);
      }
    }
    layer = next;
  }
  return found;
}

// Blood relation as "up" generations from the viewer to the shared ancestor,
// then "down" generations to the target. null if they share no ancestor.
function bloodPath(graph, viewerId, targetId) {
  const mine = ancestorsOf(graph, viewerId);
  const theirs = ancestorsOf(graph, targetId);
  let best = null;
  for (const [ancestorId, info] of mine) {
    const other = theirs.get(ancestorId);
    if (!other) continue;
    const total = info.dist + other.dist;
    if (!best || total < best.up + best.down) best = { up: info.dist, down: other.dist, via: info.via };
  }
  return best;
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

const ORDINALS = ['First', 'Second', 'Third', 'Fourth', 'Fifth', 'Sixth'];
const REMOVED = ['', ' once removed', ' twice removed', ' three times removed', ' four times removed'];

// The English word for a blood relation, e.g. up 3 / down 0 = Great-grandmother
function bloodLabel(up, down, gender) {
  if (up === 0 && down === 0) return 'Self';
  if (down === 0) {
    if (up === 1) return pick(gender, 'Father', 'Mother', 'Parent');
    return capitalise(greats(up - 2) + pick(gender, 'grandfather', 'grandmother', 'grandparent'));
  }
  if (up === 0) {
    if (down === 1) return pick(gender, 'Son', 'Daughter', 'Child');
    return capitalise(greats(down - 2) + pick(gender, 'grandson', 'granddaughter', 'grandchild'));
  }
  if (up === 1 && down === 1) return pick(gender, 'Brother', 'Sister', 'Sibling');
  if (down === 1) return capitalise(greats(up - 2) + pick(gender, 'uncle', 'aunt', 'aunt/uncle'));
  if (up === 1) return capitalise(greats(down - 2) + pick(gender, 'nephew', 'niece', 'niece/nephew'));

  const degree = Math.min(up, down) - 1;
  const removed = Math.abs(up - down);
  if (degree === 1 && removed === 0) return 'Cousin';
  const ordinal = ORDINALS[degree - 1] || `${degree}th`;
  return `${ordinal} cousin${REMOVED[removed] ?? ` ${removed} times removed`}`;
}

// How targetId is related to viewerId. Returns { label, side } —
// label like "Great-grandmother", side like "dad's side" (or null) —
// or null when it's the same person / someone is missing.
export function describeRelation(graph, viewerId, targetId) {
  if (!viewerId || !targetId || viewerId === targetId) return null;
  const target = graph.byId.get(targetId);
  if (!target || !graph.byId.has(viewerId)) return null;

  const blood = bloodPath(graph, viewerId, targetId);
  if (blood) {
    let side = null;
    if (blood.up >= 2 && blood.via) {
      const viaGender = graph.byId.get(blood.via)?.gender;
      side = pick(viaGender, "dad's side", "mum's side", null);
    }
    return { label: bloodLabel(blood.up, blood.down, target.gender), side };
  }

  if (graph.spousesOf(viewerId).includes(targetId)) {
    return { label: pick(target.gender, 'Husband', 'Wife', 'Spouse'), side: null };
  }

  // Married to one of the viewer's blood relatives
  for (const partnerId of graph.spousesOf(targetId)) {
    const path = bloodPath(graph, viewerId, partnerId);
    if (!path) continue;
    const { up, down } = path;
    if (up === 0 && down === 1) return { label: pick(target.gender, 'Son-in-law', 'Daughter-in-law', 'Child-in-law'), side: null };
    if (up === 1 && down === 1) return { label: pick(target.gender, 'Brother-in-law', 'Sister-in-law', 'Sibling-in-law'), side: null };
    if (up === 1 && down === 0) return { label: pick(target.gender, 'Stepfather', 'Stepmother', 'Step-parent'), side: null };
    return { label: `${bloodLabel(up, down, target.gender)} (by marriage)`, side: null };
  }

  // A blood relative of the viewer's husband/wife
  for (const partnerId of graph.spousesOf(viewerId)) {
    const path = bloodPath(graph, partnerId, targetId);
    if (!path) continue;
    const { up, down } = path;
    if (up === 1 && down === 0) return { label: pick(target.gender, 'Father-in-law', 'Mother-in-law', 'Parent-in-law'), side: null };
    if (up === 1 && down === 1) return { label: pick(target.gender, 'Brother-in-law', 'Sister-in-law', 'Sibling-in-law'), side: null };
    if (up === 0 && down === 1) return { label: pick(target.gender, 'Stepson', 'Stepdaughter', 'Stepchild'), side: null };
    const partnerWord = pick(graph.byId.get(partnerId)?.gender, "Husband's", "Wife's", "Spouse's");
    return { label: `${partnerWord} ${bloodLabel(up, down, target.gender).toLowerCase()}`, side: null };
  }

  return { label: 'Relative', side: null };
}

// Ready-to-show sentence, e.g. "Your great-grandmother · dad's side"
export function relationText(relation) {
  if (!relation) return '';
  const base = `Your ${relation.label.toLowerCase()}`;
  return relation.side ? `${base} · ${relation.side}` : base;
}
