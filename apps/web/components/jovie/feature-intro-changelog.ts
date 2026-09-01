import {
  changelogInlineText,
  type ChangelogRelease,
  type ChangelogSection,
} from '@/lib/changelog-parser';
import { FEATURE_INTRO_CATALOG } from './feature-intro-catalog';
import type {
  FeatureIntroAccent,
  FeatureIntroBullet,
  FeatureIntroCatalog,
} from './feature-intro-contract';

const CHANGELOG_WHATS_NEW_ID_PREFIX = 'changelog';
const CHANGELOG_SECTION_ORDER = [
  'featured',
  'added',
  'changed',
  'fixed',
  'removed',
] as const satisfies readonly (keyof ChangelogSection)[];
const BULLET_ACCENTS = [
  'accent',
  'blue',
  'orange',
] as const satisfies readonly FeatureIntroAccent[];

function sourceIdForRelease(release: ChangelogRelease): string {
  return `${CHANGELOG_WHATS_NEW_ID_PREFIX}:${release.version}`;
}

function buildChangelogBullets(
  release: ChangelogRelease
): FeatureIntroBullet[] {
  const bullets: FeatureIntroBullet[] = [];

  for (const section of CHANGELOG_SECTION_ORDER) {
    for (const entry of release.sections[section]) {
      const text = changelogInlineText(entry).trim();
      if (!text) continue;

      bullets.push({
        id: `${release.version}:${section}:${bullets.length}`,
        text,
        accent: BULLET_ACCENTS[bullets.length % BULLET_ACCENTS.length],
      });
    }
  }

  return bullets;
}

export function featureIntroCatalogFromChangelogRelease(
  release: ChangelogRelease | null | undefined
): FeatureIntroCatalog {
  if (!release?.version.trim()) return FEATURE_INTRO_CATALOG;

  const whatsNewItems = buildChangelogBullets(release);
  if (whatsNewItems.length === 0) return FEATURE_INTRO_CATALOG;

  return {
    highlight: null,
    whatsNewID: sourceIdForRelease(release),
    whatsNewItems,
  };
}

export function featureIntroCatalogFromChangelogReleases(
  releases: readonly ChangelogRelease[]
): FeatureIntroCatalog {
  return featureIntroCatalogFromChangelogRelease(releases[0]);
}
