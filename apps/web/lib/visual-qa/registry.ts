import { APP_FLAG_OVERRIDE_KEYS } from '@/lib/flags/contracts';
import {
  VISUAL_QA_COLOR_SCHEMES,
  type VisualQaColorScheme,
} from '@/lib/visual-qa/themes';
import type {
  VisualQaCaptureConfig,
  VisualQaSurface,
} from '@/lib/visual-qa/types';

const DESIGN_V1_OVERRIDES = {
  [APP_FLAG_OVERRIDE_KEYS.DESIGN_V1]: true,
} as const satisfies Readonly<Record<string, boolean>>;

interface VisualQaSurfaceSeed
  extends Omit<VisualQaSurface, 'baseline' | 'after'> {
  readonly baseline: Omit<VisualQaCaptureConfig, 'flagOverrides'> & {
    readonly flagOverrides?: Readonly<Record<string, boolean>>;
  };
  readonly after?: Partial<VisualQaCaptureConfig>;
}

function defineSurface(seed: VisualQaSurfaceSeed): VisualQaSurface {
  const baseline: VisualQaCaptureConfig = {
    ...seed.baseline,
    flagOverrides: seed.baseline.flagOverrides ?? DESIGN_V1_OVERRIDES,
  };

  return {
    id: seed.id,
    title: seed.title,
    description: seed.description,
    parityLedgerGroup: seed.parityLedgerGroup,
    canonicalSurfaceId: seed.canonicalSurfaceId,
    themes: seed.themes ?? [...VISUAL_QA_COLOR_SCHEMES],
    baseline,
    after: seed.after,
  };
}

/**
 * Declared design surfaces for the Visual QA proposal-validation pipeline.
 *
 * Distinct from:
 * - apps/web/lib/screenshots/registry.ts (marketing/admin catalog)
 * - docs/JOV-1605-screenshot-parity-ledger.md (manual parity drain)
 */
export const VISUAL_QA_SURFACES = [
  defineSurface({
    id: 'shell-desktop-idle',
    title: 'Shell — desktop idle',
    description:
      'Global shell chrome at desktop idle for proposal validation against JOV-1605 shell parity rows.',
    parityLedgerGroup: 'Shell',
    canonicalSurfaceId: 'dashboard-releases',
    baseline: {
      route: '/exp/shell-v1?capture=marketing',
      waitFor: '.shell-v1',
      viewport: 'desktop',
      captureTarget: 'page',
      fullPage: false,
      reducedMotion: true,
    },
  }),
  defineSurface({
    id: 'list-releases-default',
    title: 'List — releases default density',
    description:
      'Authenticated releases list at default density for proposal validation against JOV-1605 list parity rows.',
    parityLedgerGroup: 'List',
    canonicalSurfaceId: 'dashboard-releases',
    baseline: {
      route: '/exp/shell-v1?view=releases&capture=marketing',
      waitFor: '[data-testid="releases-matrix"]',
      viewport: 'desktop',
      captureTarget: 'page',
      fullPage: false,
      reducedMotion: true,
    },
  }),
  defineSurface({
    id: 'drawer-release-open',
    title: 'Drawer — release detail open',
    description:
      'Right drawer with an open release detail state for proposal validation against JOV-1605 drawer parity rows.',
    parityLedgerGroup: 'Drawer',
    canonicalSurfaceId: 'dashboard-releases',
    baseline: {
      route:
        '/exp/shell-v1?view=releases&release=the-deep-end&capture=marketing',
      waitFor: '[data-testid="shell-v1-release-drawer"]',
      viewport: 'desktop',
      captureTarget: 'page',
      fullPage: false,
      reducedMotion: true,
    },
  }),
  defineSurface({
    id: 'settings-root-hierarchy',
    title: 'Settings — root hierarchy',
    description:
      'Settings root hierarchy and control rhythm for proposal validation against JOV-1605 settings parity rows.',
    parityLedgerGroup: 'Settings',
    canonicalSurfaceId: 'settings-artist-profile',
    baseline: {
      route: '/demo/showcase/settings?capture=quality',
      waitFor: '[data-testid="demo-settings-audience-quality-capture"]',
      viewport: 'desktop',
      captureTarget: 'page',
      fullPage: false,
      reducedMotion: true,
    },
  }),
] as const satisfies readonly VisualQaSurface[];

export type VisualQaSurfaceId = (typeof VISUAL_QA_SURFACES)[number]['id'];

export function getVisualQaSurface(id: string): VisualQaSurface | undefined {
  return VISUAL_QA_SURFACES.find(surface => surface.id === id);
}

export function listVisualQaSurfaces(
  surfaceIds?: readonly string[]
): readonly VisualQaSurface[] {
  if (!surfaceIds || surfaceIds.length === 0) {
    return VISUAL_QA_SURFACES;
  }

  const allowed = new Set(surfaceIds);
  return VISUAL_QA_SURFACES.filter(surface => allowed.has(surface.id));
}

export function resolveVisualQaCaptureConfig(
  surface: VisualQaSurface,
  phase: 'baseline' | 'after',
  colorScheme: VisualQaColorScheme
): VisualQaCaptureConfig {
  const baseConfig =
    phase === 'baseline'
      ? surface.baseline
      : {
          ...surface.baseline,
          ...surface.after,
          flagOverrides: {
            ...surface.baseline.flagOverrides,
            ...surface.after?.flagOverrides,
          },
        };

  return {
    ...baseConfig,
    colorScheme: baseConfig.colorScheme ?? colorScheme,
  };
}

export function resolveVisualQaSurfaceThemes(
  surface: VisualQaSurface,
  requestedThemes: readonly VisualQaColorScheme[]
): readonly VisualQaColorScheme[] {
  const allowed = new Set(surface.themes ?? VISUAL_QA_COLOR_SCHEMES);
  return requestedThemes.filter(theme => allowed.has(theme));
}
