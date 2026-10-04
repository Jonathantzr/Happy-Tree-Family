// lib/profile.js
// "Who am I?" — the logged-in person's own details (name, birth date, gender,
// saved on their account in public.users) and their link to a person record
// in each family (persons.linked_user_id).
// Needs the Stage 5b database update: supabase/stage5b-who-am-i-and-requests.sql

import { supabase } from './supabase';
import { toISODate } from './personHelpers';

// Returns { id, display_name, birth_date, gender, profile_complete },
// or null if it couldn't be loaded (e.g. the database update hasn't been run yet).
export async function getMyProfile() {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;
  const { data, error } = await supabase
    .from('users')
    .select('id, display_name, birth_date, gender, profile_complete')
    .eq('id', user.id)
    .maybeSingle();
  if (error || !data) return null;
  return data;
}

// fields: { name, birthDate (JS Date or null), gender }
export async function saveMyProfile({ name, birthDate, gender }) {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: { message: 'You are not logged in.' } };
  const { data, error } = await supabase
    .from('users')
    .update({ display_name: name.trim(), birth_date: toISODate(birthDate), gender: gender || null, profile_complete: true })
    .eq('id', user.id)
    .select();
  if (!error && (!data || data.length === 0)) {
    return { error: { message: 'Nothing was saved — the Stage 5b database update may not have been run yet.' } };
  }
  return { error };
}

export async function claimPerson(personId) {
  return supabase.rpc('claim_person', { p_person_id: personId });
}

export async function releasePerson(personId) {
  return supabase.rpc('release_person', { p_person_id: personId });
}

// Adds the logged-in user to a family as a new person (from their account
// details) and links them to it. Returns { person, error }.
export async function addMeToFamily(familyId, profile) {
  const { data: person, error } = await supabase
    .from('persons')
    .insert({
      family_id: familyId,
      name_en: profile.display_name,
      gender: profile.gender || null,
      birth_date: profile.birth_date || null,
      date_precision: profile.birth_date ? 'exact' : 'unknown',
    })
    .select()
    .single();
  if (error) return { person: null, error };
  const { error: claimError } = await claimPerson(person.id);
  return { person, error: claimError };
}

function words(text) {
  return (text || '')
    .toLowerCase()
    .replace(/[.,'"()\-_/@&]/g, ' ')
    .split(/\s+/)
    .filter(Boolean);
}

// How likely a person record is to be the user (0 = no sign of a match).
// Families often use a nickname or short name, so any shared word, a name
// that starts the other ("Jon" / "Jonathan") or the same birth date counts.
export function matchScore(profile, person) {
  if (!profile) return 0;
  let score = 0;
  if (profile.birth_date && person.birth_date && profile.birth_date === person.birth_date) score += 3;
  const mine = words(profile.display_name);
  const theirs = words(person.name_en || person.name_pinyin || person.name_cn);
  if (mine.join(' ') && mine.join(' ') === theirs.join(' ')) score += 3;
  for (const a of mine) {
    for (const b of theirs) {
      if (a === b) score += 1;
      else if (a.length >= 3 && b.length >= 3 && (a.startsWith(b) || b.startsWith(a))) score += 1;
    }
  }
  return score;
}

// What's different between the user's own details and the family's record
// of them — the fields an admin would need to update. {} if nothing.
export function profileDifferences(profile, person) {
  const changes = {};
  if (!profile) return changes;
  const recordName = person.name_en || person.name_pinyin || person.name_cn || '';
  if (profile.display_name && profile.display_name.trim() !== recordName) changes.name_en = profile.display_name.trim();
  if (profile.birth_date && profile.birth_date !== person.birth_date) changes.birth_date = profile.birth_date;
  if (profile.gender && profile.gender !== person.gender) changes.gender = profile.gender;
  return changes;
}

const FIELD_LABELS = { name_en: 'Name', name_cn: 'Chinese name', birth_date: 'Birth date', gender: 'Gender' };
const GENDER_WORDS = { M: 'Male', F: 'Female', other: 'Other' };

export function describeChangeValue(field, value) {
  if (value === null || value === undefined || value === '') return '(blank)';
  if (field === 'birth_date') {
    const [y, m, d] = String(value).split('-');
    return `${d}/${m}/${y}`;
  }
  if (field === 'gender') return GENDER_WORDS[value] || value;
  return String(value);
}

// One line per change, e.g. "Name: Jon → Jonathan Tan"
export function describeChanges(changes, person) {
  return Object.keys(changes).map((field) => {
    const before = person ? describeChangeValue(field, person[field]) : null;
    const after = describeChangeValue(field, changes[field]);
    return `${FIELD_LABELS[field] || field}: ${before !== null ? `${before} → ` : ''}${after}`;
  });
}

// Sends a change request about a person to the family's admins.
export async function sendChangeRequest(familyId, personId, changes, note) {
  return supabase.from('change_requests').insert({ family_id: familyId, person_id: personId, changes, note: note || null });
}
