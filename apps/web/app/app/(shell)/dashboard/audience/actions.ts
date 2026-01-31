'use server';

import { unstable_noStore as noStore } from 'next/cache';
import { getCachedAuth } from '@/lib/auth/cached';
import type { AudienceMember } from '@/types';
import { getAudienceServerData } from './audience-data';

/**
 * Fetch detailed audience member data including large JSON fields
 * (latestActions, referrerHistory) for sidebar detail view.
 *
 * This action is called when the user opens the audience member sidebar
 * to avoid loading large JSON payloads for all paginated rows.
 *
 * @param memberId - The audience member ID to fetch details for
 * @param selectedProfileId - The creator profile ID for ownership verification
 * @returns Full audience member data with details, or null if not found
 */
export async function getAudienceMemberDetails(params: {
  memberId: string;
  selectedProfileId: string;
}): Promise<AudienceMember | null> {
  noStore();
  const { userId } = await getCachedAuth();

  if (!userId) {
    throw new Error('Unauthorized');
  }

  // Fetch with includeDetails=true and memberId filter to get full JSON fields for one member
  const result = await getAudienceServerData({
    userId,
    selectedProfileId: params.selectedProfileId,
    searchParams: {
      page: '1',
      pageSize: '1',
    },
    includeDetails: true,
    memberId: params.memberId,
  });

  // Return the first (and only) row, or null if not found
  return result.rows[0] ?? null;
}
