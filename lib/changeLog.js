// lib/changeLog.js
// Recent changes with Undo (Stage 6.5c). The database writes down every
// change to people, links, stories, grave directions and steps
// (supabase/stage6_5c-recent-changes.sql); this file reads that list and
// turns it into plain sentences. Undo itself happens in the database
// (undo_change_batch), so it can put back everything a save touched.

import { supabase } from './supabase';
import { describeChangeValue } from './profile';

const FIELD_WORDS = {
  name_en: 'Name',
  name_cn: 'Chinese name',
  name_pinyin: 'Name',
  gender: 'Gender',
  birth_date: 'Birth date',
  death_date: 'Date of passing',
  is_deceased: 'Has passed away',
  summary: 'Life summary',
  occupation: 'Occupation',
  hometown: 'Hometown',
  cemetery_name: 'Cemetery',
  cemetery_address: 'Address',
  cemetery_map_link: 'Map link',
  general_notes: 'Notes',
  title: 'Title',
  description: 'Details',
  distance_hint: 'How far / landmark',
  photo_url: 'Photo',
};

function personName(row) {
  return row?.name_en || row?.name_pinyin || row?.name_cn || 'someone';
}

function shorten(text, max = 60) {
  const s = String(text);
  return s.length > max ? `${s.slice(0, max - 1)}…` : s;
}

// "Name: Lee Ah Kow → Lee Ah Kau"
function fieldLine(field, before, after) {
  const word = FIELD_WORDS[field] || field;
  if (field === 'photo_url') return after ? 'Photo changed' : 'Photo removed';
  const show = (v) => shorten(describeChangeValue(field, v));
  return `${word}: ${show(before)} → ${show(after)}`;
}

// The changes for one family, newest first, grouped into saves:
// [{ batch, when, who, isNew, undone, undoneBy, title, lines, warning, personId, personName }]
// seenAt = when this admin last looked (getChangesSeenAt), for isNew.
// Returns { saves, error, ready } — ready is false until the database update is run.
export async function loadRecentChanges(familyId, people, seenAt) {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const { data, error } = await supabase
    .from('change_log')
    .select('*')
    .eq('family_id', familyId)
    .eq('via_undo', false)
    .order('id', { ascending: false })
    .limit(300);
  if (error) return { saves: [], error, ready: false };

  const byId = new Map((people || []).map((p) => [p.id, p]));
  const stillHere = new Set(byId.keys());
  // names of people who have since been deleted, from the list itself
  for (const e of data || []) {
    if (e.table_name === 'persons' && !byId.has(e.row_key)) byId.set(e.row_key, e.old_row || e.new_row);
  }
  const nameOf = (id) => personName(byId.get(id));

  const groups = new Map();
  for (const e of data || []) {
    if (!groups.has(e.batch)) groups.set(e.batch, []);
    groups.get(e.batch).push(e);
  }

  // saves by other people after this are "new" (same rule as unseen_changes()
  // in supabase/stage6_5c2-change-badges.sql; never looked = the last 7 days)
  const newAfter = seenAt ? new Date(seenAt).getTime() : Date.now() - 7 * 24 * 3600 * 1000;

  const saves = [...groups.values()].map((entries) => {
    const first = entries[0];
    const text = describeSave(entries, nameOf);
    const mine = first.changed_by === user?.id;
    const who = mine ? 'You' : first.changed_by_name || (first.changed_by ? 'A family member' : 'A database update');
    return {
      batch: first.batch,
      when: first.changed_at,
      who,
      isNew: !mine && new Date(first.changed_at).getTime() > newAfter,
      undone: !!first.undone_at,
      undoneBy: first.undone_by === user?.id ? 'you' : first.undone_by_name || 'an admin',
      ...text,
      // who did it starts the sentence: "Ah Kow added Lee Mei Ling"
      title: `${who} ${text.title.charAt(0).toLowerCase()}${text.title.slice(1)}`,
      // only offer "Open" for people who are still in the family
      personId: stillHere.has(text.personId) ? text.personId : null,
      personName: text.personId ? nameOf(text.personId) : null,
    };
  });
  return { saves, error: null, ready: true };
}

// One save -> { title, lines, warning } (warning = what Undo will do, for the popup)
function describeSave(entries, nameOf) {
  // the person row leads, when there is one (e.g. deleting someone also
  // deletes their links and story in the same save)
  const main = entries.find((e) => e.table_name === 'persons') || entries[entries.length - 1];
  const row = main.new_row || main.old_row || {};
  const whose = nameOf(main.person_id);
  const extra = entries.length - 1;
  const lines = [];
  let title;
  let warning;

  if (main.table_name === 'persons') {
    const name = personName(row);
    if (main.action === 'insert') {
      title = `Added ${name}`;
      warning = `${name} will be removed again, along with anything added to them since (links, story, directions).`;
    } else if (main.action === 'delete') {
      title = `Deleted ${name}`;
      if (extra > 0) lines.push('Their links, story and directions were deleted with them.');
      warning = `${name} will be put back, with their links, story and directions.`;
    } else {
      title = `Changed ${name}'s details`;
      (main.changed_fields || []).forEach((f) => lines.push(fieldLine(f, main.old_row?.[f], main.new_row?.[f])));
      warning = `${name}'s details go back to how they were.`;
    }
  } else if (main.table_name === 'person_relationships') {
    const linkText = (r) =>
      r.relation_type === 'spouse'
        ? `${nameOf(r.person_id)} and ${nameOf(r.related_person_id)} as husband and wife`
        : `${nameOf(r.related_person_id)} as a parent of ${nameOf(r.person_id)}`;
    const a = nameOf(row.person_id);
    const b = nameOf(row.related_person_id);
    // the app often saves more than one link at once (e.g. the second parent,
    // linked automatically) — each one gets its own line
    entries
      .filter((e) => e !== main)
      .forEach((e) => lines.push(`Also ${e.action === 'delete' ? 'unlinked' : 'linked'} ${linkText(e.new_row || e.old_row || {})}`));
    const several = entries.length > 1;
    if (main.action === 'delete') {
      title = `Removed the link: ${linkText(row)}`;
      warning = several ? 'These links will be put back.' : 'The link will be put back.';
    } else if (main.action === 'insert') {
      title = `Linked ${linkText(row)}`;
      warning = several ? 'These links will be removed again. Nobody is deleted.' : 'The link will be removed again. Nobody is deleted.';
    } else {
      title = `Changed a link between ${a} and ${b}`;
      warning = 'The link goes back to how it was.';
    }
  } else if (main.table_name === 'biographies') {
    const before = main.old_row?.photo_urls || [];
    const after = main.new_row?.photo_urls || [];
    const fields = (main.changed_fields || []).filter((f) => f !== 'photo_urls');
    if (main.action === 'delete') title = `Deleted ${whose}'s story`;
    else if (after.length > before.length && fields.length === 0) title = `Added a photo of ${whose}`;
    else if (after.length < before.length && fields.length === 0) title = `Removed a photo of ${whose}`;
    else title = main.action === 'insert' ? `Started ${whose}'s story` : `Changed ${whose}'s story`;
    fields.forEach((f) => lines.push(fieldLine(f, main.old_row?.[f], main.new_row?.[f])));
    if (main.action === 'insert' && row.summary) lines.push(`"${shorten(row.summary, 80)}"`);
    warning = main.action === 'insert' ? `${whose}'s story will be empty again.` : `${whose}'s story and photos go back to how they were.`;
  } else if (main.table_name === 'graves') {
    if (main.action === 'insert') title = `Added where ${whose}'s grave is (${row.cemetery_name || 'cemetery'})`;
    else if (main.action === 'delete') title = `Deleted the directions to ${whose}'s grave`;
    else title = `Changed the directions to ${whose}'s grave`;
    (main.changed_fields || []).forEach((f) => lines.push(fieldLine(f, main.old_row?.[f], main.new_row?.[f])));
    warning = main.action === 'insert' ? 'The directions will be removed again, with their steps.' : 'The directions go back to how they were.';
  } else {
    const step = `"${shorten(row.title || 'a step', 40)}"`;
    if (main.action === 'insert') title = `Added a step to ${whose}'s grave directions: ${step}`;
    else if (main.action === 'delete') title = `Deleted a step from ${whose}'s grave directions: ${step}`;
    else title = `Changed a step in ${whose}'s grave directions: ${step}`;
    (main.changed_fields || []).forEach((f) => lines.push(fieldLine(f, main.old_row?.[f], main.new_row?.[f])));
    warning = main.action === 'insert' ? 'The step will be removed again.' : 'The step goes back to how it was.';
  }
  return { title, lines, warning, personId: main.person_id };
}

// ---- the red "new changes" counts (supabase/stage6_5c2-change-badges.sql) ----

// { familyId: number of new saves by other people } for every family where
// you are an admin. Empty before the database update has been run.
export async function getUnseenCounts() {
  const { data, error } = await supabase.rpc('unseen_changes');
  if (error) return {};
  return Object.fromEntries((data || []).map((r) => [r.family_id, Number(r.unseen)]));
}

// When you last opened Recent changes for this family (null = never).
export async function getChangesSeenAt(familyId) {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const { data, error } = await supabase
    .from('family_members')
    .select('changes_seen_at')
    .eq('family_id', familyId)
    .eq('user_id', user?.id)
    .maybeSingle();
  return error ? null : data?.changes_seen_at || null;
}

export function markChangesSeen(familyId) {
  return supabase.rpc('mark_changes_seen', { p_family_id: familyId });
}

export function undoSave(familyId, batch) {
  return supabase.rpc('undo_change_batch', { p_family_id: familyId, p_batch: batch });
}

// "5 min ago", "3 hours ago", "yesterday", or a date
export function timeAgo(iso) {
  const then = new Date(iso);
  const minutes = Math.round((Date.now() - then.getTime()) / 60000);
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} hour${hours === 1 ? '' : 's'} ago`;
  const days = Math.round(hours / 24);
  if (days === 1) return 'yesterday';
  if (days < 7) return `${days} days ago`;
  return `${String(then.getDate()).padStart(2, '0')}/${String(then.getMonth() + 1).padStart(2, '0')}/${then.getFullYear()}`;
}
