import { getTopProfilesForStaticGeneration } from '@/lib/services/profile/queries';
import { logger } from '@/lib/utils/logger';

export async function getProfileStaticParams(limit = 100): Promise<
  Array<{
    username: string;
  }>
> {
  try {
    return await getTopProfilesForStaticGeneration(limit);
  } catch (error) {
    logger.error(
      'Failed to load profile static params',
      {
        error,
        limit,
        route: '/[username]',
      },
      'public-profile'
    );
    // Build-time DB failures should not block deployment.
    return [];
  }
}
