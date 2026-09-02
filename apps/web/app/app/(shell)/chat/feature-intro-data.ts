import 'server-only';

import { featureIntroCatalogFromChangelogReleases } from '@/components/jovie/feature-intro-changelog';
import type { FeatureIntroCatalog } from '@/components/jovie/feature-intro-contract';
import { getChangelogReleases } from '@/lib/changelog-source';

export async function loadFeatureIntroCatalog(): Promise<FeatureIntroCatalog> {
  const releases = await getChangelogReleases();
  return featureIntroCatalogFromChangelogReleases(releases);
}
