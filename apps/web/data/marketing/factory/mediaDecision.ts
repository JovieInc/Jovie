/**
 * Marketing page factory: media decision (JOV-7250, epic JOV-7244).
 *
 * `decideMedium` picks one medium per section from an ordered rule table
 * (first match wins) and `resolveMediaSourcing` picks where that medium comes
 * from. Both are pure: the screenshot registry, certified Pen refs and the
 * virtual model roster are injected, so the stage is deterministic and
 * snapshot-tested. Nothing here generates, fetches or spends; generation is
 * a request that apps/web/scripts/marketing-media/ fulfils behind the
 * mediaExport.ts seam.
 *
 * Hard lines: video is always click-to-play, never autoplay; person imagery
 * is an owned or licensed photo or an eligible characterSystem virtual
 * model, never stock; product UI is never generated, only captured.
 */

import { z } from 'zod';
import {
  JOVIE_MARKETING_CHARACTER_SYSTEM,
  type MarketingCharacterSystem,
} from '../characterSystem';
import {
  MARKETING_MEDIA_RECIPE_SOURCE_MATRIX,
  type MarketingMediaRecipeId,
} from '../mediaRecipes';
import type { RecipeId } from '../recipes';
import type { MarketingSectionId, VariantMedia } from '../sections';
import {
  type EditorialMediaIntent,
  EditorialMediaIntentSchema,
  FACTORY_MEDIA_KINDS,
  type FactoryStageArtifact,
} from './spine';

export const FACTORY_MEDIA_DECISION_VERSION = '1.0.0';

export type FactoryMedium = (typeof FACTORY_MEDIA_KINDS)[number];

/**
 * Projection onto the section variant axis. The factory medium set is a
 * superset: lottie, photo and the text-native media have no variant value.
 */
export const FACTORY_MEDIUM_TO_VARIANT_MEDIA: Readonly<
  Record<FactoryMedium, VariantMedia | null>
> = {
  'product-shot': 'bordered-screenshot',
  phone: 'phone',
  video: 'video',
  lottie: null,
  illustration: 'illustration',
  photo: null,
  callout: null,
  table: null,
  code: 'code',
  none: 'none',
};

/**
 * Registered media recipe per medium. Text-native media (table, code, none)
 * render in the section's own typography and carry no recipe.
 */
export const FACTORY_MEDIUM_RECIPES: Readonly<
  Record<FactoryMedium, MarketingMediaRecipeId | null>
> = {
  'product-shot': 'dark-glass',
  phone: 'compact-glass',
  video: 'dark-glass',
  lottie: 'flowing-accent',
  illustration: 'soft-editorial-background',
  photo: 'soft-editorial-background',
  callout: 'compact-glass',
  table: null,
  code: null,
  none: null,
};

// ─────────────────────────────────────────────────────────────────────────────
// Input
// ─────────────────────────────────────────────────────────────────────────────

export const FACTORY_MEDIA_SECTION_JOBS = [
  'hero',
  'proof',
  'feature',
  'number',
  'comparison',
  'abstract',
  'steps',
  'identity',
  'person',
  'faq',
  'cta',
  'prose',
] as const;

export type FactoryMediaSectionJob =
  (typeof FACTORY_MEDIA_SECTION_JOBS)[number];

/** Default media job for each canonical section id. */
export const FACTORY_MEDIA_JOB_BY_SECTION_ID: Readonly<
  Record<MarketingSectionId, FactoryMediaSectionJob>
> = {
  hero: 'hero',
  'logo-cloud': 'proof',
  'feature-grid': 'feature',
  'feature-split': 'feature',
  'how-it-works': 'steps',
  'social-proof': 'person',
  stats: 'number',
  pricing: 'comparison',
  comparison: 'comparison',
  faq: 'faq',
  cta: 'cta',
  'product-gallery': 'feature',
  'spec-wall': 'feature',
  capture: 'feature',
  monetization: 'feature',
  ownership: 'abstract',
  'content-prose': 'prose',
  'blog-feed': 'prose',
};

/** The brief's target audiences plus developer; a test keeps them in sync. */
export const FACTORY_MEDIA_AUDIENCES = [
  'artist',
  'fan',
  'agency',
  'label',
  'enterprise-buyer',
  'general',
  'developer',
] as const;

export type FactoryMediaAudience = (typeof FACTORY_MEDIA_AUDIENCES)[number];

/** Page families whose product surface is the phone profile. */
export const FACTORY_MOBILE_FIRST_FAMILIES: ReadonlySet<RecipeId> = new Set([
  'artist-lp',
]);

/** Audiences who meet the product on a phone first. */
export const FACTORY_MOBILE_FIRST_AUDIENCES: ReadonlySet<FactoryMediaAudience> =
  new Set(['fan']);

const Id = z.string().min(1);

/**
 * `stock` is accepted by the schema only so the decision can refuse it with
 * a trace entry instead of a parse error that hides why the photo was dropped.
 */
export const FACTORY_PHOTO_RIGHTS = ['owned', 'licensed', 'stock'] as const;

export const FactoryMediaEvidenceSchema = z.object({
  /** Screenshot scenario id (registered or proposed) showing the aha screen. */
  captureScenario: Id.optional(),
  /** A recorded product demo that can sit behind a "watch demo" button. */
  liveDemo: z.object({ id: Id, posterScenario: Id.optional() }).optional(),
  /** Certified Pen node id for an illustration or step sequence. */
  penRef: Id.optional(),
  realPhoto: z
    .object({
      id: Id,
      rights: z.enum(FACTORY_PHOTO_RIGHTS),
      credit: Id,
    })
    .optional(),
  /** characterSystem model id, for example C02. */
  virtualModel: Id.optional(),
});

export type FactoryMediaEvidence = z.infer<typeof FactoryMediaEvidenceSchema>;

export const FactoryMediaDecisionInputSchema = z.object({
  sectionJob: z.enum(FACTORY_MEDIA_SECTION_JOBS),
  family: z.string().min(1),
  audience: z.enum(FACTORY_MEDIA_AUDIENCES),
  evidence: FactoryMediaEvidenceSchema,
  fold: z.enum(['above', 'below']),
  editorial: EditorialMediaIntentSchema.optional(),
});

export type FactoryMediaDecisionInput = z.infer<
  typeof FactoryMediaDecisionInputSchema
>;

// ─────────────────────────────────────────────────────────────────────────────
// Rules
// ─────────────────────────────────────────────────────────────────────────────

export const FACTORY_MEDIA_RULE_IDS = [
  'hero-capture',
  'proof-feature',
  'number-comparison',
  'abstract-below-fold',
  'identity-person',
  'developer-code',
  'degradation-ladder',
] as const;

export type FactoryMediaRuleId = (typeof FACTORY_MEDIA_RULE_IDS)[number];

export interface FactoryMediaTraceEntry {
  readonly rule: FactoryMediaRuleId;
  readonly outcome: 'matched' | 'skipped';
  readonly note: string;
}

export type FactoryPhotoSource = 'real-photo' | 'virtual-model';

export interface FactoryMediaDecision {
  readonly editorial?: EditorialMediaIntent;
  readonly medium: FactoryMedium;
  readonly recipeId: MarketingMediaRecipeId | null;
  readonly rule: FactoryMediaRuleId;
  readonly rationale: string;
  readonly trace: readonly FactoryMediaTraceEntry[];
  /** Video only. The type has no autoplay value on purpose. */
  readonly playback: 'click-to-play' | null;
  readonly photoSource: FactoryPhotoSource | null;
  /** Set when photoSource is virtual-model. */
  readonly characterId: string | null;
}

export interface FactoryMediaDecisionContext {
  /** Defaults to the canonical canon/virtual-models.json roster. */
  readonly characterSystem?: Pick<
    MarketingCharacterSystem,
    'models' | 'boardDecisions'
  >;
}

interface RuleMatch {
  readonly medium: FactoryMedium;
  readonly rationale: string;
  readonly photoSource?: FactoryPhotoSource;
  readonly characterId?: string;
}

type RuleResult = RuleMatch | { readonly skip: string };

interface RuleEnv {
  readonly input: FactoryMediaDecisionInput;
  readonly characters: NonNullable<
    FactoryMediaDecisionContext['characterSystem']
  >;
}

const skip = (reason: string): RuleResult => ({ skip: reason });

/** Eligible means an active model whose board decision clears campaigns. */
export function isEligibleVirtualModel(
  characterId: string,
  characters: NonNullable<
    FactoryMediaDecisionContext['characterSystem']
  > = JOVIE_MARKETING_CHARACTER_SYSTEM
): boolean {
  const model = characters.models.find(entry => entry.id === characterId);
  const board = characters.boardDecisions.find(
    entry => entry.id === characterId
  );
  return (
    model?.status === 'active' && board?.campaignEligibility === 'eligible'
  );
}

function isMobileFirst(input: FactoryMediaDecisionInput): boolean {
  return (
    FACTORY_MOBILE_FIRST_FAMILIES.has(input.family as RecipeId) ||
    FACTORY_MOBILE_FIRST_AUDIENCES.has(input.audience)
  );
}

const RULES: Readonly<
  Record<FactoryMediaRuleId, (env: RuleEnv) => RuleResult>
> = {
  'hero-capture': ({ input }) => {
    if (input.sectionJob !== 'hero') return skip('not a hero');
    if (!input.evidence.captureScenario) return skip('hero has no capture');
    return isMobileFirst(input)
      ? {
          medium: 'phone',
          rationale: `Hero shows the aha capture ${input.evidence.captureScenario} in a phone frame for a mobile-first page.`,
        }
      : {
          medium: 'product-shot',
          rationale: `Hero shows the aha capture ${input.evidence.captureScenario} as a product shot.`,
        };
  },
  'proof-feature': ({ input }) => {
    if (input.sectionJob !== 'proof' && input.sectionJob !== 'feature') {
      return skip('not a proof or feature job');
    }
    if (input.evidence.captureScenario) {
      return {
        medium: 'product-shot',
        rationale: `The ${input.sectionJob} is shown with the real capture ${input.evidence.captureScenario}.`,
      };
    }
    if (input.evidence.liveDemo) {
      return {
        medium: 'video',
        rationale: `The ${input.sectionJob} is shown with demo ${input.evidence.liveDemo.id} behind a watch demo button, click to play.`,
      };
    }
    return skip(`${input.sectionJob} has no capture or demo`);
  },
  'number-comparison': ({ input }) => {
    if (input.sectionJob === 'comparison') {
      return {
        medium: 'table',
        rationale:
          'Comparisons render as a text-native table that answer engines can quote.',
      };
    }
    if (input.sectionJob === 'number') {
      return {
        medium: 'callout',
        rationale:
          'A number renders as a text-native callout that answer engines can quote.',
      };
    }
    return skip('not a number or comparison job');
  },
  'abstract-below-fold': ({ input }) => {
    if (input.sectionJob !== 'abstract' && input.sectionJob !== 'steps') {
      return skip('not an abstract or steps job');
    }
    if (input.fold !== 'below') {
      return skip('abstract art never carries the first screen');
    }
    return input.sectionJob === 'steps'
      ? {
          medium: 'lottie',
          rationale: 'A step sequence below the fold animates as Lottie.',
        }
      : {
          medium: 'illustration',
          rationale: 'An abstract idea below the fold gets an illustration.',
        };
  },
  'identity-person': ({ input, characters }) => {
    if (input.sectionJob !== 'identity' && input.sectionJob !== 'person') {
      return skip('not an identity or person job');
    }
    const photo = input.evidence.realPhoto;
    if (photo && photo.rights !== 'stock') {
      return {
        medium: 'photo',
        photoSource: 'real-photo',
        rationale: `Uses the ${photo.rights} photo ${photo.id} (credit ${photo.credit}).`,
      };
    }
    const modelId = input.evidence.virtualModel;
    if (modelId && isEligibleVirtualModel(modelId, characters)) {
      return {
        medium: 'photo',
        photoSource: 'virtual-model',
        characterId: modelId,
        rationale: `Uses the campaign-eligible virtual model ${modelId} from the character system.`,
      };
    }
    const refused = [
      photo?.rights === 'stock' ? `stock photo ${photo.id} refused` : null,
      modelId ? `virtual model ${modelId} is not campaign-eligible` : null,
    ].filter(Boolean);
    return skip(
      refused.length > 0
        ? `${refused.join('; ')}; never stock`
        : 'no owned, licensed or virtual-model photo'
    );
  },
  'developer-code': ({ input }) =>
    input.audience === 'developer'
      ? {
          medium: 'code',
          rationale: 'Developers read code, so the section shows a snippet.',
        }
      : skip('audience is not developer'),
  'degradation-ladder': ({ input }) =>
    input.evidence.captureScenario
      ? {
          medium: 'product-shot',
          rationale: `No rule fit; the ladder's next rung is the real capture ${input.evidence.captureScenario}.`,
        }
      : {
          medium: 'none',
          rationale:
            'No rule fit and no capture exists; the ladder ends at no media.',
        },
};

/** Pure: same input and roster give the same decision and trace. */
export function decideMedium(
  rawInput: FactoryMediaDecisionInput,
  context: FactoryMediaDecisionContext = {}
): FactoryMediaDecision {
  const input = FactoryMediaDecisionInputSchema.parse(rawInput);
  const env: RuleEnv = {
    input,
    characters: context.characterSystem ?? JOVIE_MARKETING_CHARACTER_SYSTEM,
  };
  const trace: FactoryMediaTraceEntry[] = [];

  for (const rule of FACTORY_MEDIA_RULE_IDS) {
    const result = RULES[rule](env);
    if ('skip' in result) {
      trace.push({ rule, outcome: 'skipped', note: result.skip });
      continue;
    }
    trace.push({ rule, outcome: 'matched', note: result.rationale });
    return {
      ...(input.editorial ? { editorial: input.editorial } : {}),
      medium: result.medium,
      recipeId: FACTORY_MEDIUM_RECIPES[result.medium],
      rule,
      rationale: result.rationale,
      trace,
      playback: result.medium === 'video' ? 'click-to-play' : null,
      photoSource: result.photoSource ?? null,
      characterId: result.characterId ?? null,
    };
  }

  // The ladder always matches; this keeps the return type total.
  throw new Error('media decision: degradation ladder did not terminate');
}

/** Media plan entry for the spine's media-decision stage artifact. */
export function toFactoryMediaPlanSection(
  sectionInstanceId: string,
  decision: FactoryMediaDecision
): FactoryStageArtifact<'media-decision'>['sections'][number] {
  return {
    sectionInstanceId,
    ...(decision.editorial ? { editorial: decision.editorial } : {}),
    editorialStatus: decision.editorial ? 'authored' : 'legacy-unqualified',
    medium: decision.medium,
    decision: 'deterministic',
    reason: `${decision.rule}: ${decision.rationale}`,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Sourcing order
// ─────────────────────────────────────────────────────────────────────────────

export const FACTORY_MEDIA_SOURCING_ORDER = [
  'registry-capture',
  'capture-request',
  'pen-ref',
  'generation',
] as const;

export type FactoryMediaSourcingStep =
  (typeof FACTORY_MEDIA_SOURCING_ORDER)[number];

export type FactoryMediaSourcing =
  | {
      readonly kind: 'text-native';
      readonly reason: string;
    }
  | {
      readonly kind: 'registry-capture';
      readonly scenarioId: string;
    }
  | {
      readonly kind: 'capture-request';
      /** Proposed scenario id, or null when the capture owner must name it. */
      readonly scenarioId: string | null;
      readonly reason: string;
    }
  | {
      readonly kind: 'rights-cleared-photo';
      readonly photoId: string;
      readonly rights: 'owned' | 'licensed';
      readonly credit: string;
    }
  | {
      readonly kind: 'pen-ref';
      readonly penRef: string;
    }
  | {
      readonly kind: 'generation';
      readonly modality: 'image' | 'lottie';
      readonly recipeId: MarketingMediaRecipeId;
      readonly characterId: string | null;
      /** Every generated asset ships with both of these or not at all. */
      readonly requires: readonly ['provenance', 'art-evaluator'];
    };

export interface FactoryMediaSourcingContext {
  /** Registered screenshot scenario with a public marketing export. */
  readonly isRegisteredCapture: (scenarioId: string) => boolean;
  /** Pen node certified for marketing reuse (not a founder-locked master). */
  readonly isCertifiedPenRef: (penRef: string) => boolean;
}

const CAPTURED_MEDIA: ReadonlySet<FactoryMedium> = new Set([
  'product-shot',
  'phone',
  'video',
]);

const TEXT_NATIVE_MEDIA: ReadonlySet<FactoryMedium> = new Set([
  'callout',
  'table',
  'code',
  'none',
]);

function canGenerate(recipeId: MarketingMediaRecipeId | null): boolean {
  return (
    recipeId !== null &&
    MARKETING_MEDIA_RECIPE_SOURCE_MATRIX[recipeId].includes('generated-artwork')
  );
}

/**
 * Walks the sourcing order: screenshot registry, then a new capture
 * scenario, then a certified Pen ref, then generation. Product UI stops at a
 * capture request; it is never generated.
 */
export function resolveMediaSourcing(
  decision: FactoryMediaDecision,
  evidence: FactoryMediaEvidence,
  context: FactoryMediaSourcingContext
): FactoryMediaSourcing {
  if (TEXT_NATIVE_MEDIA.has(decision.medium)) {
    return {
      kind: 'text-native',
      reason: `${decision.medium} renders from copy and needs no asset.`,
    };
  }

  if (CAPTURED_MEDIA.has(decision.medium)) {
    const scenarioId =
      decision.medium === 'video'
        ? (evidence.liveDemo?.posterScenario ?? evidence.captureScenario)
        : evidence.captureScenario;
    if (scenarioId && context.isRegisteredCapture(scenarioId)) {
      return { kind: 'registry-capture', scenarioId };
    }
    return {
      kind: 'capture-request',
      scenarioId: scenarioId ?? null,
      reason: scenarioId
        ? `Scenario ${scenarioId} is not registered yet; add it to lib/screenshots/registry.ts.`
        : `No capture scenario covers this ${decision.medium}; product UI is captured, never generated.`,
    };
  }

  if (decision.photoSource === 'real-photo' && evidence.realPhoto) {
    const { id, rights, credit } = evidence.realPhoto;
    if (rights !== 'stock') {
      return { kind: 'rights-cleared-photo', photoId: id, rights, credit };
    }
  }

  if (
    decision.medium !== 'photo' &&
    evidence.penRef &&
    context.isCertifiedPenRef(evidence.penRef)
  ) {
    return { kind: 'pen-ref', penRef: evidence.penRef };
  }

  const recipeId = decision.recipeId;
  if (recipeId === null || !canGenerate(recipeId)) {
    throw new Error(
      `media sourcing: ${decision.medium} has no generation-capable recipe`
    );
  }
  return {
    kind: 'generation',
    modality: decision.medium === 'lottie' ? 'lottie' : 'image',
    recipeId,
    characterId: decision.characterId,
    requires: ['provenance', 'art-evaluator'],
  };
}
