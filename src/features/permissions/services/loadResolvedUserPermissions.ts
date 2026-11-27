import { supabase } from '../../../lib/supabase';

/**
 * Loads and resolves effective permissions for a non-admin user.
 * Returns the visible exact-key grants using the database precedence.
 * Browser-visible rows are not proof of complete authorization.
 * Rejects if a required query fails.
 *
 * Precedence: explicit position override, otherwise group OR level grant.
 * The key all is an ordinary exact key, not a wildcard.
 *
 * Network work is intentionally performed in two parallel phases instead of
 * a serial chain, while preserving the exact permission precedence above.
 */
export async function loadResolvedUserPermissions(
  userId: string,
): Promise<Record<string, boolean>> {
  // Phase 1: membership sources are independent and can be resolved together.
  const [membershipsResult, primaryMemberResult] = await Promise.all([
    supabase
      .from('user_group_members')
      .select('group_id')
      .eq('user_id', userId),
    supabase
      .from('org_position_members')
      .select('position_id, org_positions(level)')
      .eq('user_id', userId)
      .eq('is_primary', true)
      .maybeSingle(),
  ]);

  const membershipError = membershipsResult.error ?? primaryMemberResult.error;
  if (membershipError) throw membershipError;

  const memberships = membershipsResult.data || [];
  const primaryMember = primaryMemberResult.data;
  const groupIds = [...new Set(memberships.map((m: { group_id: string }) => m.group_id))];
  const positionId = primaryMember?.position_id || null;
  const posLevel = (primaryMember as unknown as { org_positions?: { level?: number } } | null)?.org_positions?.level;

  // Phase 2: once ids are known, all permission sources are independent reads.
  const [groupsResult, levelPermsResult, posPermsResult] = await Promise.all([
    groupIds.length > 0
      ? supabase.from('user_groups').select('permissions').in('id', groupIds)
      : Promise.resolve({ data: [] as Array<{ permissions: unknown }>, error: null }),
    posLevel != null
      ? supabase.from('org_level_permissions').select('permission_key, granted').eq('level', posLevel)
      : Promise.resolve({ data: [] as Array<{ permission_key: string; granted: boolean }>, error: null }),
    positionId
      ? supabase.from('org_position_permissions').select('permission_key, granted').eq('position_id', positionId)
      : Promise.resolve({ data: [] as Array<{ permission_key: string; granted: boolean }>, error: null }),
  ]);

  const permissionError = groupsResult.error ?? levelPermsResult.error ?? posPermsResult.error;
  if (permissionError) throw permissionError;
  if ((groupsResult.data?.length ?? 0) !== groupIds.length) {
    throw new Error("Incomplete group permission lookup");
  }

  const merged: Record<string, boolean> = {};

  for (const g of (groupsResult.data || [])) {
    const permissions = (g.permissions || {}) as Record<string, boolean>;
    Object.entries(permissions).forEach(([key, granted]) => {
      if (granted) merged[key] = true;
    });
  }

  for (const permission of (levelPermsResult.data || [])) {
    if (permission.granted) merged[permission.permission_key] = true;
  }

  for (const permission of (posPermsResult.data || [])) {
    if (permission.granted) merged[permission.permission_key] = true;
    else delete merged[permission.permission_key];
  }

  return merged;
}
