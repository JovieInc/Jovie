/**
 * Marketing editorial background instances (JOV-6249) — the two approved
 * editorial-background masters of JOV-6246 implemented as one shared
 * background system (`components/marketing/MarketingEditorialBackground`):
 * a quiet soft atmosphere and a higher-energy coherent directional sweep.
 *
 * Recipes and reference provenance are owned by JOV-6246
 * (`mediaRecipes.ts` / `generation.ts`); this module registers reusable
 * per-section instances rather than bespoke per-page backgrounds. Values
 * are copied from current production sources; do not invent new taste.
 */

export const JOVIE_EDITORIAL_BACKGROUND_INSTANCE_SCHEMA =
  'jovie-editorial-background-instance/v1';
export const JOVIE_EDITORIAL_BACKGROUND_INSTANCE_VERSION =
  'editorial-masters-v1';

export const MARKETING_EDITORIAL_BACKGROUND_INSTANCE_IDS = [
  'editorial-background.soft.homepage-hero',
  'editorial-background.flowing.feature-sweep',
] as const;

export type MarketingEditorialBackgroundInstanceId =
  (typeof MARKETING_EDITORIAL_BACKGROUND_INSTANCE_IDS)[number];

export type MarketingEditorialBackgroundInstanceVariant = 'soft' | 'flowing';

export type MarketingEditorialBackgroundInstanceFindingCode =
  | 'unknown-editorial-background-instance'
  | 'unsupported-instance-variant'
  | 'noncanonical-instance-accent'
  | 'missing-instance-safe-area'
  | 'missing-instance-content-column'
  | 'missing-instance-flow-direction'
  | 'unsupported-instance-motion';

export interface MarketingEditorialBackgroundInstanceFinding {
  readonly code: MarketingEditorialBackgroundInstanceFindingCode;
  readonly subject: string;
  readonly message: string;
}

/** Canonical accent reference for each variant's dominant chromatic core. */
export const MARKETING_EDITORIAL_BACKGROUND_INSTANCE_ACCENTS: Readonly<
  Record<
    MarketingEditorialBackgroundInstanceVariant,
    { readonly token: string; readonly hex: string }
  >
> = {
  soft: { token: '--system-b-text-primary', hex: '#F7F8F8' },
  flowing: { token: '--system-b-accent-cyan', hex: '#22C1FC' },
};

export interface MarketingEditorialBackgroundInstance {
  readonly id: MarketingEditorialBackgroundInstanceId;
  readonly variant: MarketingEditorialBackgroundInstanceVariant;
  /** Canonical accent the dominant chromatic core derives from. */
  readonly accent: { readonly token: string; readonly hex: string };
  /**
   * Declared focal location and main flow direction, per desktop/mobile, so a
   * crop preserves the intended light flow and contrast around real content.
   */
  readonly focal: {
    readonly desktop: {
      readonly x: 'center' | 'left' | 'right';
      readonly y: 'center' | 'top' | 'bottom';
    };
    readonly mobile: {
      readonly x: 'center' | 'left' | 'right';
      readonly y: 'center' | 'top' | 'bottom';
    };
  };
  /** One dominant flow direction; both variants flow along it. */
  readonly flowDirection: 'left-to-right';
  /** Content-safe areas per breakpoint (receiving section's own column). */
  readonly safeArea: 'full-bleed-editorial';
  readonly contentColumn: 'receiving-section';
  /** Static master always renders; optional bounded motion stays off here. */
  readonly motion: {
    readonly supported: boolean;
    readonly fallback: 'no-motion' | 'static-glow-only';
  };
  readonly source: {
    readonly css: 'apps/web/app/(home)/home.css';
    readonly component: 'apps/web/components/marketing/MarketingEditorialBackground.tsx';
    readonly issueId: 'JOV-6249';
  };
}

/**
 * Soft master — the homepage editorial-hero light well. Broad low-contrast
 * transitions, gentle depth, off-center-capable illumination, large dark
 * negative space for content.
 */
export const SOFT_EDITORIAL_BACKGROUND_INSTANCE: MarketingEditorialBackgroundInstance =
  {
    id: 'editorial-background.soft.homepage-hero',
    variant: 'soft',
    accent: MARKETING_EDITORIAL_BACKGROUND_INSTANCE_ACCENTS.soft,
    focal: {
      desktop: { x: 'center', y: 'center' },
      mobile: { x: 'center', y: 'center' },
    },
    flowDirection: 'left-to-right',
    safeArea: 'full-bleed-editorial',
    contentColumn: 'receiving-section',
    motion: { supported: false, fallback: 'no-motion' },
    source: {
      css: 'apps/web/app/(home)/home.css',
      component:
        'apps/web/components/marketing/MarketingEditorialBackground.tsx',
      issueId: 'JOV-6249',
    },
  };

/**
 * Flowing master — one dominant left-to-right sweep (the electric-seam
 * curve family) with the bloom-B motivated highlight subordinate to it.
 * Fewer contradictory curves; the entire field flows together.
 */
export const FLOWING_EDITORIAL_BACKGROUND_INSTANCE: MarketingEditorialBackgroundInstance =
  {
    id: 'editorial-background.flowing.feature-sweep',
    variant: 'flowing',
    accent: MARKETING_EDITORIAL_BACKGROUND_INSTANCE_ACCENTS.flowing,
    focal: {
      desktop: { x: 'center', y: 'top' },
      mobile: { x: 'center', y: 'top' },
    },
    flowDirection: 'left-to-right',
    safeArea: 'full-bleed-editorial',
    contentColumn: 'receiving-section',
    motion: { supported: true, fallback: 'static-glow-only' },
    source: {
      css: 'apps/web/app/(home)/home.css',
      component:
        'apps/web/components/marketing/MarketingEditorialBackground.tsx',
      issueId: 'JOV-6249',
    },
  };

export const MARKETING_EDITORIAL_BACKGROUND_INSTANCES: readonly MarketingEditorialBackgroundInstance[] =
  [SOFT_EDITORIAL_BACKGROUND_INSTANCE, FLOWING_EDITORIAL_BACKGROUND_INSTANCE];

export function getMarketingEditorialBackgroundInstance(
  id: MarketingEditorialBackgroundInstanceId
): MarketingEditorialBackgroundInstance {
  const instance = MARKETING_EDITORIAL_BACKGROUND_INSTANCES.find(
    candidate => candidate.id === id
  );
  if (!instance) {
    throw new Error(`Unknown marketing editorial background instance: ${id}`);
  }
  return instance;
}

function finding(
  code: MarketingEditorialBackgroundInstanceFindingCode,
  subject: string,
  message: string
): MarketingEditorialBackgroundInstanceFinding {
  return { code, subject, message };
}

/**
 * Runtime validation of an editorial-background instance. Fails closed on
 * unknown instance ids, unsupported variants, non-canonical accents (no
 * generator-supplied free-form colors), missing safe-area/content-column
 * declarations, missing flow direction, and supported motion without an
 * approved reduced-motion fallback still.
 */
export function validateMarketingEditorialBackgroundInstance(
  instance:
    | MarketingEditorialBackgroundInstance
    | (Omit<MarketingEditorialBackgroundInstance, 'id'> & {
        readonly id: string;
      })
): readonly MarketingEditorialBackgroundInstanceFinding[] {
  const findings: MarketingEditorialBackgroundInstanceFinding[] = [];

  const registered = MARKETING_EDITORIAL_BACKGROUND_INSTANCES.find(
    candidate => candidate.id === instance.id
  );
  if (!registered) {
    return [
      finding(
        'unknown-editorial-background-instance',
        instance.id,
        'Editorial background instance must be one of the registered instances.'
      ),
    ];
  }

  if (instance.variant !== 'soft' && instance.variant !== 'flowing') {
    findings.push(
      finding(
        'unsupported-instance-variant',
        instance.id,
        'Instance variant must be soft or flowing.'
      )
    );
  }

  const canonicalAccent =
    MARKETING_EDITORIAL_BACKGROUND_INSTANCE_ACCENTS[instance.variant] ??
    MARKETING_EDITORIAL_BACKGROUND_INSTANCE_ACCENTS[
      registered.variant as MarketingEditorialBackgroundInstanceVariant
    ];
  if (
    instance.accent.token !== canonicalAccent.token ||
    instance.accent.hex !== canonicalAccent.hex
  ) {
    findings.push(
      finding(
        'noncanonical-instance-accent',
        instance.id,
        `Accent must derive from the canonical ${canonicalAccent.token} (${canonicalAccent.hex}).`
      )
    );
  }

  if (instance.safeArea !== 'full-bleed-editorial') {
    findings.push(
      finding(
        'missing-instance-safe-area',
        instance.id,
        'Full-bleed editorial backgrounds declare their safe area.'
      )
    );
  }

  if (instance.contentColumn !== 'receiving-section') {
    findings.push(
      finding(
        'missing-instance-content-column',
        instance.id,
        'The receiving section owns the content column and typography.'
      )
    );
  }

  if (instance.flowDirection !== 'left-to-right') {
    findings.push(
      finding(
        'missing-instance-flow-direction',
        instance.id,
        'One dominant flow direction is required per instance.'
      )
    );
  }

  if (instance.motion.supported && instance.motion.fallback === 'no-motion') {
    findings.push(
      finding(
        'unsupported-instance-motion',
        instance.id,
        'Supported motion requires an approved reduced-motion fallback still.'
      )
    );
  }

  return findings;
}
