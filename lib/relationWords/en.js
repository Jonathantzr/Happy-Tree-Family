// lib/relationWords/en.js
// ENGLISH words for relationships. This file only turns relationship FACTS
// (worked out in lib/relationships.js -> relationFacts) into words — it does
// no family-tree logic of its own.
//
// To add another language later (Malay, Chinese, Tamil...): copy this file,
// change the words, and register it in LANGUAGES in lib/relationships.js.
// The facts already carry what those languages need: father's/mother's side,
// the gender of everyone along the line, and who is older.
//
// Returns { text, side, standalone }:
//   text       lower-case phrase, e.g. "dad's elder brother", "cousin"
//   side       "dad's side" / "mum's side" / null (when not already in the text)
//   standalone true when it doesn't read as "your ..." (e.g. "related through Mei's marriage")

function pick(gender, ifM, ifF, ifOther) {
  if (gender === 'M') return ifM;
  if (gender === 'F') return ifF;
  return ifOther;
}

const greats = (n) => 'great-'.repeat(Math.max(0, n));
const AGE = { older: 'elder ', younger: 'younger ', unknown: '' };
const ORDINALS = ['first', 'second', 'third', 'fourth', 'fifth', 'sixth'];
const REMOVED = ['', ' once removed', ' twice removed', ' three times removed', ' four times removed'];

// A blood relative, e.g. up 3 / down 0 = great-grandmother
function bloodWords(f) {
  const { up, down, gender } = f;
  const sideWords = f.side === 'father' ? "dad's side" : f.side === 'mother' ? "mum's side" : null;
  const side = up >= 2 ? sideWords : null;

  if (down === 0) {
    if (up === 1) return { text: pick(gender, 'father', 'mother', 'parent'), side: null };
    return { text: greats(up - 2) + pick(gender, 'grandfather', 'grandmother', 'grandparent'), side };
  }
  if (up === 0) {
    if (down === 1) return { text: pick(gender, 'son', 'daughter', 'child'), side: null };
    return { text: greats(down - 2) + pick(gender, 'grandson', 'granddaughter', 'grandchild'), side: null };
  }
  if (up === 1 && down === 1) {
    return { text: AGE[f.age] + pick(gender, 'brother', 'sister', 'sibling'), side: null };
  }
  if (up === 2 && down === 1) {
    // uncles and aunts are spelled out: "dad's elder brother", "mum's younger sister"
    const parent = f.side === 'father' ? "dad's" : f.side === 'mother' ? "mum's" : "parent's";
    return { text: `${parent} ${AGE[f.branchAge]}${pick(gender, 'brother', 'sister', 'sibling')}`, side: null };
  }
  if (down === 1) return { text: greats(up - 2) + pick(gender, 'uncle', 'aunt', 'aunt/uncle'), side };
  if (up === 1) return { text: greats(down - 2) + pick(gender, 'nephew', 'niece', 'niece/nephew'), side: null };

  const degree = Math.min(up, down) - 1;
  const removed = Math.abs(up - down);
  if (degree === 1 && removed === 0) return { text: 'cousin', side };
  const ordinal = ORDINALS[degree - 1] || `${degree}th`;
  return { text: `${ordinal} cousin${REMOVED[removed] ?? ` ${removed} times removed`}`, side };
}

export default function english(facts, nameOf) {
  const gender = facts.gender;
  switch (facts.kind) {
    case 'blood':
      return { ...bloodWords(facts), standalone: false };

    case 'spouse':
      return { text: pick(gender, 'husband', 'wife', 'spouse'), side: null, standalone: false };

    // married to one of your blood relatives — an in-law, never a relative
    // in their own right (your cousin's wife is "cousin's wife", not a cousin)
    case 'spouseOfBlood': {
      const { up, down } = facts.partner;
      let text;
      if (up === 0 && down === 1) text = pick(gender, 'son-in-law', 'daughter-in-law', 'child-in-law');
      else if (up === 1 && down === 1) text = pick(gender, 'brother-in-law', 'sister-in-law', 'sibling-in-law');
      else if (up === 1 && down === 0) text = pick(gender, 'stepfather', 'stepmother', 'step-parent');
      else text = `${bloodWords(facts.partner).text}'s ${pick(gender, 'husband', 'wife', 'spouse')}`;
      return { text, side: null, standalone: false };
    }

    // a blood relative of your husband/wife
    case 'bloodOfSpouse': {
      const { up, down } = facts.inner;
      let text;
      if (up === 1 && down === 0) text = pick(gender, 'father-in-law', 'mother-in-law', 'parent-in-law');
      else if (up === 1 && down === 1) text = pick(gender, 'brother-in-law', 'sister-in-law', 'sibling-in-law');
      else if (up === 0 && down === 1) text = pick(gender, 'stepson', 'stepdaughter', 'stepchild');
      else text = `${pick(facts.spouseGender, "husband's", "wife's", "spouse's")} ${bloodWords(facts.inner).text}`;
      return { text, side: null, standalone: false };
    }

    // only connected through someone's marriage, further away than the above
    case 'marriage':
      return {
        text: facts.throughIsViewer ? 'related through marriage' : `related through ${nameOf(facts.through)}'s marriage`,
        side: null,
        standalone: true,
      };

    default:
      return { text: 'not linked to the family tree yet', side: null, standalone: true };
  }
}
