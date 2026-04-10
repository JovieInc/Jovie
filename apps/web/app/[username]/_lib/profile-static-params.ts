import { getTopProfilesForStaticGeneration } from '@/lib/services/profile/queries';

export async function getProfileStaticParams(limit = 100): Promise<
  Array<{
    username: string;
  }>
> {
  try {
    return await getTopProfilesForStaticGeneration(limit);
  } catch {
    // Build-time DB failures should not block deployment.
    return [];
  }
}
