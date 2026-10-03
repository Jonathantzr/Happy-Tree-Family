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
export const NODE_H = 76;
export const TOGGLE_SIZE = 28;
const SPOUSE_GAP = 16; // between husband and wife
const SIBLING_GAP = 28; // between brothers/sisters (and their branches)
const ROW_GAP = 76; // between one generation and the next
const TREE_GAP = 56; // between separate, unconnected trees
const PADDING = 40; // empty margin around the whole drawing
const LINE = 2;

function vLine(x, y1, y2) {
  return { x: x - LINE / 2, y: Math.min(y1, y2), w: LINE, h: Math.abs(y2 - y1) };
}
function hLine(x1, x2, y) {
  return { x: Math.min(x1, x2) - LINE / 2, y: y - LINE / 2, w: Math.abs(x2 - x1) + LINE, h: LINE };
}

// people: persons in a stable order (oldest record first)
// graph: from buildGraph() in lib/relationships.js
// collapsed: Set of unit keys whose branch is folded away
export function layoutTree(people, graph, collapsed) {
  const order = new Map(people.map((p, i) => [p.id, i]));

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
      // eldest on the left; anyone without a birth date goes after those with one
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
      // the one born into this branch stands on the left, whoever married in on the right
      kid.members.sort((x, y) => {
        const xIn = graph.parentsOf(x).some((pid) => unitOf.get(pid) === unit) ? 0 : 1;
        const yIn = graph.parentsOf(y).some((pid) => unitOf.get(pid) === unit) ? 0 : 1;
        return xIn - yIn || order.get(x) - order.get(y);
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
    const neighbours = [];
    claimBranch(unit, neighbours);
    // the "other side's" family goes straight after this tree
    neighbours.map(topOf).forEach(placeRoot);
  }

  // climbs to the oldest ancestors above a unit
  function topOf(unit) {
    let top = unit;
    for (let i = 0; i < units.length && top.parentUnits.length; i++) top = top.parentUnits[0];
    return top;
  }

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
    lines.push(hLine(centreX(unit.members[0]), centreX(unit.members[unit.members.length - 1]), unit.y + NODE_H / 2));
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
  for (const group of groups.values()) {
    const parentY = pos[group.parents[0]].y;
    const fromX = group.parents.reduce((sum, pid) => sum + centreX(pid), 0) / group.parents.length;
    const fromY = group.parents.length > 1 ? parentY + NODE_H / 2 : parentY + NODE_H;
    const busY = parentY + NODE_H + ROW_GAP - (group.main ? 22 : 32);
    const xs = group.children.map(centreX);
    lines.push(vLine(fromX, fromY, busY));
    lines.push(hLine(Math.min(fromX, ...xs), Math.max(fromX, ...xs), busY));
    group.children.forEach((id) => lines.push(vLine(centreX(id), busY, pos[id].y)));
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
    width: Math.max(cursor - TREE_GAP, PADDING) + PADDING,
    height: PADDING * 2 + (maxRow + 1) * NODE_H + maxRow * ROW_GAP + TOGGLE_SIZE + 16,
  };
}
