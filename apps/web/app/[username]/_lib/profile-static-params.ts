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
    void captureError('Failed to load profile static params', error, {
      route: '/[username]',
      limit,
    }).catch(() => {
      // Ignore telemetry failures so the static param fallback stays resilient.
    });
    // Build-time DB failures should not block deployment.
    return [];
  }
}
