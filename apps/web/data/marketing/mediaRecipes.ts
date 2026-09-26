/**
 * Approved marketing media recipes for the export / asset-generation pipeline.
 *
 * Contract slice 2 (JOV-6246): the four registered recipes — large
 * dark-glass product frame, compact glass module, soft editorial
 * background, coherent flowing-accent background — plus the typed
 * source / safe-area / motion / output axes with runtime validation.
 * Values are copied from current Pen→code sources. Do not invent new
 * taste here.
 *
 * Visual standard: newer-hero / premium bar.
 * Bloom lock: gbrain:design/jovie-newer-hero-bloom-b-founder-locked-2026-09-17
 */

export const JOVIE_MARKETING_MEDIA_RECIPE_SCHEMA =
  'jovie-marketing-media-recipe/v2';
export const JOVIE_MARKETING_MEDIA_RECIPE_VERSION = 'approved-chrome-v2';

export const MARKETING_MEDIA_RECIPE_IDS = [
  'dark-glass',
  'compact-glass',
  'soft-editorial-background',
  'flowing-accent',
] as const;

export type MarketingMediaRecipeId =
  (typeof MARKETING_MEDIA_RECIPE_IDS)[number];

export type MarketingMediaRecipeKind = 'surface' | 'background';

export type MarketingMediaRecipeFindingCode =
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
export type MarketingMediaSource =
  | MarketingMediaRealCaptureSource
  | MarketingMediaRegisteredLivePresentationSource
  | MarketingMediaGeneratedArtworkSource;

export interface MarketingMediaRealCaptureSource {
  readonly kind: 'real-capture';
  /** Must be a registered screenshot scenario id with a public export. */
  readonly scenarioId: string;
  /** Revision (manifest gitSha/capturedAt) of the capture actually used. */
  readonly sourceRevision: string;
}

export interface MarketingMediaRegisteredLivePresentationSource {
  readonly kind: 'registered-live-presentation';
  /** Must be a registered screenshot scenario id (the live surface shown). */
  readonly scenarioId: string;
  readonly sourceRevision: string;
}

export interface MarketingMediaGeneratedArtworkSource {
  readonly kind: 'generated-artwork';
  /** Approved generated artwork master id. */
  readonly assetId: string;
  readonly sourceRevision: string;
}

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

export interface MarketingMediaRecipeInput {
  readonly recipeId: string;
  readonly source: MarketingMediaSource;
  /** Canonical accent reference the recipe's chromatic core derives from. */
  readonly accent: MarketingMediaAccentReference;
  readonly safeArea: MarketingMediaSafeAreaPolicyId;
  readonly motion: MarketingMediaMotionPolicy;
  readonly output: MarketingMediaOutputProfile;
}

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
  'soft-editorial-background': ['real-capture', 'generated-artwork'],
  'flowing-accent': ['real-capture', 'generated-artwork'],
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
  input: MarketingMediaRecipeInput,
  knownScenarioIds: ReadonlySet<string>
): readonly MarketingMediaRecipeFinding[] {
  const findings: MarketingMediaRecipeFinding[] = [];

  if (!isApprovedMarketingMediaRecipeId(input.recipeId)) {
    findings.push(
      finding(
        'unknown-media-recipe',
        input.recipeId,
        'Recipe must be one of the four registered recipes.'
      )
    );
    return findings;
  }
  const recipeId = input.recipeId;

  const allowedSourceKinds = MARKETING_MEDIA_RECIPE_SOURCE_MATRIX[recipeId];
  if (!allowedSourceKinds.includes(input.source.kind)) {
    findings.push(
      finding(
        'unsupported-recipe-source-combination',
        recipeId,
        `${recipeId} supports ${allowedSourceKinds.join(' / ')} sources; ${input.source.kind} is not a supported combination.`
      )
    );
  }

  if (
    input.source.kind === 'real-capture' ||
    input.source.kind === 'registered-live-presentation'
  ) {
    if (!knownScenarioIds.has(input.source.scenarioId)) {
      findings.push(
        finding(
          'unapproved-media-source-input',
          input.source.scenarioId,
          `Scenario ${input.source.scenarioId} is not a registered screenshot scenario.`
        )
      );
    }
  }

  if (!input.source.sourceRevision.trim()) {
    findings.push(
      finding(
        'missing-media-source-revision',
        recipeId,
        'Source revision (manifest gitSha/capturedAt or asset revision) is required so an old receipt cannot approve a changed artifact.'
      )
    );
  }

  if (!isCanonicalMarketingMediaAccent(recipeId, input.accent)) {
    findings.push(
      finding(
        'noncanonical-media-accent',
        recipeId,
        `Accent must derive from the canonical ${MARKETING_MEDIA_RECIPE_ACCENTS[recipeId].token} (${MARKETING_MEDIA_RECIPE_ACCENTS[recipeId].hex}).`
      )
    );
  }

  if (input.safeArea !== MARKETING_MEDIA_RECIPE_SAFE_AREAS[recipeId]) {
    findings.push(
      finding(
        'missing-safe-area-policy',
        recipeId,
        `Safe-area policy for ${recipeId} is ${MARKETING_MEDIA_RECIPE_SAFE_AREAS[recipeId]}; ${input.safeArea} does not match.`
      )
    );
  }

  if (
    input.motion.fallback !== MARKETING_MEDIA_RECIPE_MOTION_FALLBACKS[recipeId]
  ) {
    findings.push(
      finding(
        'missing-motion-fallback-policy',
        recipeId,
        `Motion fallback for ${recipeId} is ${MARKETING_MEDIA_RECIPE_MOTION_FALLBACKS[recipeId]}; ${input.motion.fallback} does not match.`
      )
    );
  }

  if (
    !MARKETING_MEDIA_RECIPE_OUTPUT_PROFILES[recipeId].includes(input.output.id)
  ) {
    findings.push(
      finding(
        'unsupported-output-profile',
        recipeId,
        `Output profile ${input.output.id} is not supported for ${recipeId}.`
      )
    );
  }

  return findings;
}

function isCanonicalMarketingMediaAccent(
  recipeId: MarketingMediaRecipeId,
  accent: MarketingMediaAccentReference
): boolean {
  const canonical = MARKETING_MEDIA_RECIPE_ACCENTS[recipeId];
  return accent.token === canonical.token && accent.hex === canonical.hex;
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
  const dark = DARK_GLASS_MEDIA_RECIPE;
  const compact = COMPACT_GLASS_MEDIA_RECIPE;
  const editorial = SOFT_EDITORIAL_BACKGROUND_MEDIA_RECIPE;
  const flow = FLOWING_ACCENT_MEDIA_RECIPE;

  return [
    `Jovie Marketing Media Recipes ${JOVIE_MARKETING_MEDIA_RECIPE_VERSION} (${JOVIE_MARKETING_MEDIA_RECIPE_SCHEMA})`,
    `Visual standard: ${MARKETING_MEDIA_RECIPE_FOUNDER_LOCK.visualStandard}.`,
    `Bloom lock: ${MARKETING_MEDIA_RECIPE_FOUNDER_LOCK.bloomTreatment} (${MARKETING_MEDIA_RECIPE_FOUNDER_LOCK.bloomDecisionRef}).`,
    `Approved recipes: ${MARKETING_MEDIA_RECIPE_IDS.join(', ')}.`,
    `dark-glass (large dark-glass product frame): Pen ${dark.source.penContractId} → ${dark.source.masterId} ${dark.source.presentation} bar. Optical grid ${dark.opticalGridPx.outer}/${dark.opticalGridPx.pill}/${dark.opticalGridPx.cta}/${dark.opticalGridPx.chromeMark}. Height ${dark.geometry.heightRem}rem (${dark.geometry.heightPx}px). Material ${dark.material.backdropFilter} over ${dark.material.shell}. Dark shell ${dark.material.darkShellHex} on ${dark.material.darkCanvasHex}.`,
    `compact-glass (compact glass module): ${compact.material.backdropFilter} over ${compact.material.shell}. Radius ${compact.geometry.radius}, min-height ${compact.geometry.minHeightRem}rem. Quiet inset hairlines, no uniform haze.`,
    `soft-editorial-background (soft editorial background): light well ${editorial.field.width} × ${editorial.field.height} radial ellipse at ${editorial.field.centerPosition}, opacity ${editorial.field.opacity}, blur ${editorial.field.blurPx}px (${editorial.field.blurToken}). Off-center illumination, dark negative space, no crossing sweeps.`,
    `flowing-accent (coherent flowing-accent background): electric seam ${flow.seam.viewBox} with ${flow.seam.accentToken} ${flow.seam.accentHex}. Bloom B ${flow.bloom.blurPx}px blur at opacity ${flow.bloom.opacity} using ${flow.bloom.backgroundToken} ${flow.bloom.backgroundRgba}. Reduced motion: ${flow.seam.reducedMotion}.`,
    `Source kinds: ${Object.keys(MARKETING_MEDIA_RECIPE_SOURCE_MATRIX).length} recipes with locked source combinations; real product text and controls stay legible in every surface recipe.`,
    `Never: invent a fifth recipe, a new glass mix, or a different bloom.`,
  ].join('\n');
}
