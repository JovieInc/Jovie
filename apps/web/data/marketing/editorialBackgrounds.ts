/**
 * Editorial background masters for marketing sections (JOV-6249).
 *
 * Implements the JOV-6246 approved art direction as two variants of one
 * shared background system:
 *
 *   - `soft`: quiet soft atmosphere — broad low-contrast transitions with
 *     gentle depth (approved targets #18 broad curved light boundary, #21
 *     subdued curves / dark space).
 *   - `flow`: higher-energy coherent directional sweep — one dominant curve
 *     with subordinate echoes and motivated highlights (approved target #24
 *     material/light quality, with the founder correction that the whole
 *     field flows together instead of fighting contradictory curves).
 *
 * Each variant declares exactly one canonical accent anchor resolved through
 * the JOV-5265 scene-first color policy (`./imageColorPolicy`). UI anchors
 * stay the production tokens; scene references stay inside the approved
 * plausibility ranges. Do not invent a third variant or a new accent.
 */

import {
  JOVIE_IMAGE_COLOR_POLICY,
  type JovieImageSceneColorRole,
} from './imageColorPolicy';

export const JOVIE_EDITORIAL_BACKGROUND_SCHEMA =
  'jovie-editorial-background/v1';
export const JOVIE_EDITORIAL_BACKGROUND_VERSION = 'editorial-masters-v1';

export const MARKETING_EDITORIAL_BACKGROUND_VARIANT_IDS = [
  'soft',
  'flow',
] as const;

export type MarketingEditorialBackgroundVariantId =
  (typeof MARKETING_EDITORIAL_BACKGROUND_VARIANT_IDS)[number];

export type MarketingEditorialBackgroundFindingCode =
  | 'unknown-editorial-variant'
  | 'editorial-accent-off-canon'
  | 'editorial-centered-hotspot'
  | 'editorial-uniform-glow'
  | 'editorial-crossing-curves'
  | 'editorial-competing-bright-center'
  | 'editorial-clipped-foreground'
  | 'editorial-unbounded-motion';

export interface MarketingEditorialBackgroundFinding {
  readonly code: MarketingEditorialBackgroundFindingCode;
  readonly stage: 'asset-generation' | 'adversarial-review';
  readonly subject: string;
  readonly message: string;
}

export interface MarketingEditorialBackgroundPoint {
  /** Percent of canvas width, 0-100. */
  readonly x: number;
  /** Percent of canvas height, 0-100. */
  readonly y: number;
}

export interface MarketingEditorialBackgroundRect {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

export interface MarketingEditorialBackgroundComposition {
  /** Light focal point per breakpoint. Off-center by policy. */
  readonly focal: {
    readonly desktop: MarketingEditorialBackgroundPoint;
    readonly mobile: MarketingEditorialBackgroundPoint;
  };
  /** Dominant light-flow direction, declared in words per breakpoint. */
  readonly flowDirection: {
    readonly desktop: string;
    readonly mobile: string;
  };
  /**
   * Calm dark regions reserved for receiving content. Backgrounds may bleed
   * to the edges; these rects must stay free of bright structure so real
   * foreground material keeps contrast after crop.
   */
  readonly contentSafe: {
    readonly desktop: MarketingEditorialBackgroundRect;
    readonly mobile: MarketingEditorialBackgroundRect;
  };
}

export interface MarketingEditorialBackgroundAccent {
  /** Canonical scene role from the JOV-5265 scene palette. */
  readonly role: JovieImageSceneColorRole;
  /** Production UI anchor token that carries the accent. */
  readonly uiToken: string;
  /** Production UI anchor hex (must equal the policy uiAnchor). */
  readonly uiHex: string;
  /** Low-alpha wash token used for the dominant chromatic core. */
  readonly washToken: string;
  /** Scene-space reference hex (must equal the policy sceneReference). */
  readonly sceneHex: string;
}

export interface MarketingEditorialBackgroundCurve {
  readonly path: string;
  /** Relative weight: 'dominant' | 'subordinate'. */
  readonly weight: 'dominant' | 'subordinate';
}

export interface MarketingEditorialBackgroundVariant {
  readonly id: MarketingEditorialBackgroundVariantId;
  readonly kind: 'editorial-background';
  readonly label: string;
  readonly source: {
    readonly component: string;
    readonly css: string;
    readonly approvedTargets: readonly string[];
    readonly specIssueId: 'JOV-6246';
  };
  readonly accent: MarketingEditorialBackgroundAccent;
  readonly composition: MarketingEditorialBackgroundComposition;
  readonly curves: {
    readonly viewBox: string;
    readonly list: readonly MarketingEditorialBackgroundCurve[];
  };
  readonly washes: {
    /** Number of broad gradient wash layers (>= 2; a single flat layer is a defect). */
    readonly count: number;
    readonly maxPeakOpacity: number;
  };
  readonly motion: {
    readonly master: 'static';
    readonly optionalBounded: string;
    readonly reducedMotion: 'static-master';
  };
  readonly never: readonly string[];
}

function sceneAccent(
  role: JovieImageSceneColorRole,
  uiToken: string,
  washToken: string
): MarketingEditorialBackgroundAccent {
  const entry = JOVIE_IMAGE_COLOR_POLICY.scenePalette.find(
    palette => palette.role === role
  );
  if (!entry) {
    throw new Error(`Unknown scene palette role: ${role}`);
  }
  return {
    role,
    uiToken,
    uiHex: entry.uiAnchor.hex,
    washToken,
    sceneHex: entry.sceneReference.hex,
  };
}

/**
 * Soft — quiet atmosphere. Ultra anchor kept at wash intensity so the
 * field reads as haze, not object. Focal sits upper-right on desktop and
 * upper-center on mobile; content column stays calm lower-left/center.
 */
export const EDITORIAL_BACKGROUND_SOFT: MarketingEditorialBackgroundVariant = {
  id: 'soft',
  kind: 'editorial-background',
  label: 'Quiet soft atmosphere',
  source: {
    component: 'apps/web/components/marketing/MarketingEditorialBackground.tsx',
    css: 'apps/web/components/marketing/MarketingEditorialBackground.css',
    approvedTargets: ['#18 broad curved light boundary', '#21 subdued curves'],
    specIssueId: 'JOV-6246',
  },
  accent: sceneAccent('ultra', '--noir-ion-ultra', '--noir-ion-ultra-soft'),
  composition: {
    focal: {
      desktop: { x: 72, y: 28 },
      mobile: { x: 50, y: 16 },
    },
    flowDirection: {
      desktop: 'gentle falloff from upper-right toward lower-left',
      mobile: 'gentle falloff from top-center downward',
    },
    contentSafe: {
      desktop: { x: 6, y: 34, width: 52, height: 60 },
      mobile: { x: 6, y: 40, width: 88, height: 56 },
    },
  },
  curves: {
    viewBox: '0 0 1440 900',
    list: [],
  },
  washes: {
    count: 3,
    maxPeakOpacity: 0.16,
  },
  motion: {
    master: 'static',
    optionalBounded:
      'None shipped. A bounded slow drift may be added per-section only where it benefits, following the same falloff direction.',
    reducedMotion: 'static-master',
  },
  never: [
    'A centered-only hotspot (focal at 50/50)',
    'A single uniform glow layer',
    'Hard tactical diagonals or visible banding edges',
    'A second competing bright center',
  ],
} as const;

/**
 * Flow — one dominant rising sweep, left-to-right, with two subordinate
 * echoes that share its direction and never cross it (the founder's #24
 * correction: the entire field flows together). Ion anchor matches the
 * production electric-seam cyan family.
 */
export const EDITORIAL_BACKGROUND_FLOW: MarketingEditorialBackgroundVariant = {
  id: 'flow',
  kind: 'editorial-background',
  label: 'Coherent directional sweep',
  source: {
    component: 'apps/web/components/marketing/MarketingEditorialBackground.tsx',
    css: 'apps/web/components/marketing/MarketingEditorialBackground.css',
    approvedTargets: ['#24 material/light quality, unified field'],
    specIssueId: 'JOV-6246',
  },
  accent: sceneAccent(
    'ion',
    '--system-b-accent-cyan',
    '--color-accent-blue-subtle'
  ),
  composition: {
    focal: {
      desktop: { x: 78, y: 30 },
      mobile: { x: 60, y: 18 },
    },
    flowDirection: {
      desktop: 'single rising sweep from lower-left to upper-right',
      mobile: 'single rising sweep from lower-left to upper-right, tightened',
    },
    contentSafe: {
      desktop: { x: 6, y: 30, width: 48, height: 62 },
      mobile: { x: 6, y: 38, width: 88, height: 56 },
    },
  },
  curves: {
    viewBox: '0 0 1440 900',
    list: [
      {
        weight: 'dominant',
        path: 'M-60 700 C 340 560 780 480 1500 260',
      },
      {
        weight: 'subordinate',
        path: 'M-60 780 C 380 660 840 580 1500 400',
      },
      {
        weight: 'subordinate',
        path: 'M-60 560 C 300 460 720 380 1500 170',
      },
    ],
  },
  washes: {
    count: 2,
    maxPeakOpacity: 0.14,
  },
  motion: {
    master: 'static',
    optionalBounded:
      'None shipped. A bounded one-shot travel along the dominant sweep may be added per-section only where it benefits; it must follow the sweep direction and land on the approved still.',
    reducedMotion: 'static-master',
  },
  never: [
    'Crossing or contradictory curves that fight the dominant sweep',
    'A centered-only hotspot detached from the sweep',
    'Noisy rainbow blends or rotating accent hues',
    'Clipping or covering the receiving foreground content',
  ],
} as const;

export const MARKETING_EDITORIAL_BACKGROUNDS = {
  soft: EDITORIAL_BACKGROUND_SOFT,
  flow: EDITORIAL_BACKGROUND_FLOW,
} as const;

export function isMarketingEditorialBackgroundVariantId(
  id: string
): id is MarketingEditorialBackgroundVariantId {
  return (
    MARKETING_EDITORIAL_BACKGROUND_VARIANT_IDS as readonly string[]
  ).includes(id);
}

export function getMarketingEditorialBackground(
  id: MarketingEditorialBackgroundVariantId
): MarketingEditorialBackgroundVariant {
  return MARKETING_EDITORIAL_BACKGROUNDS[id];
}

function finding(
  code: MarketingEditorialBackgroundFindingCode,
  subject: string,
  message: string
): MarketingEditorialBackgroundFinding {
  return { code, stage: 'asset-generation', subject, message };
}

export interface MarketingEditorialBackgroundDecision {
  readonly variantId: string;
  /** Declared scene role for the dominant chromatic core. */
  readonly accentRole?: string;
  /** Declared UI hex for the dominant chromatic core. */
  readonly accentHex?: string;
  /** Declared focal point, if the render moved it. */
  readonly focal?: MarketingEditorialBackgroundPoint;
  /** True if the render collapses to one flat uniform layer. */
  readonly singleUniformLayer?: boolean;
  /** True if any subordinate curve crosses or reverses the dominant sweep. */
  readonly curvesCross?: boolean;
  /** True if the render adds a second bright center. */
  readonly competingBrightCenter?: boolean;
  /** True if the background covers or clips real foreground content. */
  readonly clipsForeground?: boolean;
  /** True if motion loops forever or runs without reduced-motion fallback. */
  readonly unboundedMotion?: boolean;
}

export function auditMarketingEditorialBackgroundDecision(
  decision: MarketingEditorialBackgroundDecision
): readonly MarketingEditorialBackgroundFinding[] {
  const findings: MarketingEditorialBackgroundFinding[] = [];

  if (!isMarketingEditorialBackgroundVariantId(decision.variantId)) {
    findings.push(
      finding(
        'unknown-editorial-variant',
        decision.variantId,
        'Only the registered soft and flow editorial backgrounds are approved.'
      )
    );
    return findings;
  }

  const variant = MARKETING_EDITORIAL_BACKGROUNDS[decision.variantId];

  if (
    (decision.accentRole !== undefined &&
      decision.accentRole !== variant.accent.role) ||
    (decision.accentHex !== undefined &&
      decision.accentHex.toLowerCase() !== variant.accent.uiHex.toLowerCase())
  ) {
    findings.push(
      finding(
        'editorial-accent-off-canon',
        decision.variantId,
        `Dominant chromatic core must resolve to the ${variant.accent.role} scene role on ${variant.accent.uiToken} (${variant.accent.uiHex}).`
      )
    );
  }

  if (decision.focal) {
    const { x, y } = decision.focal;
    if (x === 50 && y === 50) {
      findings.push(
        finding(
          'editorial-centered-hotspot',
          decision.variantId,
          'A centered-only hotspot is a defect; the light source may be off-center but must not default to dead center.'
        )
      );
    }
  }

  if (decision.singleUniformLayer) {
    findings.push(
      finding(
        'editorial-uniform-glow',
        decision.variantId,
        `A flat uniform glow is a defect; ${variant.id} requires ${variant.washes.count} broad wash layers with gentle depth.`
      )
    );
  }

  if (decision.curvesCross) {
    findings.push(
      finding(
        'editorial-crossing-curves',
        decision.variantId,
        'Subordinate curves must share the dominant sweep direction and never cross it.'
      )
    );
  }

  if (decision.competingBrightCenter) {
    findings.push(
      finding(
        'editorial-competing-bright-center',
        decision.variantId,
        'One chromatic core only; a second competing bright center is a defect.'
      )
    );
  }

  if (decision.clipsForeground) {
    findings.push(
      finding(
        'editorial-clipped-foreground',
        decision.variantId,
        'Full-bleed backgrounds must not clip or cover important foreground material.'
      )
    );
  }

  if (decision.unboundedMotion) {
    findings.push(
      finding(
        'editorial-unbounded-motion',
        decision.variantId,
        `Motion must be bounded and reduced-motion must resolve to the approved static master (${variant.motion.reducedMotion}).`
      )
    );
  }

  return findings;
}

export function formatMarketingEditorialBackgroundsForPrompt(): string {
  const soft = EDITORIAL_BACKGROUND_SOFT;
  const flow = EDITORIAL_BACKGROUND_FLOW;

  return [
    `Jovie Editorial Backgrounds ${JOVIE_EDITORIAL_BACKGROUND_VERSION} (${JOVIE_EDITORIAL_BACKGROUND_SCHEMA})`,
    `Spec: JOV-6246 approved targets ${soft.source.approvedTargets.join('; ')} / ${flow.source.approvedTargets.join('; ')}.`,
    `Approved variants: ${MARKETING_EDITORIAL_BACKGROUND_VARIANT_IDS.join(', ')}.`,
    `soft: ${soft.label}. Accent ${soft.accent.role} on ${soft.accent.uiToken} (${soft.accent.uiHex}), wash ${soft.accent.washToken}. Focal ${soft.composition.focal.desktop.x}%/${soft.composition.focal.desktop.y}% desktop, ${soft.composition.focal.mobile.x}%/${soft.composition.focal.mobile.y}% mobile. Flow: ${soft.composition.flowDirection.desktop}.`,
    `flow: ${flow.label}. Accent ${flow.accent.role} on ${flow.accent.uiToken} (${flow.accent.uiHex}), wash ${flow.accent.washToken}. Dominant curve ${flow.curves.list[0]?.path} in ${flow.curves.viewBox}. Flow: ${flow.composition.flowDirection.desktop}.`,
    `Both keep large calm dark regions for content, ship as static masters, and refuse crossing curves, centered-only hotspots, flat uniform glows, competing bright centers, and clipped foregrounds.`,
  ].join('\n');
}
