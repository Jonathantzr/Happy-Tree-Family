// lib/permissions.js
// Who can change what (Stage 6.5b). The DATABASE enforces the rules
// (supabase/stage6_5b-permissions.sql) — this file only asks it, so screens
// can hide buttons that would be refused anyway. Don't work the rules out
// again inside a screen.
//
// The rules:
// - Your circle = you, your husband/wife, parents, children, brothers, sisters.
// - You can change people in your circle and anything you added yourself.
//   Anyone can add a person, or the first story / grave directions.
// - Everything else goes to an admin as a change request.
// - Only admins delete people. Only the owner manages admins and members.

import { supabase } from './supabase';

// What the logged-in user may do with one person:
// { familyId, isAdmin, isOwner, canEdit, canEditStory, canEditGrave }.
// Before the database update has been run there is nothing to ask, so it
// behaves as the app did before: everything allowed (isAdmin: null = unknown).
export async function getPersonRights(personId) {
  const { data, error } = await supabase.rpc('htf_person_rights', { p_person_id: personId });
  if (error) return { familyId: null, isAdmin: null, isOwner: false, canEdit: true, canEditStory: true, canEditGrave: true };
  return {
    familyId: data?.family_id || null,
    isAdmin: !!data?.is_admin,
    isOwner: !!data?.is_owner,
    canEdit: !!data?.can_edit,
    canEditStory: !!data?.can_edit_story,
    canEditGrave: !!data?.can_edit_grave,
  };
}

// Everyone with an account in this family, the owner first, then admins.
// Returns { members: [{ userId, name, personName, role: 'owner' | 'admin' | 'member', isMe }],
//           removed: [{ userId, name }], myRole, ready }.
// ready is false until the Stage 6.5b database update has been run.
export async function loadMembers(familyId) {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const [{ data: family, error: familyError }, { data: rows, error }, { data: linked }, { data: blocks }] = await Promise.all([
    supabase.from('families').select('owner_id').eq('id', familyId).maybeSingle(),
    supabase.from('family_members').select('user_id, role').eq('family_id', familyId),
    supabase.from('persons').select('linked_user_id, name_en, name_pinyin, name_cn').eq('family_id', familyId).not('linked_user_id', 'is', null),
    supabase.from('family_blocks').select('user_id, display_name').eq('family_id', familyId),
  ]);
  if (error) return { members: [], removed: [], myRole: 'member', ready: !familyError, error };

  const ids = (rows || []).map((r) => r.user_id);
  const { data: accounts } = ids.length ? await supabase.from('users').select('id, display_name').in('id', ids) : { data: [] };
  const nameOf = new Map((accounts || []).map((a) => [a.id, a.display_name]));
  const personOf = new Map((linked || []).map((p) => [p.linked_user_id, p.name_en || p.name_pinyin || p.name_cn]));
  const ownerId = family?.owner_id || null;

  const rank = { owner: 0, admin: 1, member: 2 };
  const members = (rows || [])
    .map((r) => {
      const personName = personOf.get(r.user_id) || null;
      return {
        userId: r.user_id,
        name: nameOf.get(r.user_id) || personName || 'Family member',
        personName,
        role: r.user_id === ownerId ? 'owner' : r.role === 'admin' ? 'admin' : 'member',
        isMe: r.user_id === user?.id,
      };
    })
    .sort((a, b) => rank[a.role] - rank[b.role] || a.name.localeCompare(b.name));

  return {
    members,
    removed: (blocks || []).map((b) => ({ userId: b.user_id, name: b.display_name || 'Someone who was removed' })),
    myRole: members.find((m) => m.isMe)?.role || 'member',
    ready: !familyError,
  };
}

// Owner-only actions. Each returns { error }.
export function setMemberAdmin(familyId, userId, makeAdmin) {
  return supabase.rpc('set_member_admin', { p_family_id: familyId, p_user_id: userId, p_admin: makeAdmin });
}

export function removeMember(familyId, userId) {
  return supabase.rpc('remove_member', { p_family_id: familyId, p_user_id: userId });
}

export function allowMemberBack(familyId, userId) {
  return supabase.rpc('allow_member_back', { p_family_id: familyId, p_user_id: userId });
}

export function transferOwnership(familyId, userId) {
  return supabase.rpc('transfer_ownership', { p_family_id: familyId, p_user_id: userId });
}
