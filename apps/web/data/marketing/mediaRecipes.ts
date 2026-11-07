/**
 * Approved marketing media recipes for the export / asset-generation pipeline.
 *
 * Contract slice 2 (JOV-6246): the four registered recipes — large
 * dark-glass product frame, compact glass module, soft editorial
 * background, coherent flowing-accent background — plus the typed
 * source / safe-area / motion / output axes with runtime validation.
 * The v3 request resolves current primitives; legacy chrome extraction
 * metadata remains compatible with existing header exports. No new taste.
 *
 * Visual standard: newer-hero / premium bar.
 * Bloom lock: gbrain:design/jovie-newer-hero-bloom-b-founder-locked-2026-09-17
 */

import { z } from 'zod';
import {
  EDITORIAL_BACKGROUND_FLOW,
  EDITORIAL_BACKGROUND_SOFT,
} from './editorialBackgrounds';
import { JOVIE_IMAGE_COLOR_POLICY } from './imageColorPolicy';
import {
  MARKETING_MEDIA_INPUTS,
  MARKETING_MEDIA_PRESENTATION_REVISION,
  MARKETING_MEDIA_REFERENCE_REVIEW,
  MARKETING_MEDIA_TOKEN_REVISION,
} from './mediaReferences';

export const JOVIE_MARKETING_MEDIA_RECIPE_SCHEMA =
  'jovie-marketing-media-recipe/v3';
export const JOVIE_MARKETING_MEDIA_RECIPE_VERSION = 'registered-media-v3';

export const MARKETING_MEDIA_RECIPE_IDS = [
  'compact-glass',
  'dark-glass',
  'flowing-accent',
  'soft-editorial-background',
] as const;

export type MarketingMediaRecipeId =
  (typeof MARKETING_MEDIA_RECIPE_IDS)[number];

export type MarketingMediaRecipeKind = 'surface' | 'background';

export type MarketingMediaRecipeFindingCode =
  | 'invalid-media-request'
  | 'stale-media-source'
  | 'unknown-media-recipe'
  | 'invented-media-taste'
  | 'unapproved-export-recipe'
  | 'dark-glass-geometry-drift'
  | 'dark-glass-material-drift'
  | 'compact-glass-material-drift'
  | 'editorial-background-drift'
  | 'flowing-accent-seam-drift'
  | 'flowing-accent-bloom-drift'
  | 'unsupported-recipe-source-combination'
  | 'unapproved-media-source-input'
  | 'missing-media-source-revision'
  | 'noncanonical-media-accent'
  | 'missing-safe-area-policy'
  | 'missing-motion-fallback-policy'
  | 'unsupported-output-profile';

export interface MarketingMediaRecipeFinding {
  readonly code: MarketingMediaRecipeFindingCode;
  readonly stage: 'asset-generation' | 'adversarial-review';
  readonly subject: string;
  readonly message: string;
}

export interface MarketingMediaRecipeDecision {
  readonly recipeId: string;
  readonly inventedTaste?: boolean;
  readonly pillHeightPx?: number;
  readonly ctaHeightPx?: number;
  readonly chromeMarkPx?: number;
  readonly blurPx?: number;
  readonly saturatePercent?: number;
  readonly shellMixPercent?: number;
  readonly scrolledShellMixPercent?: number;
  readonly seamPath?: string;
  readonly seamViewBox?: string;
  readonly bloomBlurPx?: number;
  readonly bloomOpacity?: number;
  readonly bloomBackgroundToken?: string;
}

/**
 * Discriminated source union (JOV-6246). A recipe input must be one of
 * these three source kinds; there is no free-form source, no
 * generator-supplied approval booleans, and no free-form colors.
 */
export type MarketingMediaSource = MarketingMediaRecipeInput['source'];
export type MarketingMediaRealCaptureSource = Extract<
  MarketingMediaSource,
  { kind: 'real-capture' }
>;
export type MarketingMediaRegisteredLivePresentationSource = Extract<
  MarketingMediaSource,
  { kind: 'registered-live-presentation' }
>;
export type MarketingMediaGeneratedArtworkSource = Extract<
  MarketingMediaSource,
  { kind: 'generated-artwork' }
>;

export type MarketingMediaSafeAreaPolicyId =
  | 'full-bleed-editorial'
  | 'centered-content-column'
  | 'device-frame-inset';

export type MarketingMediaMotionFallbackId =
  | 'static-glow-only'
  | 'no-motion'
  | 'fade-only';

export type MarketingMediaOutputProfileId =
  | 'marketing-web'
  | 'email'
  | 'social-card';

export interface MarketingMediaMotionPolicy {
  readonly fallback: MarketingMediaMotionFallbackId;
}

export interface MarketingMediaOutputProfile {
  readonly id: MarketingMediaOutputProfileId;
}

export interface MarketingMediaAccentReference {
  /** Canonical accent token the recipe's chromatic core derives from. */
  readonly token: string;
  readonly hex: string;
}

/** Validated request axes; input identifiers resolve only in the source-owned registry. */
const SourceRevision = z.string().trim().min(1, 'Source revision is required');
const SourceHash = z
  .string()
  .regex(/^[a-f0-9]{64}$/, 'Use the registered SHA-256');
export const MarketingMediaRecipeInputSchema = z
  .object({
    recipeId: z.enum(MARKETING_MEDIA_RECIPE_IDS),
    source: z.discriminatedUnion('kind', [
      z
        .object({
          kind: z.literal('real-capture'),
          scenarioId: z.string(),
          sourceRevision: SourceRevision,
          assetHash: SourceHash,
        })
        .strict(),
      z
        .object({
          kind: z.literal('registered-live-presentation'),
          presentationId: z.string(),
          sourceRevision: SourceRevision,
          assetHash: SourceHash,
        })
        .strict(),
      z
        .object({
          kind: z.literal('generated-artwork'),
          assetId: z.string(),
          sourceRevision: SourceRevision,
          assetHash: SourceHash,
        })
        .strict(),
    ]),
    treatment: z.enum(['compact-glass', 'dark-glass', 'flow', 'soft']),
    accent: z.enum(['ion', 'ultra', 'pulse']),
    behavior: z
      .object({
        motion: z.literal('static'),
        fallback: z.enum(['opaque-shell', 'plain-canvas']),
      })
      .strict(),
    layout: z
      .object({
        sectionId: z.enum(['feature-split', 'spec-wall']),
        safeArea: z.enum(['device-frame-inset', 'full-bleed-editorial']),
        focal: z.literal('source-owned'),
      })
      .strict(),
    delivery: z
      .object({
        profile: z.enum(['marketing-web', 'social-card']),
        tokenRevision: z.literal(MARKETING_MEDIA_TOKEN_REVISION),
      })
      .strict(),
  })
  .strict();
export type MarketingMediaRecipeInput = z.infer<
  typeof MarketingMediaRecipeInputSchema
>;

/**
 * Runtime presentation axis. CSS/material values stay in the existing primitive,
 * never in generator input. Legacy chrome extractions below remain compatibility
 * metadata for the header export; they do not define product-frame geometry.
 */
export const MARKETING_MEDIA_PRESENTATIONS = {
  'compact-glass': {
    treatment: 'compact-glass',
    component: 'CompactGlassCaptureDemo',
    owner: 'components/marketing/artist-profile/captureShared.css',
    references: ['23', '14'],
    accent: 'ion',
    safeArea: 'device-frame-inset',
    fallback: 'opaque-shell',
    radius: '--radius-3xl',
    border: '--noir-ion-border-subtle',
    material: '--system-b-cinematic-black',
    reflection: '--color-text-primary-token',
    composition: {
      fit: 'contain',
      insets: { desktop: '--space-6', mobile: '--space-4' },
    },
  },
  'dark-glass': {
    treatment: 'dark-glass',
    component: 'ProductScreenshotFrame',
    owner: 'components/marketing/ProductScreenshotFrame.css',
    references: ['22', '14'],
    accent: 'ion',
    safeArea: 'device-frame-inset',
    fallback: 'opaque-shell',
    radius: '--radius-xl',
    border: '--noir-ion-border-subtle',
    material: '--noir-ion-shell',
    reflection: '--noir-ion-text-primary',
    composition: {
      fit: 'contain',
      insets: { desktop: '--space-6', mobile: '--space-4' },
    },
  },
  'flowing-accent': {
    treatment: 'flow',
    component: 'MarketingEditorialBackground',
    owner: EDITORIAL_BACKGROUND_FLOW.source.css,
    references: ['18', '24'],
    accent: 'ion',
    safeArea: 'full-bleed-editorial',
    fallback: 'plain-canvas',
    radius: null,
    border: null,
    material: '--color-bg-base',
    reflection: null,
    composition: EDITORIAL_BACKGROUND_FLOW.composition,
  },
  'soft-editorial-background': {
    treatment: 'soft',
    component: 'MarketingEditorialBackground',
    owner: EDITORIAL_BACKGROUND_SOFT.source.css,
    references: ['18', '21', '5'],
    accent: 'ultra',
    safeArea: 'full-bleed-editorial',
    fallback: 'plain-canvas',
    radius: null,
    border: null,
    material: '--color-bg-base',
    reflection: null,
    composition: EDITORIAL_BACKGROUND_SOFT.composition,
  },
} as const;

export const MARKETING_MEDIA_RECIPE_FOUNDER_LOCK = {
  visualStandard: 'newer-hero / premium bar',
  bloomDecisionRef:
    'gbrain:design/jovie-newer-hero-bloom-b-founder-locked-2026-09-17',
  bloomLockedAt: '2026-09-17',
  bloomTreatment: 'soft optical bloom B',
  darkGlassPen: {
    headerContractId: 'GTcgO',
    masterId: 'eoUUU',
    presentation: 'marketing-glass',
    issueId: 'JOV-6179',
    lockedAt: '2026-09-11',
  },
} as const;

/**
 * Dark-glass premium bar — MarketingHeader Pen lock GTcgO → eoUUU.
 * HeaderNav.css fallback geometry is not the export recipe.
 */
export const DARK_GLASS_MEDIA_RECIPE = {
  id: 'dark-glass',
  kind: 'surface',
  source: {
    css: 'apps/web/components/site/MarketingHeader.css',
    penContractId:
      MARKETING_MEDIA_RECIPE_FOUNDER_LOCK.darkGlassPen.headerContractId,
    masterId: MARKETING_MEDIA_RECIPE_FOUNDER_LOCK.darkGlassPen.masterId,
    presentation: MARKETING_MEDIA_RECIPE_FOUNDER_LOCK.darkGlassPen.presentation,
  },
  opticalGridPx: {
    outer: 64,
    pill: 44,
    cta: 28,
    chromeMark: 20,
  },
  geometry: {
    topToken: '--space-2-5',
    topRem: 0.625,
    heightRem: 2.75,
    heightPx: 44,
    gutterToken: '--space-6',
    gutterRem: 1.5,
    ctaMinHeightRem: 1.75,
    ctaHitMinRem: 2.75,
    radius: '999px',
  },
  material: {
    shell: 'color-mix(in oklab, var(--noir-ion-shell) 82%, transparent)',
    shellScrolled:
      'color-mix(in oklab, var(--noir-ion-shell) 90%, transparent)',
    shellMixPercent: 82,
    scrolledShellMixPercent: 90,
    shellToken: '--noir-ion-shell',
    darkShellHex: '#07080A',
    darkCanvasHex: '#030406',
    borderToken: '--noir-ion-border-subtle',
    borderStrongToken: '--noir-ion-border-default',
    textToken: '--noir-ion-text-primary',
    mutedToken: '--noir-ion-text-muted',
    blurPx: 20,
    saturatePercent: 165,
    backdropFilter: 'blur(20px) saturate(165%)',
  },
  never: [
    'HeaderNav.css fallback glass (2.72rem / rgba(12,13,15,0.74) / no blur at rest)',
    'A new glass mix, blur, saturate, or pill height',
    'Light-mode glass as the marketing export default',
  ],
} as const;

/**
 * Compact glass module — the audience-pill glass at module scale
 * (artist-profile captureShared.css). The #23 reference material
 * preserved at smaller scale; clipped side panels and unrelated
 * controls are NOT inherited.
 */
export const COMPACT_GLASS_MEDIA_RECIPE = {
  id: 'compact-glass',
  kind: 'surface',
  source: {
    css: 'apps/web/components/marketing/artist-profile/captureShared.css',
    selector: '.artist-profile-audience-pill',
    issueId: 'JOV-6246',
  },
  geometry: {
    minHeightRem: 3,
    maxWidth: 'min(21rem, calc(100vw - 4rem))',
    radius: '9999px',
  },
  material: {
    shell:
      'color-mix(in oklab, var(--system-b-cinematic-black) 82%, transparent)',
    washTop:
      'color-mix(in oklab, var(--color-text-primary-token) 4%, transparent)',
    washBottom:
      'color-mix(in oklab, var(--color-text-primary-token) 1.5%, transparent)',
    text: 'color-mix(in oklab, var(--color-text-primary-token) 92%, transparent)',
    insetHighlight:
      'color-mix(in oklab, var(--color-text-primary-token) 5%, transparent)',
    insetShadow:
      'color-mix(in oklab, var(--system-b-cinematic-black) 18%, transparent)',
    dropShadow: '0 10px 24px',
    blurPx: 14,
    backdropFilter: 'blur(14px)',
    fontSizePx: 12.5,
    shellToken: '--system-b-cinematic-black',
    shellHex: '#06070A',
  },
  never: [
    'A second compact glass mix or a different blur',
    'Inheriting clipped side panels or unrelated controls from the compact reference',
    'Uniform haze or plastic volume at module scale',
  ],
} as const;

/**
 * Soft editorial background — the homepage editorial-hero light well
 * (home.css). Broad low-contrast curves, off-center illumination, dark
 * negative space; the field stays subordinate to real product content.
 */
export const SOFT_EDITORIAL_BACKGROUND_MEDIA_RECIPE = {
  id: 'soft-editorial-background',
  kind: 'background',
  source: {
    css: 'apps/web/app/(home)/home.css',
    selector: '.homepage-editorial-hero__light-well',
    component: 'apps/web/components/homepage/HomepageEditorialHero.tsx',
    issueId: 'JOV-6246',
  },
  field: {
    width: 'min(80rem, 120vw)',
    height: 'min(42rem, 62vw)',
    radius: '50%',
    light: 'color-mix(in oklab, var(--system-b-text-primary) 5%, transparent)',
    lightSoft:
      'color-mix(in oklab, var(--system-b-text-primary) 2%, transparent)',
    background:
      'radial-gradient(ellipse at center, color-mix(in oklab, var(--system-b-text-primary) 5%, transparent) 0%, color-mix(in oklab, var(--system-b-text-primary) 2%, transparent) 42%, transparent 74%)',
    centerPosition: 'top 48% / left 50% translate(-50%, -50%)',
    opacity: 0.5,
    blurToken: '--space-8',
    blurPx: 32,
  },
  underlight: {
    inset: '42% 14% auto',
    heightPercent: 48,
    background:
      'linear-gradient(180deg, color-mix(in oklab, var(--system-b-text-primary) 1.5%, transparent), transparent 88%)',
    blurToken: '--space-12',
    blurPx: 48,
  },
  never: [
    'Crossing or contradicting sweeps',
    'Aggressive diagonal bands or tactical geometry',
    'Noisy gradients or unmotivated competing glows',
    'Centering the light geometrically — off-center illumination stays',
  ],
} as const;

/**
 * Flowing-accent — homepage electric seam plus newer-hero bloom B.
 * Seam cyan stays Geist `#22C1FC`. Bloom fill stays Ion soft.
 */
export const FLOWING_ACCENT_MEDIA_RECIPE = {
  id: 'flowing-accent',
  kind: 'accent',
  source: {
    seamComponent: 'apps/web/components/marketing/MarketingElectricSeam.tsx',
    bloomCss: 'apps/web/app/(home)/home.css',
    bloomSelector: '.homepage-poster-hero__media::before',
    decisionRef: MARKETING_MEDIA_RECIPE_FOUNDER_LOCK.bloomDecisionRef,
  },
  seam: {
    viewBox: '0 0 1200 24',
    path: 'M0 12 C120 12 164 12 246 12 S382 11 480 12 S620 13 718 12 S856 11 960 12 S1090 12 1200 12',
    base: 'color-mix(in oklab, var(--system-b-text-primary) 72%, transparent)',
    glow: 'color-mix(in oklab, var(--system-b-accent-cyan) 72%, transparent)',
    spark: 'color-mix(in oklab, var(--system-b-accent-cyan) 84%, transparent)',
    core: 'color-mix(in oklab, var(--system-b-text-primary) 92%, var(--system-b-accent-cyan))',
    accentToken: '--system-b-accent-cyan',
    accentHex: '#22C1FC',
    glowBlurStdDeviation: 1.8,
    sparkBlurStdDeviation: 3.2,
    reducedMotion: 'static-glow-only',
  },
  bloom: {
    treatment: 'soft-optical-bloom-b',
    inset: '-18% 8% auto',
    height: '52%',
    radiusToken: '--radius-pill',
    backgroundToken: '--color-accent-blue-subtle',
    backgroundRgba: 'rgba(17, 175, 255, 0.12)',
    blurPx: 80,
    opacity: 0.42,
  },
  never: [
    'A second bloom layer or a different blur/opacity',
    'Rotating decorative accent hues',
    'Replacing bloom B with homepage-v2 glow-blob (accent 18% / 68%)',
    'Traveling spark under prefers-reduced-motion',
  ],
} as const;

export const MARKETING_MEDIA_RECIPES = {
  'dark-glass': DARK_GLASS_MEDIA_RECIPE,
  'compact-glass': COMPACT_GLASS_MEDIA_RECIPE,
  'soft-editorial-background': SOFT_EDITORIAL_BACKGROUND_MEDIA_RECIPE,
  'flowing-accent': FLOWING_ACCENT_MEDIA_RECIPE,
} as const;

/**
 * Approved source combinations per recipe. Surface recipes must keep real
 * product text/controls legible, so they accept real captures and registered
 * live presentations; background recipes additionally accept generated /
 * approved artwork. There is no free-form combination.
 */
export const MARKETING_MEDIA_RECIPE_SOURCE_MATRIX: Readonly<
  Record<MarketingMediaRecipeId, readonly MarketingMediaSource['kind'][]>
> = {
  'dark-glass': ['real-capture', 'registered-live-presentation'],
  'compact-glass': ['real-capture', 'registered-live-presentation'],
  'soft-editorial-background': [
    'real-capture',
    'registered-live-presentation',
    'generated-artwork',
  ],
  'flowing-accent': [
    'real-capture',
    'registered-live-presentation',
    'generated-artwork',
  ],
};

/** Canonical accent each recipe's chromatic core derives from. */
export const MARKETING_MEDIA_RECIPE_ACCENTS: Readonly<
  Record<MarketingMediaRecipeId, MarketingMediaAccentReference>
> = {
  'dark-glass': { token: '--noir-ion-shell', hex: '#07080A' },
  'compact-glass': { token: '--system-b-cinematic-black', hex: '#06070A' },
  'soft-editorial-background': {
    token: '--system-b-text-primary',
    hex: '#F7F8F8',
  },
  'flowing-accent': { token: '--system-b-accent-cyan', hex: '#22C1FC' },
};

/** Approved safe-area policies per recipe (explicit safe areas per breakpoint). */
export const MARKETING_MEDIA_RECIPE_SAFE_AREAS: Readonly<
  Record<MarketingMediaRecipeId, MarketingMediaSafeAreaPolicyId>
> = {
  'dark-glass': 'device-frame-inset',
  'compact-glass': 'device-frame-inset',
  'soft-editorial-background': 'full-bleed-editorial',
  'flowing-accent': 'full-bleed-editorial',
};

export const MARKETING_MEDIA_SAFE_AREA_POLICIES: Readonly<
  Record<
    MarketingMediaSafeAreaPolicyId,
    { readonly id: MarketingMediaSafeAreaPolicyId }
  >
> = {
  'full-bleed-editorial': { id: 'full-bleed-editorial' },
  'centered-content-column': { id: 'centered-content-column' },
  'device-frame-inset': { id: 'device-frame-inset' },
};

/** Required motion/fallback policy per recipe. */
export const MARKETING_MEDIA_RECIPE_MOTION_FALLBACKS: Readonly<
  Record<MarketingMediaRecipeId, MarketingMediaMotionFallbackId>
> = {
  'dark-glass': 'fade-only',
  'compact-glass': 'no-motion',
  'soft-editorial-background': 'no-motion',
  'flowing-accent': 'static-glow-only',
};

/** Output profiles supported per recipe. */
export const MARKETING_MEDIA_RECIPE_OUTPUT_PROFILES: Readonly<
  Record<MarketingMediaRecipeId, readonly MarketingMediaOutputProfileId[]>
> = {
  'dark-glass': ['marketing-web', 'email', 'social-card'],
  'compact-glass': ['marketing-web', 'social-card'],
  'soft-editorial-background': ['marketing-web'],
  'flowing-accent': ['marketing-web', 'social-card'],
};

export function isApprovedMarketingMediaRecipeId(
  id: string
): id is MarketingMediaRecipeId {
  return (MARKETING_MEDIA_RECIPE_IDS as readonly string[]).includes(id);
}

export function getMarketingMediaRecipe(id: MarketingMediaRecipeId) {
  return MARKETING_MEDIA_RECIPES[id];
}

function finding(
  code: MarketingMediaRecipeFindingCode,
  subject: string,
  message: string
): MarketingMediaRecipeFinding {
  return {
    code,
    stage: 'asset-generation',
    subject,
    message,
  };
}

export function auditMarketingMediaRecipeDecision(
  decision: MarketingMediaRecipeDecision
): readonly MarketingMediaRecipeFinding[] {
  const findings: MarketingMediaRecipeFinding[] = [];

  if (!isApprovedMarketingMediaRecipeId(decision.recipeId)) {
    findings.push(
      finding(
        'unknown-media-recipe',
        decision.recipeId,
        'Only dark-glass, compact-glass, soft-editorial-background, and flowing-accent are approved for marketing media export.'
      )
    );
    return findings;
  }

  if (decision.inventedTaste) {
    findings.push(
      finding(
        'invented-media-taste',
        decision.recipeId,
        'Export must reuse the locked newer-hero / premium-bar recipes. Do not invent taste.'
      )
    );
  }

  if (decision.recipeId === 'dark-glass') {
    const recipe = DARK_GLASS_MEDIA_RECIPE;
    if (
      (decision.pillHeightPx !== undefined &&
        decision.pillHeightPx !== recipe.geometry.heightPx) ||
      (decision.ctaHeightPx !== undefined &&
        decision.ctaHeightPx !== recipe.opticalGridPx.cta) ||
      (decision.chromeMarkPx !== undefined &&
        decision.chromeMarkPx !== recipe.opticalGridPx.chromeMark)
    ) {
      findings.push(
        finding(
          'dark-glass-geometry-drift',
          decision.recipeId,
          `Dark-glass must keep the locked optical grid ${recipe.opticalGridPx.outer}/${recipe.opticalGridPx.pill}/${recipe.opticalGridPx.cta}/${recipe.opticalGridPx.chromeMark}.`
        )
      );
    }
    if (
      (decision.blurPx !== undefined &&
        decision.blurPx !== recipe.material.blurPx) ||
      (decision.saturatePercent !== undefined &&
        decision.saturatePercent !== recipe.material.saturatePercent) ||
      (decision.shellMixPercent !== undefined &&
        decision.shellMixPercent !== recipe.material.shellMixPercent) ||
      (decision.scrolledShellMixPercent !== undefined &&
        decision.scrolledShellMixPercent !==
          recipe.material.scrolledShellMixPercent)
    ) {
      findings.push(
        finding(
          'dark-glass-material-drift',
          decision.recipeId,
          `Dark-glass must keep ${recipe.material.backdropFilter} over noir-ion-shell ${recipe.material.shellMixPercent}/${recipe.material.scrolledShellMixPercent}.`
        )
      );
    }
  }

  if (decision.recipeId === 'compact-glass') {
    const recipe = COMPACT_GLASS_MEDIA_RECIPE;
    if (
      (decision.blurPx !== undefined &&
        decision.blurPx !== recipe.material.blurPx) ||
      (decision.shellMixPercent !== undefined &&
        decision.shellMixPercent !== 82)
    ) {
      findings.push(
        finding(
          'compact-glass-material-drift',
          decision.recipeId,
          `Compact-glass must keep ${recipe.material.backdropFilter} over ${recipe.material.shellToken} 82%.`
        )
      );
    }
  }

  if (decision.recipeId === 'soft-editorial-background') {
    const recipe = SOFT_EDITORIAL_BACKGROUND_MEDIA_RECIPE;
    if (
      (decision.bloomOpacity !== undefined &&
        decision.bloomOpacity !== recipe.field.opacity) ||
      (decision.bloomBlurPx !== undefined &&
        decision.bloomBlurPx !== recipe.field.blurPx)
    ) {
      findings.push(
        finding(
          'editorial-background-drift',
          decision.recipeId,
          `Editorial background must keep the light-well at opacity ${recipe.field.opacity} with ${recipe.field.blurPx}px (${recipe.field.blurToken}) blur.`
        )
      );
    }
  }

  if (decision.recipeId === 'flowing-accent') {
    const recipe = FLOWING_ACCENT_MEDIA_RECIPE;
    if (
      (decision.seamPath !== undefined &&
        decision.seamPath !== recipe.seam.path) ||
      (decision.seamViewBox !== undefined &&
        decision.seamViewBox !== recipe.seam.viewBox)
    ) {
      findings.push(
        finding(
          'flowing-accent-seam-drift',
          decision.recipeId,
          'Flowing-accent must keep the locked electric-seam path and 1200×24 viewBox.'
        )
      );
    }
    if (
      (decision.bloomBlurPx !== undefined &&
        decision.bloomBlurPx !== recipe.bloom.blurPx) ||
      (decision.bloomOpacity !== undefined &&
        decision.bloomOpacity !== recipe.bloom.opacity) ||
      (decision.bloomBackgroundToken !== undefined &&
        decision.bloomBackgroundToken !== recipe.bloom.backgroundToken)
    ) {
      findings.push(
        finding(
          'flowing-accent-bloom-drift',
          decision.recipeId,
          `Bloom B stays ${recipe.bloom.blurPx}px at opacity ${recipe.bloom.opacity} on ${recipe.bloom.backgroundToken}.`
        )
      );
    }
  }

  return findings;
}

/**
 * Runtime validation of a full recipe input (JOV-6246 slice 2). Enforces
 * supported recipe/source combinations, approved scenario ids, source
 * revisions, canonical accent references, safe-area policy, motion/fallback
 * policy, and supported output profiles. A generator cannot supply free-form
 * colors, module imports, script strings, or approval booleans — everything
 * resolves through the locked recipes above.
 */
export function validateMarketingMediaRecipeInput(
  input: unknown
): readonly MarketingMediaRecipeFinding[] {
  const parsed = MarketingMediaRecipeInputSchema.safeParse(input);
  if (!parsed.success)
    return parsed.error.issues.map(issue =>
      finding(
        'invalid-media-request',
        issue.path.join('.'),
        `${issue.message}. Select a registered source/recipe and supply every typed axis.`
      )
    );
  const value = parsed.data;
  const recipe = MARKETING_MEDIA_PRESENTATIONS[value.recipeId];
  const findings: MarketingMediaRecipeFinding[] = [];
  if (
    !MARKETING_MEDIA_RECIPE_SOURCE_MATRIX[value.recipeId].includes(
      value.source.kind
    )
  ) {
    findings.push(
      finding(
        'unsupported-recipe-source-combination',
        value.recipeId,
        'Product frames require a real capture or registered product presentation; generated UI is prohibited.'
      )
    );
  }
  const id =
    value.source.kind === 'real-capture'
      ? value.source.scenarioId
      : value.source.kind === 'generated-artwork'
        ? value.source.assetId
        : value.source.presentationId;
  const source = MARKETING_MEDIA_INPUTS.find(
    entry => entry.id === id && entry.kind === value.source.kind
  );
  if (!source || !source.recipes.includes(value.recipeId)) {
    findings.push(
      finding(
        'unapproved-media-source-input',
        id,
        'Register this owned or permissioned source for this recipe in mediaReferences.ts before use.'
      )
    );
  } else if (
    source.revision !== value.source.sourceRevision ||
    source.hash !== value.source.assetHash
  ) {
    findings.push(
      finding(
        'stale-media-source',
        id,
        'Source revision/hash differs from the registered input. Recapture and review the exact changed artifact.'
      )
    );
  }
  if (value.accent !== recipe.accent)
    findings.push(
      finding(
        'noncanonical-media-accent',
        value.recipeId,
        `Use the registered ${recipe.accent} scene anchor; keep protected artwork and UI status colors truthful.`
      )
    );
  if (value.treatment !== recipe.treatment)
    findings.push(
      finding(
        'invented-media-taste',
        value.recipeId,
        `Use treatment ${recipe.treatment} with this recipe.`
      )
    );
  if (value.layout.safeArea !== recipe.safeArea)
    findings.push(
      finding(
        'missing-safe-area-policy',
        value.recipeId,
        `Use ${recipe.safeArea}; resolve focal and mobile/desktop safe areas from the source owner.`
      )
    );
  if (value.behavior.fallback !== recipe.fallback)
    findings.push(
      finding(
        'missing-motion-fallback-policy',
        value.recipeId,
        `Use the static ${recipe.fallback} fallback, preserving geometry.`
      )
    );
  if (
    !MARKETING_MEDIA_RECIPE_OUTPUT_PROFILES[value.recipeId].includes(
      value.delivery.profile
    )
  )
    findings.push(
      finding(
        'unsupported-output-profile',
        value.recipeId,
        'Select an output profile supported by this recipe.'
      )
    );
  return findings;
}

/** Source-owned starting point for existing approved fixtures; no commercial copy. */
export function createMarketingMediaRecipeInput(
  recipeId: MarketingMediaRecipeId
): MarketingMediaRecipeInput {
  const source = MARKETING_MEDIA_INPUTS.find(entry =>
    entry.recipes.includes(recipeId)
  );
  if (!source) throw new Error(`No registered input for ${recipeId}`);
  const presentation = MARKETING_MEDIA_PRESENTATIONS[recipeId];
  const base = { sourceRevision: source.revision, assetHash: source.hash };
  return {
    recipeId,
    source:
      source.kind === 'real-capture'
        ? { kind: source.kind, scenarioId: source.id, ...base }
        : source.kind === 'generated-artwork'
          ? { kind: source.kind, assetId: source.id, ...base }
          : { kind: source.kind, presentationId: source.id, ...base },
    treatment: presentation.treatment,
    accent: presentation.accent,
    behavior: { motion: 'static', fallback: presentation.fallback },
    layout: {
      sectionId: 'feature-split',
      safeArea: presentation.safeArea,
      focal: 'source-owned',
    },
    delivery: {
      profile: 'marketing-web',
      tokenRevision: MARKETING_MEDIA_TOKEN_REVISION,
    },
  };
}

/** Common seam for components, prompt presets, exports and review. No module execution. */
export function resolveMarketingMediaRequest(input: unknown) {
  const findings = validateMarketingMediaRecipeInput(input);
  if (findings.length) return { ok: false as const, findings };
  const request = MarketingMediaRecipeInputSchema.parse(input);
  const presentation = MARKETING_MEDIA_PRESENTATIONS[request.recipeId];
  const scene = JOVIE_IMAGE_COLOR_POLICY.scenePalette.find(
    entry => entry.role === request.accent
  );
  return {
    ok: true as const,
    request,
    presentation,
    scene,
    provenance: {
      schema: JOVIE_MARKETING_MEDIA_RECIPE_SCHEMA,
      recipeVersion: JOVIE_MARKETING_MEDIA_RECIPE_VERSION,
      tokenRevision: MARKETING_MEDIA_TOKEN_REVISION,
      referenceReview: MARKETING_MEDIA_REFERENCE_REVIEW.id,
      presentationRevision: MARKETING_MEDIA_PRESENTATION_REVISION,
      sourceRevision: request.source.sourceRevision,
      assetHash: request.source.assetHash,
    },
    // Canonical serialized request, not a caller-supplied approval flag.
    identity: JSON.stringify([
      JOVIE_MARKETING_MEDIA_RECIPE_VERSION,
      request,
      presentation,
      MARKETING_MEDIA_REFERENCE_REVIEW.id,
      MARKETING_MEDIA_PRESENTATION_REVISION,
    ]),
  };
}

export function resolveMarketingMediaRecipeForExport(input: {
  readonly recipeId: string;
}):
  | {
      readonly ok: true;
      readonly recipe: (typeof MARKETING_MEDIA_RECIPES)[MarketingMediaRecipeId];
    }
  | {
      readonly ok: false;
      readonly findings: readonly MarketingMediaRecipeFinding[];
    } {
  if (!isApprovedMarketingMediaRecipeId(input.recipeId)) {
    return {
      ok: false,
      findings: [
        finding(
          'unapproved-export-recipe',
          input.recipeId,
          'The export pipeline may only resolve the four registered recipes in this slice.'
        ),
      ],
    };
  }

  return {
    ok: true,
    recipe: MARKETING_MEDIA_RECIPES[input.recipeId],
  };
}

export function formatMarketingMediaRecipesForPrompt(): string {
  return [
    `Jovie Marketing Media Recipes ${JOVIE_MARKETING_MEDIA_RECIPE_VERSION} (${JOVIE_MARKETING_MEDIA_RECIPE_SCHEMA})`,
    `Approved recipes: ${MARKETING_MEDIA_RECIPE_IDS.join(', ')}.`,
    ...MARKETING_MEDIA_RECIPE_IDS.map(
      id => `${id}: ${JSON.stringify(MARKETING_MEDIA_PRESENTATIONS[id])}`
    ),
    `Reference review: ${JSON.stringify(MARKETING_MEDIA_REFERENCE_REVIEW)}.`,
    `Validate every source, treatment, behavior, layout and delivery axis with resolveMarketingMediaRequest. Tokens: ${MARKETING_MEDIA_TOKEN_REVISION}.`,
    'One canonical accent anchors the chromatic core, not the geometric center. Keep off-center illumination and dark negative space. Use Scene Palette v1 falloff; do not recolor protected artwork, faces, marks, evidence or UI status colors.',
    'Glass has nonuniform transmission, asymmetric light, crisp quiet borders and legible real product content. No bevels, plastic volume, uniform haze, redundant labels or clipped foreground.',
    'Flow direction: one dominant curved sweep with cooperating echoes. Full-bleed backgrounds preserve source-owned safe areas at each breakpoint. Dense spec grids are valid in spec-wall, never a default hero.',
    'Never: invent a fifth recipe, free-form colors, imports, scripts or approval booleans. Reference preference is scoped inspiration, not master certification or redistribution rights.',
  ].join('\n');
}
