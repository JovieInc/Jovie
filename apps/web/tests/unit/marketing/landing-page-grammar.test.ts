import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  certifyLandingPageComposition,
  getLandingPageRouteType,
  getLandingPageSlots,
  getLandingPageVariantIds,
  LANDING_PAGE_FAMILIES,
  LANDING_PAGE_HOMEPAGE_LOCK,
  LANDING_PAGE_PEN_WORKSPACE,
  LANDING_PAGE_PIPELINE_STAGES,
  LANDING_PAGE_ROUTE_TYPES,
  MARKETING_COMPONENT_REGISTRY,
} from '@/data/marketing';

const heroRegistry = MARKETING_COMPONENT_REGISTRY.find(
  entry => entry.id === 'section.hero'
);
const heroFamily = LANDING_PAGE_FAMILIES.find(entry => entry.id === 'hero');
const repoRoot = resolve(__dirname, '../../../../..');

function receipts(digest = 'candidate-a') {
  return LANDING_PAGE_PIPELINE_STAGES.map(stage => ({
    stage,
    status: 'pass' as const,
    artifactDigest: digest,
    evaluatorId: `eval-${stage}`,
  }));
}

function heroCandidate() {
  if (!heroRegistry || !heroFamily)
    throw new Error('hero registry unavailable');
  return {
    instanceId: 'hero-1',
    familyId: 'hero',
    registryId: 'section.hero',
    variantId: 'centered-none',
    source: heroRegistry.resolvedSource,
    penRootIds: heroRegistry.penRootIds,
    atomIds: heroFamily.lockedAtoms,
    tokenIds: heroFamily.lockedTokens,
  };
}

function homepageSections() {
  return (LANDING_PAGE_HOMEPAGE_LOCK.sectionJobs ?? []).map(
    (sectionId, index) => {
      const registryId = `section.${sectionId}`;
      const registry = MARKETING_COMPONENT_REGISTRY.find(
        entry => entry.id === registryId
      );
      const family = LANDING_PAGE_FAMILIES.find(entry =>
        entry.registryIds.includes(registryId)
      );
      if (!registry || registry.kind !== 'section' || !family)
        throw new Error(`registry projection unavailable for ${registryId}`);
      return {
        instanceId: `${sectionId}-${index}`,
        familyId: family.id,
        registryId,
        variantId: registry.defaultVariant,
        source: registry.resolvedSource,
        penRootIds: registry.penRootIds,
        atomIds: family.lockedAtoms,
        tokenIds: family.lockedTokens,
      };
    }
  );
}

describe('certified landing-page grammar', () => {
  it('projects enumerable families, route types, variants, and Pen instances from canonical registry ids', () => {
    expect(LANDING_PAGE_FAMILIES.map(family => family.id)).toEqual([
      'hero',
      'logo-proof',
      'feature',
      'spec-grid',
      'testimonial',
      'faq',
      'footer-cta',
      'nav',
    ]);
    expect(LANDING_PAGE_ROUTE_TYPES.map(route => route.id)).toContain(
      'homepage'
    );
    expect(getLandingPageVariantIds('hero')).toEqual(
      expect.arrayContaining(['centered-none', 'left-none'])
    );
    expect(LANDING_PAGE_PEN_WORKSPACE.instances).toContainEqual({
      familyId: 'nav',
      registryId: 'shell.header',
    });
    expect(LANDING_PAGE_PEN_WORKSPACE.propagation).toBe(
      'canonical-master-to-instance'
    );
    const workspaceLocks = JSON.parse(
      readFileSync(
        resolve(repoRoot, 'scripts/agent/pen-workspace-locks.json'),
        'utf8'
      )
    );
    expect(
      workspaceLocks.profiles[LANDING_PAGE_PEN_WORKSPACE.profile].canonical_path
    ).toContain('Jovie Marketing Workspace.pen');
    expect(
      workspaceLocks.profiles[LANDING_PAGE_PEN_WORKSPACE.profile]
        .read_only_paths[0]
    ).toContain('canonical.lib.pen');
  });

  it('certifies a canonical candidate only after every ordered stage passes', () => {
    expect(
      certifyLandingPageComposition({
        routeType: 'homepage',
        primaryAction: LANDING_PAGE_HOMEPAGE_LOCK.primaryAction,
        sections: homepageSections(),
        stageReceipts: receipts(),
      })
    ).toEqual([]);
  });

  it('rejects local remixes, unknown variants, lock drift, and stale stage evidence', () => {
    const candidate = heroCandidate();
    const findings = certifyLandingPageComposition({
      routeType: 'homepage',
      primaryAction: 'Get started',
      sections: [
        {
          ...candidate,
          variantId: 'invented-kitchen-sink',
          source: 'components/local/HeroRemix.tsx',
          atomIds: [],
          tokenIds: [],
        },
      ],
      stageReceipts: receipts().map((receipt, index) =>
        index === 3
          ? {
              ...receipt,
              artifactDigest: 'stale-candidate',
              status: 'fail' as const,
            }
          : receipt
      ),
    });

    expect(findings.map(finding => finding.code)).toEqual(
      expect.arrayContaining([
        'homepage-action-lock',
        'homepage-section-lock',
        'noncanonical-local-remix',
        'unregistered-variant',
        'missing-locked-atom',
        'missing-locked-token',
        'pipeline-stage-failed',
        'pipeline-artifact-mismatch',
      ])
    );
  });

  it('keeps the homepage at the locked nine-section budget and Find me action', () => {
    expect(LANDING_PAGE_HOMEPAGE_LOCK.maxSections).toBe(9);
    expect(LANDING_PAGE_HOMEPAGE_LOCK.sectionJobs).toHaveLength(9);
    expect(LANDING_PAGE_HOMEPAGE_LOCK.primaryAction).toBe('Find me');
    expect(LANDING_PAGE_HOMEPAGE_LOCK.tasteOwner).toBe('Tim');
  });

  it('fails closed on malformed route, family, cardinality, and pipeline inputs', () => {
    const hero = heroCandidate();
    const findings = certifyLandingPageComposition({
      routeType: 'invented-route',
      primaryAction: 'Find me',
      sections: [
        { ...hero, familyId: 'invented-family' },
        { ...hero, instanceId: hero.instanceId, registryId: 'section.faq' },
      ],
      stageReceipts: receipts().slice(0, 2),
    });

    expect(findings.map(finding => finding.code)).toEqual(
      expect.arrayContaining([
        'unknown-route-type',
        'unknown-family',
        'duplicate-instance-id',
        'family-registry-mismatch',
        'pipeline-stage-order',
      ])
    );

    expect(
      certifyLandingPageComposition({
        routeType: 'homepage',
        primaryAction: 'Find me',
        sections: Array.from({ length: 10 }, (_, index) => ({
          ...hero,
          instanceId: `hero-${index}`,
        })),
        stageReceipts: receipts(),
      }).map(finding => finding.code)
    ).toContain('too-many-sections');
  });

  it('exposes canonical route and content-slot lookups', () => {
    expect(getLandingPageRouteType('homepage').sectionJobs).toHaveLength(9);
    expect(getLandingPageSlots('hero')).toEqual(
      expect.arrayContaining(['headline', 'primaryCta'])
    );
  });
});
