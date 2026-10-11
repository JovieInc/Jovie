import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { GET as getLlms, LLMS_TXT_CLAIM_IDS } from '@/app/llms.txt/route';
import {
  GET as getLlmsFull,
  LLMS_FULL_TXT_CLAIM_IDS,
} from '@/app/llms-full.txt/route';
import { getAlternative, getAlternativeSlugs } from './alternatives';
import { getComparison, getComparisonSlugs } from './comparisons';
import {
  PUBLISHED_CLAIM_RECEIPTS,
  type PublishedClaimId,
  SCOPED_CLAIM_SURFACE_HASHES,
  validatePublishedClaimReceipts,
} from './published-claims';

function digest(value: unknown): string {
  return createHash('sha256')
    .update(typeof value === 'string' ? value : JSON.stringify(value))
    .digest('hex');
}

function comparisonMaterial(slug: string): unknown {
  const data = getComparison(slug);
  if (!data) throw new Error(`Missing comparison ${slug}`);
  return {
    title: data.title,
    metaDescription: data.metaDescription,
    heroHeadline: data.heroHeadline,
    heroSubheadline: data.heroSubheadline,
    features: data.features,
    faq: data.faq,
    bottomLine: data.bottomLine,
    claimIds: data.claimIds,
  };
}

function alternativeMaterial(slug: string): unknown {
  const data = getAlternative(slug);
  if (!data) throw new Error(`Missing alternative ${slug}`);
  return {
    title: data.title,
    metaDescription: data.metaDescription,
    heroHeadline: data.heroHeadline,
    heroSubheadline: data.heroSubheadline,
    whySwitch: data.whySwitch,
    highlights: data.highlights,
    faq: data.faq,
    claimIds: data.claimIds,
  };
}

function allBoundClaimGroups(): readonly (readonly PublishedClaimId[])[] {
  const comparisonGroups = getComparisonSlugs().flatMap(slug => {
    const data = getComparison(slug);
    if (!data) throw new Error(`Missing comparison ${slug}`);
    return [
      data.claimIds,
      ...data.features.map(feature => feature.claimIds),
      ...data.faq.map(item => item.claimIds),
    ];
  });
  const alternativeGroups = getAlternativeSlugs().flatMap(slug => {
    const data = getAlternative(slug);
    if (!data) throw new Error(`Missing alternative ${slug}`);
    return [
      data.claimIds,
      ...data.whySwitch.map(item => item.claimIds),
      ...data.highlights.map(item => item.claimIds),
      ...data.faq.map(item => item.claimIds),
    ];
  });
  return [
    ...comparisonGroups,
    ...alternativeGroups,
    LLMS_TXT_CLAIM_IDS,
    LLMS_FULL_TXT_CLAIM_IDS,
  ];
}

describe('scoped published claim evidence', () => {
  it('binds every material content item to a current publish-safe receipt', () => {
    const groups = allBoundClaimGroups();
    expect(groups.length).toBeGreaterThan(0);
    for (const claimIds of groups) {
      expect(claimIds.length).toBeGreaterThan(0);
      expect(validatePublishedClaimReceipts(claimIds, new Date())).toEqual([]);
    }
  });

  it('keeps every scoped receipt in use and competitor evidence first-party', () => {
    const used = new Set(allBoundClaimGroups().flat());
    expect([...used].sort()).toEqual(
      Object.keys(PUBLISHED_CLAIM_RECEIPTS).sort()
    );

    for (const [id, receipt] of Object.entries(PUBLISHED_CLAIM_RECEIPTS)) {
      const allowedHost = id.startsWith('linktree.')
        ? 'linktr.ee'
        : id.startsWith('linkfire.')
          ? 'linkfire.com'
          : null;
      if (!allowedHost) continue;
      for (const evidence of receipt.evidence) {
        expect(new URL(evidence).hostname).toMatch(
          new RegExp(`(^|\\.)${allowedHost.replace('.', '\\.')}$`, 'u')
        );
      }
    }
  });

  it('makes missing and expired evidence observable', () => {
    expect(
      validatePublishedClaimReceipts(
        ['not-a-real-claim'],
        new Date('2026-10-01T00:00:00Z')
      ).map(issue => issue.code)
    ).toContain('unknown-claim');
    expect(
      validatePublishedClaimReceipts(
        ['linktree.contact-collection'],
        new Date('2026-12-16T00:00:00Z')
      ).map(issue => issue.code)
    ).toContain('expired');
  });

  it('pins the exact reviewed content for all six scoped routes', async () => {
    const actual = {
      '/compare/linktree': digest(comparisonMaterial('linktree')),
      '/compare/linkfire': digest(comparisonMaterial('linkfire')),
      '/alternatives/linktree': digest(alternativeMaterial('linktree')),
      '/alternatives/link-in-bio': digest(alternativeMaterial('link-in-bio')),
      '/llms.txt': digest(await getLlms().text()),
      '/llms-full.txt': digest(await getLlmsFull().text()),
    };

    expect(actual).toEqual(SCOPED_CLAIM_SURFACE_HASHES);
  });

  it('removes the known stale categorical and auth-provider claims', async () => {
    const comparisonCopy = JSON.stringify(
      getComparisonSlugs().map(comparisonMaterial)
    );
    const alternativeCopy = JSON.stringify(
      getAlternativeSlugs().map(alternativeMaterial)
    );
    const llmsCopy = `${await getLlms().text()}\n${await getLlmsFull().text()}`;

    expect(`${comparisonCopy}\n${alternativeCopy}`).not.toMatch(
      /no (?:fan|visitor|contact) collection|no update notifications/iu
    );
    expect(comparisonCopy).not.toMatch(
      /Linkfire (?:requires a paid subscription|is built for labels)/iu
    );
    expect(llmsCopy).not.toContain('**Authentication**: Clerk');
    expect(llmsCopy).toContain('**Authentication**: Self-hosted Better Auth');
  });
});
