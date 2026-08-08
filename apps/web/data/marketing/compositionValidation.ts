/** Runtime closed-world composition gate shared by routes, Storybook, and Pencil. */

import {
  getMarketingSectionRegistryEntry,
  MARKETING_COMPOSITION_CONTRACT,
} from './componentRegistry';
import type { MarketingComposition } from './composition';
import { MARKETING_SPEC_VERSION } from './spec';

export type MarketingCompositionValidationCode =
  | 'spec-version-mismatch'
  | 'empty-composition'
  | 'hero-cardinality'
  | 'hero-order'
  | 'unregistered-section'
  | 'unregistered-variant'
  | 'duplicate-cardinality';

export interface MarketingCompositionValidationIssue {
  readonly code: MarketingCompositionValidationCode;
  readonly message: string;
  readonly sectionId?: string;
  readonly variantId?: string;
}

export interface MarketingCompositionValidationResult {
  readonly valid: boolean;
  readonly issues: readonly MarketingCompositionValidationIssue[];
}

export function validateMarketingComposition(
  composition: MarketingComposition
): MarketingCompositionValidationResult {
  const issues: MarketingCompositionValidationIssue[] = [];
  const add = (
    code: MarketingCompositionValidationCode,
    message: string,
    sectionId?: string,
    variantId?: string
  ) => issues.push({ code, message, sectionId, variantId });
  const hero = MARKETING_COMPOSITION_CONTRACT.hero;

  if (composition.specVersion !== MARKETING_SPEC_VERSION) {
    add(
      'spec-version-mismatch',
      `composition specVersion ${composition.specVersion} does not match ${MARKETING_SPEC_VERSION}`
    );
  }
  if (composition.sections.length === 0) {
    add('empty-composition', 'a marketing composition must contain a section');
  }

  const heroIndexes = composition.sections.flatMap((section, index) =>
    section.sectionId === hero.sectionId ? [index] : []
  );
  if (heroIndexes.length !== hero.exactly) {
    add(
      'hero-cardinality',
      `a marketing composition must contain exactly ${hero.exactly} hero`,
      hero.sectionId
    );
  }
  if (hero.first && heroIndexes[0] !== undefined && heroIndexes[0] !== 0) {
    add(
      'hero-order',
      'the hero must be the first section in a marketing composition',
      hero.sectionId
    );
  }

  const counts = new Map<string, number>();
  for (const section of composition.sections) {
    const entry = getMarketingSectionRegistryEntry(section.sectionId);
    if (!entry) {
      add(
        'unregistered-section',
        `section ${section.sectionId} is not registered in ${MARKETING_COMPOSITION_CONTRACT.sections.source}`,
        section.sectionId,
        section.variantId
      );
      continue;
    }

    const count = (counts.get(section.sectionId) ?? 0) + 1;
    counts.set(section.sectionId, count);
    if (!entry.variants.includes(section.variantId)) {
      add(
        'unregistered-variant',
        `variant ${section.sectionId}/${section.variantId} is not registered`,
        section.sectionId,
        section.variantId
      );
    }
    if (
      entry.maxPerComposition !== undefined &&
      count > entry.maxPerComposition
    ) {
      add(
        'duplicate-cardinality',
        `${section.sectionId} may appear at most ${entry.maxPerComposition} time in a composition`,
        section.sectionId,
        section.variantId
      );
    }
  }
  return { valid: issues.length === 0, issues };
}

export function assertMarketingComposition(
  composition: MarketingComposition
): MarketingComposition {
  const result = validateMarketingComposition(composition);
  if (!result.valid) {
    throw new Error(
      [
        'Marketing composition registry gate failed:',
        ...result.issues.map(issue => `- [${issue.code}] ${issue.message}`),
      ].join('\n')
    );
  }
  return composition;
}
