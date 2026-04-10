import { captureError } from '@/lib/error-tracking';
import { getTopProfilesForStaticGeneration } from '@/lib/services/profile/queries';

export async function getProfileStaticParams(limit = 100): Promise<
  Array<{
    username: string;
  }>
> {
  try {
    return await getTopProfilesForStaticGeneration(limit);
  } catch (error) {
    await captureError('Failed to load profile static params', error, {
      route: '/[username]',
      limit,
    });
    // Build-time DB failures should not block deployment.
    return [];
  }
}
