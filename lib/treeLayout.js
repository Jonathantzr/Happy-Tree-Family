// lib/treeLayout.js
// Works out WHERE everything goes on the family tree: a box for each person,
// the connecting lines, and the little open/close buttons under each couple.
// It only does the maths — screens/TreeScreen.js does the drawing.
//
// How it works, in short:
// 1. Married people are glued together into one "unit" so they sit side by side.
// 2. Each unit sits on a row by generation (grandparents, parents, children...).
// 3. Children are placed under their parents, and parents are centred above them.

export const NODE_W = 128;
export const NODE_H = 96;
export const TOGGLE_SIZE = 28;
const SPOUSE_GAP = 16; // between husband and wife
const SIBLING_GAP = 28; // between brothers/sisters (and their branches)
export const ROW_GAP = 76; // between one generation and the next
const TREE_GAP = 56; // between separate, unconnected trees
const PADDING = 40; // empty margin around the whole drawing
const LINE = 2;

function vLine(x, y1, y2) {
  return { x: x - LINE / 2, y: Math.min(y1, y2), w: LINE, h: Math.abs(y2 - y1) };
}
function hLine(x1, x2, y) {
  return { x: Math.min(x1, x2) - LINE / 2, y: y - LINE / 2, w: Math.abs(x2 - x1) + LINE, h: LINE };
}

// Which visible people get drawn in the "my family" view, centred on one person:
// - always: them, their husband/wife, their children and grandchildren (and
//   those children's spouses), their parents, and their brothers/sisters
// - for every person in `openIds` (e.g. Dad, once "Dad's side" is tapped):
//   that person's parents and everyone descended from them — grandparents,
//   uncles, aunts, cousins...
// Returns { visible: Set of ids, handles: [...], closers: [...] }:
// handles = people whose parents are still hidden (they get a "▲ Dad's side" tag),
// closers = people whose side has been opened (their tag becomes "▼ Hide"),
// familyOf = Map of person id -> whose tag brought them in, but only for a
// husband's/wife's own family (not your own dad's/mum's side) — for colouring.
export function familyView(graph, centreId, openIds) {
  if (!graph.byId.has(centreId)) return { visible: new Set(graph.byId.keys()), handles: [], closers: [], familyOf: new Map() };

  function grow(set, startId) {
    const withSpouses = (id) => {
      set.add(id);
      graph.spousesOf(id).forEach((s) => set.add(s));
    };
    const descendants = (id, seen = new Set()) => {
      for (const kid of graph.childrenOf(id)) {
        if (seen.has(kid)) continue;
        seen.add(kid);
        withSpouses(kid);
        descendants(kid, seen);
      }
    };
    return { withSpouses, descendants };
  }

  function openSide(set, id) {
    const { withSpouses, descendants } = grow(set, id);
    for (const p of graph.parentsOf(id)) {
      withSpouses(p);
      descendants(p);
    }
  }

  const visible = new Set();
  const { withSpouses, descendants } = grow(visible, centreId);
  withSpouses(centreId);
  descendants(centreId);
  for (const p of graph.parentsOf(centreId)) {
    withSpouses(p);
    graph.childrenOf(p).forEach(withSpouses); // brothers and sisters
  }

  // keep opening sides until nothing new appears (an opened grandparent only
  // counts once their grandchild's side has been opened)
  // the centre person and everyone above them: opening one of THESE shows
  // your own relatives; opening anyone else shows a family that married in
  const bloodline = new Set([centreId]);
  for (const id of bloodline) graph.parentsOf(id).forEach((p) => bloodline.add(p));

  const familyOf = new Map();
  const done = new Set();
  let changed = true;
  while (changed) {
    changed = false;
    for (const id of openIds) {
      if (done.has(id) || !visible.has(id)) continue;
      const side = new Set();
      openSide(side, id);
      for (const member of side) {
        if (visible.has(member)) continue;
        visible.add(member);
        if (!bloodline.has(id)) familyOf.set(member, id);
      }
      done.add(id);
      changed = true;
    }
  }

  // The line of ancestors (and the centre person's spouse) can be opened upwards
  const ancestors = [];
  const seenUp = new Set([centreId]);
  const queue = [centreId];
  while (queue.length) {
    const id = queue.shift();
    for (const p of graph.parentsOf(id)) {
      if (seenUp.has(p) || !visible.has(p)) continue;
      seenUp.add(p);
      ancestors.push(p);
      queue.push(p);
    }
  }
  const candidates = [...ancestors, ...graph.spousesOf(centreId)];

  const handles = [];
  for (const id of candidates) {
    const parents = graph.parentsOf(id);
    if (!parents.length || parents.every((p) => visible.has(p))) continue;
    const preview = new Set(visible);
    openSide(preview, id);
    handles.push({ personId: id, count: preview.size - visible.size });
  }
  const closers = [...done].filter((id) => graph.parentsOf(id).some((p) => visible.has(p))).map((id) => ({ personId: id }));

  return { visible, handles, closers, familyOf };
}

// Who gets drawn in the "everyone" view. Marriages make a family a web, not a
// tree: every person who marries in brings their own parents and relatives,
// and drawing all of those at once buries the family under long crossing lines.
// So "everyone" means everyone in YOUR family:
// - always: your blood relatives on both sides (everyone above you, and
//   everyone descended from them) and the people they married
// - a husband's/wife's own family stays folded behind a "▲ …'s family" button
//   on their box until it is opened (their id is then in `openIds`)
// - people not linked to your family at all are shown too, so nobody goes missing
// Returns the same shape as familyView(); an opened family's handle comes back
// with open: true (it turns into its "Hide" button), so closers is empty.
// familyOf: Map of person id -> whose button brought them in (for colouring).
export function everyoneView(graph, anchorId, openIds) {
  if (!graph.byId.has(anchorId)) return { visible: new Set(graph.byId.keys()), handles: [], closers: [], familyOf: new Map() };

  // one family: a person, everyone above them, everyone descended from those,
  // and who they all married
  function addFamilyOf(set, startId) {
    const blood = [startId];
    const seen = new Set(blood);
    for (let i = 0; i < blood.length; i++) {
      for (const p of graph.parentsOf(blood[i])) {
        if (!seen.has(p)) {
          seen.add(p);
          blood.push(p);
        }
      }
    }
    for (let i = 0; i < blood.length; i++) {
      for (const kid of graph.childrenOf(blood[i])) {
        if (!seen.has(kid)) {
          seen.add(kid);
          blood.push(kid);
        }
      }
    }
    for (const id of blood) {
      set.add(id);
      graph.spousesOf(id).forEach((s) => set.add(s));
    }
  }

  const visible = new Set();
  addFamilyOf(visible, anchorId);

  // anyone with no chain of links to you at all (e.g. just added, not linked yet)
  const linked = new Set([anchorId]);
  const queue = [anchorId];
  while (queue.length) {
    const id = queue.shift();
    for (const other of [...graph.parentsOf(id), ...graph.childrenOf(id), ...graph.spousesOf(id)]) {
      if (linked.has(other)) continue;
      linked.add(other);
      queue.push(other);
    }
  }
  for (const id of graph.byId.keys()) if (!linked.has(id)) visible.add(id);

  const familyOf = new Map();
  const done = new Set();
  let changed = true;
  while (changed) {
    changed = false;
    for (const id of openIds) {
      if (done.has(id) || !visible.has(id)) continue;
      const family = new Set();
      addFamilyOf(family, id);
      for (const member of family) {
        if (visible.has(member)) continue;
        visible.add(member);
        familyOf.set(member, id);
      }
      done.add(id);
      changed = true;
    }
  }

  const handles = [...done].map((id) => ({ personId: id, open: true }));
  for (const id of visible) {
    if (done.has(id) || !graph.parentsOf(id).some((p) => !visible.has(p))) continue;
    const preview = new Set(visible);
    addFamilyOf(preview, id);
    handles.push({ personId: id, count: preview.size - visible.size });
  }
  return { visible, handles, closers: [], familyOf };
}

// The direction each ancestor's family should spread, seen from `anchorId`:
// fathers' families to the left ('L'), mothers' families to the right ('R'),
// so the lines of the two sides never cross.
function sidesFrom(graph, anchorId) {
  const roles = new Map();
  if (!anchorId || !graph.byId.has(anchorId)) return roles;
  const queue = [anchorId];
  const seen = new Set(queue);
  while (queue.length) {
    const id = queue.shift();
    const parents = graph.parentsOf(id);
    const father = parents.find((p) => graph.byId.get(p)?.gender === 'M');
    const mother = parents.find((p) => p !== father && graph.byId.get(p)?.gender === 'F');
    const rest = parents.filter((p) => p !== father && p !== mother);
    const left = father || rest.shift();
    const right = mother || rest.shift();
    if (left && !roles.has(left)) roles.set(left, 'L');
    if (right && !roles.has(right)) roles.set(right, 'R');
    for (const p of parents) {
      if (seen.has(p)) continue;
      seen.add(p);
      queue.push(p);
    }
  }
  return roles;
}

// people: persons in a stable order (oldest record first)
// graph: from buildGraph() in lib/relationships.js
// collapsed: Set of unit keys whose branch is folded away
// options.anchorId: whose point of view sets the sides (usually you, or the
// person the tree is centred on) — dad's side left, mum's side right
export function layoutTree(people, graph, collapsed, options = {}) {
  const order = new Map(people.map((p, i) => [p.id, i]));
  const roles = sidesFrom(graph, options.anchorId);
  const roleRank = (id) => (roles.get(id) === 'L' ? 0 : roles.get(id) === 'R' ? 2 : 1);

  // ---- 1. Units: a person plus everyone they're married to ----
  const unitOf = new Map();
  const units = [];
  for (const p of people) {
    if (unitOf.has(p.id)) continue;
    const unit = { key: p.id, members: [], parentUnits: [], childUnits: [], treeParent: null, treeChildren: [], hidden: false };
    const queue = [p.id];
    unitOf.set(p.id, unit);
    while (queue.length) {
      const id = queue.shift();
      unit.members.push(id);
      for (const s of graph.spousesOf(id)) {
        if (!unitOf.has(s)) {
          unitOf.set(s, unit);
          queue.push(s);
        }
      }
    }
    units.push(unit);
  }

  // ---- 2. Generations: parents one row up, children one row down, spouses level ----
  const gen = new Map();
  for (const p of people) {
    if (gen.has(p.id)) continue;
    const component = [p.id];
    gen.set(p.id, 0);
    for (let i = 0; i < component.length; i++) {
      const id = component[i];
      const g = gen.get(id);
      const visit = (other, value) => {
        if (gen.has(other)) return;
        gen.set(other, value);
        component.push(other);
      };
      graph.parentsOf(id).forEach((x) => visit(x, g - 1));
      graph.childrenOf(id).forEach((x) => visit(x, g + 1));
      graph.spousesOf(id).forEach((x) => visit(x, g));
    }
    const min = Math.min(...component.map((id) => gen.get(id)));
    component.forEach((id) => gen.set(id, gen.get(id) - min));
  }
  for (const unit of units) unit.gen = Math.max(...unit.members.map((id) => gen.get(id)));

  // ---- 3. Which units are parents/children of which ----
  for (const unit of units) {
    for (const id of unit.members) {
      for (const parentId of graph.parentsOf(id)) {
        const parentUnit = unitOf.get(parentId);
        if (parentUnit === unit) continue;
        if (!unit.parentUnits.includes(parentUnit)) unit.parentUnits.push(parentUnit);
        if (!parentUnit.childUnits.includes(unit)) parentUnit.childUnits.push(unit);
      }
    }
  }

  // ---- 4. Turn it into trees. A couple where BOTH sides have parents can only
  // hang under one set of parents; the other set becomes its own tree placed
  // right next door, joined by a line. ----
  const claimed = new Set();
  const roots = [];

  // the member of a unit who is a child of parentUnit, for sorting by age
  const linkChild = (unit, parentUnit) =>
    unit.members.find((id) => graph.parentsOf(id).some((pid) => unitOf.get(pid) === parentUnit));

  function claimBranch(unit, neighbours) {
    const kids = unit.childUnits.filter((c) => !claimed.has(c));
    kids.forEach((c) => claimed.add(c));
    kids.sort((a, b) => {
      // keeping the two sides apart comes first: under dad's parents, dad's
      // couple goes on the right end (towards mum's side); under mum's parents,
      // mum's couple goes on the left end (towards dad's side)
      const sideA = roles.get(linkChild(a, unit));
      const sideB = roles.get(linkChild(b, unit));
      const rankA = sideA === 'R' ? -1 : sideA === 'L' ? 1 : 0;
      const rankB = sideB === 'R' ? -1 : sideB === 'L' ? 1 : 0;
      if (rankA !== rankB) return rankA - rankB;
      // then eldest on the left; anyone without a birth date goes after those with one
      const pa = graph.byId.get(linkChild(a, unit));
      const pb = graph.byId.get(linkChild(b, unit));
      const da = pa?.birth_date || '9999';
      const db = pb?.birth_date || '9999';
      if (da !== db) return da < db ? -1 : 1;
      // otherwise, couples with a second set of parents go last, next to that other tree
      const aTwo = a.parentUnits.length > 1 ? 1 : 0;
      const bTwo = b.parentUnits.length > 1 ? 1 : 0;
      if (aTwo !== bTwo) return aTwo - bTwo;
      return order.get(a.key) - order.get(b.key);
    });
    for (const kid of kids) {
      kid.treeParent = unit;
      // dad left / mum right; otherwise the one born into this branch stands
      // on the left, whoever married in on the right
      kid.members.sort((x, y) => {
        const xIn = graph.parentsOf(x).some((pid) => unitOf.get(pid) === unit) ? 0 : 1;
        const yIn = graph.parentsOf(y).some((pid) => unitOf.get(pid) === unit) ? 0 : 1;
        return roleRank(x) - roleRank(y) || xIn - yIn || order.get(x) - order.get(y);
      });
      unit.treeChildren.push(kid);
      kid.parentUnits.forEach((other) => {
        if (other !== unit && !neighbours.includes(other)) neighbours.push(other);
      });
      claimBranch(kid, neighbours);
    }
  }

  function placeRoot(unit) {
    if (claimed.has(unit)) return;
    claimed.add(unit);
    roots.push(unit);
    unit.members.sort((x, y) => roleRank(x) - roleRank(y) || order.get(x) - order.get(y));
    const neighbours = [];
    claimBranch(unit, neighbours);
    // the "other side's" family goes straight after this tree
    neighbours.map(topOf).forEach(placeRoot);
  }

  // climbs to the oldest ancestors above a unit, following dad's line first
  function topOf(unit) {
    let top = unit;
    for (let i = 0; i < units.length && top.parentUnits.length; i++) {
      const dad = top.members.find(
        (id) => (roles.get(id) === 'L' || id === options.anchorId) && graph.parentsOf(id).length
      );
      top = (dad && unitOf.get(graph.parentsOf(dad)[0])) || top.parentUnits[0];
    }
    return top;
  }

  // start from the top of dad's line, so his family is laid out first (on the left)
  if (options.anchorId && unitOf.has(options.anchorId)) placeRoot(topOf(unitOf.get(options.anchorId)));
  units.filter((u) => u.parentUnits.length === 0).forEach(placeRoot);
  units.forEach(placeRoot); // safety net for odd data (e.g. a loop of parents)

  // ---- 5. Folded branches ----
  function markHidden(unit, hidden) {
    unit.hidden = hidden;
    const below = hidden || collapsed.has(unit.key);
    unit.treeChildren.forEach((c) => markHidden(c, below));
  }
  roots.forEach((r) => markHidden(r, false));
  const shownChildren = (unit) => (collapsed.has(unit.key) ? [] : unit.treeChildren);
  const countPeople = (unit) => unit.treeChildren.reduce((n, c) => n + c.members.length + countPeople(c), 0);

  // ---- 6. Sizes, then positions ----
  const ownWidth = (unit) => unit.members.length * NODE_W + (unit.members.length - 1) * SPOUSE_GAP;
  function measure(unit) {
    const kids = shownChildren(unit);
    kids.forEach(measure);
    unit.kidsWidth = kids.reduce((w, c) => w + c.width, 0) + Math.max(0, kids.length - 1) * SIBLING_GAP;
    unit.width = Math.max(ownWidth(unit), unit.kidsWidth);
  }

  let maxRow = 0;
  function place(unit, left, row) {
    unit.row = Math.max(unit.gen, row);
    maxRow = Math.max(maxRow, unit.row);
    const kids = shownChildren(unit);
    const own = ownWidth(unit);
    let cursor = left + Math.max(0, (unit.width - unit.kidsWidth) / 2);
    for (const kid of kids) {
      place(kid, cursor, unit.row + 1);
      cursor += kid.width + SIBLING_GAP;
    }
    if (kids.length) {
      const first = kids[0];
      const last = kids[kids.length - 1];
      const centre = (first.x + ownWidth(first) / 2 + last.x + ownWidth(last) / 2) / 2;
      unit.x = Math.min(Math.max(centre - own / 2, left), left + unit.width - own);
    } else {
      unit.x = left;
    }
  }

  let cursor = PADDING;
  for (const root of roots) {
    measure(root);
    place(root, cursor, root.gen);
    cursor += root.width + TREE_GAP;
  }

  // ---- 7. One box per visible person ----
  const pos = {};
  const nodes = [];
  for (const unit of units) {
    if (unit.hidden) continue;
    unit.y = PADDING + unit.row * (NODE_H + ROW_GAP);
    unit.members.forEach((id, i) => {
      pos[id] = { x: unit.x + i * (NODE_W + SPOUSE_GAP), y: unit.y };
      nodes.push({ id, ...pos[id] });
    });
  }

  // ---- 8. Lines ----
  const lines = [];
  const centreX = (id) => pos[id].x + NODE_W / 2;

  // husband–wife line (runs behind the boxes, so only the bit between them shows)
  for (const unit of units) {
    if (unit.hidden || unit.members.length < 2) continue;
    // ids = whose line this is, so the screen can colour one family's lines
    lines.push({ ...hLine(centreX(unit.members[0]), centreX(unit.members[unit.members.length - 1]), unit.y + NODE_H / 2), ids: unit.members });
  }

  // parent–child lines: group children that share exactly the same parents
  const groups = new Map();
  for (const node of nodes) {
    const parentIds = graph.parentsOf(node.id).filter((pid) => pos[pid]);
    if (!parentIds.length) continue;
    const sameUnit = parentIds.every((pid) => unitOf.get(pid) === unitOf.get(parentIds[0]));
    const sets = sameUnit ? [parentIds] : parentIds.map((pid) => [pid]);
    for (const set of sets) {
      const parentUnit = unitOf.get(set[0]);
      // a child hanging under its "other" parents gets a slightly different
      // line height, so the two sets of lines don't sit on top of each other
      const main = unitOf.get(node.id).treeParent === parentUnit;
      const key = [...set].sort().join('|') + (main ? '' : '|other');
      if (!groups.has(key)) groups.set(key, { parents: set, main, children: [] });
      groups.get(key).children.push(node.id);
    }
  }
  // childLinks remembers, for each child, the line up to their parents — the
  // "how are we related?" highlight follows these same lines
  const childLinks = {};
  for (const group of groups.values()) {
    group.fromX = group.parents.reduce((sum, pid) => sum + centreX(pid), 0) / group.parents.length;
    const xs = group.children.map(centreX);
    group.minX = Math.min(group.fromX, ...xs);
    group.maxX = Math.max(group.fromX, ...xs);
  }

  // "Other parents" lines run sideways to a child sitting in a different tree
  // (e.g. from a wife's parents across to the wife). Several in one row used to
  // share one height and merge into a single bar, so everyone looked like a
  // child of everyone. Each now gets its own height ("lane") wherever two of
  // them would overlap.
  const lanesByRow = new Map(); // parents' row -> the lanes used, each a list of groups
  const others = [...groups.values()].filter((g) => !g.main).sort((a, b) => a.minX - b.minX);
  for (const group of others) {
    const rowY = pos[group.parents[0]].y;
    if (!lanesByRow.has(rowY)) lanesByRow.set(rowY, []);
    const lanes = lanesByRow.get(rowY);
    let lane = lanes.findIndex((used) => used.every((g) => g.maxX + SIBLING_GAP < group.minX));
    if (lane < 0) lane = lanes.push([]) - 1;
    lanes[lane].push(group);
    group.lane = lane;
  }
  const OTHER_TOP = 12; // highest lane: this far below the parents' boxes
  const OTHER_BOTTOM = ROW_GAP - 32; // lowest lane, just above the children's own bar

  for (const group of groups.values()) {
    const parentY = pos[group.parents[0]].y;
    const { fromX } = group;
    const fromY = group.parents.length > 1 ? parentY + NODE_H / 2 : parentY + NODE_H;
    let busY = parentY + NODE_H + ROW_GAP - 22;
    if (!group.main) {
      const laneCount = lanesByRow.get(parentY).length;
      const step = laneCount > 1 ? Math.min(10, (OTHER_BOTTOM - OTHER_TOP) / (laneCount - 1)) : 0;
      busY = parentY + NODE_H + OTHER_BOTTOM - group.lane * step;
    }
    const xs = group.children.map(centreX);
    lines.push({ ...vLine(fromX, fromY, busY), ids: group.parents });
    lines.push({ ...hLine(Math.min(fromX, ...xs), Math.max(fromX, ...xs), busY), ids: group.parents });
    group.children.forEach((id) => {
      lines.push({ ...vLine(centreX(id), busY, pos[id].y), ids: group.parents });
      (childLinks[id] = childLinks[id] || []).push({ parents: group.parents, fromX, fromY, busY });
    });
  }

  // ---- 9. Open/close buttons under anyone who has a branch below them ----
  const toggles = [];
  for (const unit of units) {
    if (unit.hidden || unit.treeChildren.length === 0) continue;
    toggles.push({
      key: unit.key,
      anchorId: unit.members[0],
      x: unit.x + ownWidth(unit) / 2 - TOGGLE_SIZE / 2,
      y: unit.y + NODE_H + 8,
      collapsed: collapsed.has(unit.key),
      count: countPeople(unit),
    });
  }

  return {
    nodes,
    lines,
    toggles,
    pos,
    childLinks,
    width: Math.max(cursor - TREE_GAP, PADDING) + PADDING,
    height: PADDING * 2 + (maxRow + 1) * NODE_H + maxRow * ROW_GAP + TOGGLE_SIZE + 16,
  };
}
