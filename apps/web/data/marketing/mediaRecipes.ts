/**
 * Approved marketing media recipes for the export / asset-generation pipeline.
 *
 * First contract slice (JOV-6246): only the founder-locked dark-glass premium
 * bar and the flowing-accent / soft optical bloom B treatments. Values are
 * copied from current Pen→code sources. Do not invent new taste here.
 *
 * Visual standard: newer-hero / premium bar.
 * Bloom lock: gbrain:design/jovie-newer-hero-bloom-b-founder-locked-2026-09-17
 */

export const JOVIE_MARKETING_MEDIA_RECIPE_SCHEMA =
  'jovie-marketing-media-recipe/v1';
export const JOVIE_MARKETING_MEDIA_RECIPE_VERSION = 'approved-chrome-v1';

export const MARKETING_MEDIA_RECIPE_IDS = [
  'dark-glass',
  'flowing-accent',
] as const;

export type MarketingMediaRecipeId =
  (typeof MARKETING_MEDIA_RECIPE_IDS)[number];

export type MarketingMediaRecipeFindingCode =
  | 'unknown-media-recipe'
  | 'invented-media-taste'
  | 'unapproved-export-recipe'
  | 'dark-glass-geometry-drift'
  | 'dark-glass-material-drift'
  | 'flowing-accent-seam-drift'
  | 'flowing-accent-bloom-drift';

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
    darkShellHex: '#06080D',
    darkCanvasHex: '#030407',
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
  'flowing-accent': FLOWING_ACCENT_MEDIA_RECIPE,
} as const;

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
        'Only dark-glass and flowing-accent are approved for marketing media export.'
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
          'The export pipeline may only resolve dark-glass or flowing-accent in this slice.'
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
  const flow = FLOWING_ACCENT_MEDIA_RECIPE;

  return [
    `Jovie Marketing Media Recipes ${JOVIE_MARKETING_MEDIA_RECIPE_VERSION} (${JOVIE_MARKETING_MEDIA_RECIPE_SCHEMA})`,
    `Visual standard: ${MARKETING_MEDIA_RECIPE_FOUNDER_LOCK.visualStandard}.`,
    `Bloom lock: ${MARKETING_MEDIA_RECIPE_FOUNDER_LOCK.bloomTreatment} (${MARKETING_MEDIA_RECIPE_FOUNDER_LOCK.bloomDecisionRef}).`,
    `Approved recipes: ${MARKETING_MEDIA_RECIPE_IDS.join(', ')}.`,
    `dark-glass: Pen ${dark.source.penContractId} → ${dark.source.masterId} ${dark.source.presentation} bar. Optical grid ${dark.opticalGridPx.outer}/${dark.opticalGridPx.pill}/${dark.opticalGridPx.cta}/${dark.opticalGridPx.chromeMark}. Height ${dark.geometry.heightRem}rem (${dark.geometry.heightPx}px). Material ${dark.material.backdropFilter} over ${dark.material.shell}. Dark shell ${dark.material.darkShellHex} on ${dark.material.darkCanvasHex}.`,
    `flowing-accent: electric seam ${flow.seam.viewBox} with ${flow.seam.accentToken} ${flow.seam.accentHex}. Bloom B ${flow.bloom.blurPx}px blur at opacity ${flow.bloom.opacity} using ${flow.bloom.backgroundToken} ${flow.bloom.backgroundRgba}. Reduced motion: ${flow.seam.reducedMotion}.`,
    `Never: invent a third recipe, a new glass mix, or a different bloom.`,
  ].join('\n');
}
