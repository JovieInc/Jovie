/**
 * Certified landing-page grammar.
 *
 * This is a projection of the existing marketing registry, not a second
 * component catalog. Family entries point at canonical section/shell IDs and
 * variants are resolved from MARKETING_SECTION_REGISTRY at read time.
 */

import {
  getMarketingRegistryEntry,
  getMarketingSectionRegistryEntry,
} from './componentRegistry';
import type { RecipeId } from './recipes';
import { MARKETING_RECIPES } from './recipes';
import type { MarketingSectionId } from './sections';
import { getMarketingSection } from './sections';

export const LANDING_PAGE_GRAMMAR_SCHEMA =
  'jovie.landing-page-grammar/v1' as const;

export const LANDING_PAGE_PIPELINE_STAGES = [
  'classify-intent',
  'choose-section-jobs',
  'choose-variants',
  'fit-copy',
  'choose-media-strategy',
  'render-locked-atoms',
  'evaluate-composition',
] as const;

export type LandingPagePipelineStage =
  (typeof LANDING_PAGE_PIPELINE_STAGES)[number];

export const LANDING_PAGE_FAMILY_IDS = [
  'hero',
  'logo-proof',
  'feature',
  'spec-grid',
  'testimonial',
  'faq',
  'footer-cta',
  'nav',
] as const;

export type LandingPageFamilyId = (typeof LANDING_PAGE_FAMILY_IDS)[number];

interface LandingPageFamily {
  readonly id: LandingPageFamilyId;
  readonly registryIds: readonly string[];
  readonly contentSlots: readonly string[];
  readonly mediaStrategies: readonly string[];
  readonly lockedAtoms: readonly string[];
  readonly lockedTokens: readonly string[];
  readonly invariantIds: readonly string[];
  readonly certifiedRefs: readonly string[];
}

const SHARED_ATOMS = ['MarketingContainer', 'SystemBTypography'] as const;
const SHARED_TOKENS = [
  'optical-grid:4px',
  'control:32/510',
  'control-compact:28/620',
] as const;

export const LANDING_PAGE_FAMILIES: readonly LandingPageFamily[] = [
  {
    id: 'hero',
    registryIds: ['section.hero'],
    contentSlots: ['headline', 'subhead', 'primaryCta', 'secondaryCta'],
    mediaStrategies: [
      'none',
      'real-product-screenshot',
      'phone-product',
      'claim-handle-interaction',
      'reference-led-editorial',
      'code-cli',
    ],
    lockedAtoms: [...SHARED_ATOMS, 'MarketingHero'],
    lockedTokens: SHARED_TOKENS,
    invariantIds: ['one-hero', 'hero-first', 'one-display-scale-moment'],
    certifiedRefs: ['section.hero', 'recipe.homepage'],
  },
  {
    id: 'logo-proof',
    registryIds: ['section.logo-cloud'],
    contentSlots: ['logos', 'proofSource'],
    mediaStrategies: ['verified-logo-assets', 'omit'],
    lockedAtoms: [...SHARED_ATOMS, 'HomeTrustSection'],
    lockedTokens: SHARED_TOKENS,
    invariantIds: ['verified-proof-or-omit'],
    certifiedRefs: ['section.logo-cloud'],
  },
  {
    id: 'feature',
    registryIds: [
      'section.feature-grid',
      'section.feature-split',
      'section.how-it-works',
      'section.capture',
      'section.monetization',
      'section.ownership',
    ],
    contentSlots: ['eyebrow', 'headline', 'body', 'items'],
    mediaStrategies: [
      'real-product-screenshot',
      'focused-product-callout',
      'phone-product',
      'animation-lottie',
      'reference-led-editorial',
      'none',
    ],
    lockedAtoms: [...SHARED_ATOMS, 'MarketingSectionShell'],
    lockedTokens: SHARED_TOKENS,
    invariantIds: ['one-job-per-section', 'approved-media-ladder'],
    certifiedRefs: ['section.feature-grid', 'section.feature-split'],
  },
  {
    id: 'spec-grid',
    registryIds: [
      'section.spec-wall',
      'section.stats',
      'section.comparison',
      'section.pricing',
    ],
    contentSlots: ['headline', 'body', 'items'],
    mediaStrategies: ['none', 'focused-product-callout'],
    lockedAtoms: [...SHARED_ATOMS, 'MarketingGrid'],
    lockedTokens: SHARED_TOKENS,
    invariantIds: ['responsive-grid-contract', 'verified-stats-or-omit'],
    certifiedRefs: ['section.spec-wall', 'section.stats'],
  },
  {
    id: 'testimonial',
    registryIds: ['section.social-proof'],
    contentSlots: ['quote', 'attribution', 'proofSource'],
    mediaStrategies: ['verified-portrait', 'none', 'omit'],
    lockedAtoms: [...SHARED_ATOMS, 'ArtistProfileSocialProof'],
    lockedTokens: SHARED_TOKENS,
    invariantIds: ['verified-proof-or-omit', 'attribution-required'],
    certifiedRefs: ['section.social-proof'],
  },
  {
    id: 'faq',
    registryIds: ['section.faq'],
    contentSlots: ['headline', 'items'],
    mediaStrategies: ['none'],
    lockedAtoms: [...SHARED_ATOMS, 'FaqSection'],
    lockedTokens: SHARED_TOKENS,
    invariantIds: ['keyboard-operable', 'answer-intent-preserved'],
    certifiedRefs: ['section.faq'],
  },
  {
    id: 'footer-cta',
    registryIds: [
      'section.cta',
      'shell.final-cta',
      'shell.footer-cta',
      'shell.footer',
    ],
    contentSlots: ['headline', 'primaryCta', 'secondaryCta'],
    mediaStrategies: ['none'],
    lockedAtoms: [...SHARED_ATOMS, 'MarketingTerminalCta', 'MarketingFooter'],
    lockedTokens: SHARED_TOKENS,
    invariantIds: ['canonical-footer-only', 'recipe-cta-cadence'],
    certifiedRefs: ['shell.footer', 'shell.footer-cta', 'shell.final-cta'],
  },
  {
    id: 'nav',
    registryIds: ['shell.header'],
    contentSlots: ['brand', 'links', 'primaryAction'],
    mediaStrategies: ['none'],
    lockedAtoms: ['MarketingHeader', 'HeaderNav'],
    lockedTokens: [...SHARED_TOKENS, 'marketing-glass'],
    invariantIds: ['canonical-navigation-only'],
    certifiedRefs: ['shell.header'],
  },
] as const;

export const LANDING_PAGE_ROUTE_TYPES = MARKETING_RECIPES.map(recipe => ({
  id: recipe.id,
  audience: recipe.audience,
  allowedFamilies: LANDING_PAGE_FAMILY_IDS.filter(familyId =>
    LANDING_PAGE_FAMILIES.find(
      family => family.id === familyId
    )?.registryIds.some(
      registryId =>
        registryId.startsWith('shell.') ||
        recipe.sectionOrder.includes(
          registryId.replace('section.', '') as MarketingSectionId
        )
    )
  ),
  sectionJobs: recipe.sectionOrder,
  maxSections: recipe.maxContent.maxSections,
  referenceRoute: recipe.referenceRoute ?? null,
}));

export const LANDING_PAGE_HOMEPAGE_LOCK = {
  routeType: 'homepage',
  maxSections: 9,
  sectionJobs: MARKETING_RECIPES.find(recipe => recipe.id === 'homepage')
    ?.sectionOrder,
  primaryAction: 'Find me',
  tasteOwner: 'Tim',
  canonicalShellIds: ['shell.header', 'shell.footer'],
} as const;

/** Lightweight Pen projection: instances resolve back to canonical registry roots. */
export const LANDING_PAGE_PEN_WORKSPACE = {
  schema: 'jovie.landing-page-pen-workspace/v1',
  profile: 'jovie-landing-page-composer',
  purpose: 'lightweight-founder-composition',
  canonicalRegistry: 'MARKETING_COMPONENT_REGISTRY',
  propagation: 'canonical-master-to-instance',
  instances: LANDING_PAGE_FAMILIES.flatMap(family =>
    family.registryIds.map(registryId => ({ familyId: family.id, registryId }))
  ),
} as const;

export interface LandingPageStageReceipt {
  readonly stage: LandingPagePipelineStage;
  readonly status: 'pass' | 'fail';
  readonly artifactDigest: string;
  readonly evaluatorId: string;
}

export interface LandingPageSectionCandidate {
  readonly instanceId: string;
  readonly familyId: string;
  readonly registryId: string;
  readonly variantId: string;
  readonly source: string | null;
  readonly penRootIds: readonly string[];
  readonly atomIds: readonly string[];
  readonly tokenIds: readonly string[];
}

export interface LandingPageCandidate {
  readonly routeType: string;
  readonly primaryAction: string;
  readonly sections: readonly LandingPageSectionCandidate[];
  readonly stageReceipts: readonly LandingPageStageReceipt[];
}

export type LandingPageCertificationCode =
  | 'unknown-route-type'
  | 'unknown-family'
  | 'family-registry-mismatch'
  | 'noncanonical-local-remix'
  | 'unregistered-variant'
  | 'missing-locked-atom'
  | 'missing-locked-token'
  | 'duplicate-instance-id'
  | 'too-many-sections'
  | 'homepage-section-lock'
  | 'homepage-action-lock'
  | 'pipeline-stage-order'
  | 'pipeline-stage-failed'
  | 'pipeline-artifact-mismatch';

export interface LandingPageCertificationFinding {
  readonly code: LandingPageCertificationCode;
  readonly subject: string;
  readonly message: string;
}

export function certifyLandingPageComposition(
  candidate: LandingPageCandidate
): readonly LandingPageCertificationFinding[] {
  const findings: LandingPageCertificationFinding[] = [];
  const route = LANDING_PAGE_ROUTE_TYPES.find(
    item => item.id === candidate.routeType
  );
  const maxSections =
    candidate.routeType === LANDING_PAGE_HOMEPAGE_LOCK.routeType
      ? LANDING_PAGE_HOMEPAGE_LOCK.maxSections
      : route?.maxSections;
  if (!route) {
    findings.push({
      code: 'unknown-route-type',
      subject: candidate.routeType,
      message: 'Route type is not registered.',
    });
  } else if (maxSections && candidate.sections.length > maxSections) {
    findings.push({
      code: 'too-many-sections',
      subject: candidate.routeType,
      message: `Composition exceeds the ${maxSections}-section route budget.`,
    });
  }

  if (
    candidate.routeType === LANDING_PAGE_HOMEPAGE_LOCK.routeType &&
    candidate.primaryAction !== LANDING_PAGE_HOMEPAGE_LOCK.primaryAction
  ) {
    findings.push({
      code: 'homepage-action-lock',
      subject: candidate.primaryAction,
      message: `Homepage primary action must remain ${LANDING_PAGE_HOMEPAGE_LOCK.primaryAction}.`,
    });
  }
  if (candidate.routeType === LANDING_PAGE_HOMEPAGE_LOCK.routeType) {
    const actualJobs = candidate.sections.map(section =>
      section.registryId.replace('section.', '')
    );
    const expectedJobs = LANDING_PAGE_HOMEPAGE_LOCK.sectionJobs ?? [];
    if (
      actualJobs.length !== expectedJobs.length ||
      actualJobs.some((job, index) => job !== expectedJobs[index])
    ) {
      findings.push({
        code: 'homepage-section-lock',
        subject: candidate.routeType,
        message:
          'Homepage composition must preserve the locked nine section jobs.',
      });
    }
  }

  const instances = new Set<string>();
  for (const section of candidate.sections) {
    if (instances.has(section.instanceId)) {
      findings.push({
        code: 'duplicate-instance-id',
        subject: section.instanceId,
        message: 'Section instance IDs must be unique.',
      });
    }
    instances.add(section.instanceId);

    const family = LANDING_PAGE_FAMILIES.find(
      item => item.id === section.familyId
    );
    if (!family) {
      findings.push({
        code: 'unknown-family',
        subject: section.familyId,
        message: 'Section family is not certified.',
      });
      continue;
    }
    if (!family.registryIds.includes(section.registryId)) {
      findings.push({
        code: 'family-registry-mismatch',
        subject: section.instanceId,
        message: `${section.registryId} does not belong to ${family.id}.`,
      });
      continue;
    }

    const registry = getMarketingRegistryEntry(section.registryId);
    if (
      !registry ||
      section.source !== registry.resolvedSource ||
      section.penRootIds.length !== registry.penRootIds.length ||
      section.penRootIds.some(
        root => !registry.penRootIds.includes(root as never)
      )
    ) {
      findings.push({
        code: 'noncanonical-local-remix',
        subject: section.instanceId,
        message:
          'Source or Pen identity does not match the canonical registry entry.',
      });
    }

    const sectionRegistry = section.registryId.startsWith('section.')
      ? getMarketingSectionRegistryEntry(section.registryId.slice(8))
      : null;
    if (
      sectionRegistry &&
      !sectionRegistry.variants.includes(section.variantId)
    ) {
      findings.push({
        code: 'unregistered-variant',
        subject: section.instanceId,
        message: `${section.registryId}/${section.variantId} is not certified.`,
      });
    }

    for (const atomId of family.lockedAtoms) {
      if (!section.atomIds.includes(atomId)) {
        findings.push({
          code: 'missing-locked-atom',
          subject: section.instanceId,
          message: `Missing locked atom ${atomId}.`,
        });
      }
    }
    for (const tokenId of family.lockedTokens) {
      if (!section.tokenIds.includes(tokenId)) {
        findings.push({
          code: 'missing-locked-token',
          subject: section.instanceId,
          message: `Missing locked token ${tokenId}.`,
        });
      }
    }
  }

  const digest = candidate.stageReceipts[0]?.artifactDigest;
  LANDING_PAGE_PIPELINE_STAGES.forEach((stage, index) => {
    const receipt = candidate.stageReceipts[index];
    if (receipt?.stage !== stage) {
      findings.push({
        code: 'pipeline-stage-order',
        subject: stage,
        message: `Stage ${stage} is missing or out of order.`,
      });
      return;
    }
    if (receipt.status !== 'pass') {
      findings.push({
        code: 'pipeline-stage-failed',
        subject: stage,
        message: `Stage ${stage} did not pass.`,
      });
    }
    if (!digest || receipt.artifactDigest !== digest) {
      findings.push({
        code: 'pipeline-artifact-mismatch',
        subject: stage,
        message:
          'Every evaluation receipt must bind to the same candidate digest.',
      });
    }
  });

  return findings;
}

export function getLandingPageVariantIds(
  familyId: LandingPageFamilyId
): readonly string[] {
  const family = LANDING_PAGE_FAMILIES.find(item => item.id === familyId);
  if (!family) return [];
  return family.registryIds.flatMap(registryId => {
    const entry = registryId.startsWith('section.')
      ? getMarketingSectionRegistryEntry(registryId.slice(8))
      : null;
    return entry?.variants ?? ['canonical'];
  });
}

export function getLandingPageSlots(
  sectionId: MarketingSectionId
): readonly string[] {
  const section = getMarketingSection(sectionId);
  return [...section.requiredInputs, ...section.optionalInputs];
}

export function getLandingPageRouteType(
  routeType: RecipeId
): (typeof LANDING_PAGE_ROUTE_TYPES)[number] {
  const route = LANDING_PAGE_ROUTE_TYPES.find(item => item.id === routeType);
  if (!route) throw new Error(`Unknown landing-page route type: ${routeType}`);
  return route;
}
