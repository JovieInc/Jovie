import type { DiscoveredTarget } from '../types';
import { discoverAllMusicTargets } from './providers/allmusic';

export async function discoverSubmissionTargets(params: {
  providerId: string;
  canonical: Parameters<typeof discoverAllMusicTargets>[0];
  existingTargets: DiscoveredTarget[];
}): Promise<DiscoveredTarget[]> {
  const { providerId, canonical, existingTargets } = params;
  const existingUrls = new Set(
    existingTargets.map(target => target.canonicalUrl)
  );

  let discovered: DiscoveredTarget[] = [];
  if (providerId === 'xperi_allmusic_email') {
    discovered = await discoverAllMusicTargets(canonical);
  }

  return discovered.filter(target => !existingUrls.has(target.canonicalUrl));
}
