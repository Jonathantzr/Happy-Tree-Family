// lib/traditions.js
// The app starts neutral: a plain family tree for any family. Parts that only
// make sense for one culture are switched on per FAMILY (not per person — a
// family can be mixed, and one person can be in two families), from the
// optional "Family traditions" question when a family is created, or later in
// Family settings. More than one can be picked, for mixed families.
// Needs the Stage 6.5a database updates: supabase/stage6_5a-family-traditions.sql
// and supabase/stage6_5a2-tradition-requests.sql ("Something else?").
//
// To hide something for families that don't use it, ask followsChinese(list)
// (or add a similar helper) — don't check a person's race or language.

import { supabase } from './supabase';

// What a family can pick, and what picking it switches on today. When this
// list grows past a handful, group it (e.g. by region) rather than making it longer.
export const TRADITIONS = [
  { key: 'chinese', label: 'Chinese', adds: 'Adds the generation name book and Chinese names.' },
  { key: 'malay', label: 'Malay', adds: 'Nothing extra yet — it tells us what to build next.' },
  { key: 'indian', label: 'Indian', adds: 'Nothing extra yet — it tells us what to build next.' },
];

// The family's list, e.g. ['chinese']. Before the database update has been
// run there is nothing to read, so it behaves as the app did before: Chinese on.
export async function getTraditions(familyId) {
  const { data, error } = await supabase.from('families').select('traditions').eq('id', familyId).maybeSingle();
  if (error) return ['chinese'];
  return data?.traditions || [];
}

// The list plus the "Something else?" text, for Family settings.
export async function getTraditionDetails(familyId) {
  const traditions = await getTraditions(familyId);
  const { data } = await supabase.from('families').select('tradition_other').eq('id', familyId).maybeSingle();
  return { traditions, other: data?.tradition_other || '' };
}

// The fields to save for a family. "Something else?" is only sent when there
// is (or was) text in it, so saving still works before its database update.
export function traditionFields(list, other, previousOther = '') {
  const fields = { traditions: list };
  if ((other || '').trim() || (previousOther || '').trim()) fields.tradition_other = (other || '').trim() || null;
  return fields;
}

// Admins only (the database refuses anyone else once Stage 5f is run).
export async function saveTraditions(familyId, list, other, previousOther) {
  const { data, error } = await supabase
    .from('families')
    .update(traditionFields(list, other, previousOther))
    .eq('id', familyId)
    .select('id');
  if (!error && (!data || data.length === 0)) return { error: { message: 'Nothing was saved — only family admins can change this.' } };
  return { error };
}

export function followsChinese(list) {
  return (list || []).includes('chinese');
}
