import { APP_ROUTES } from '@/constants/routes';
import type { DevTestAuthPersona } from '@/lib/auth/dev-test-auth-types';

export interface AuthedAxeSurface {
  readonly id: string;
  readonly path: string;
  /** One of these selectors must be visible before axe runs. */
  readonly readySelectors: readonly string[];
  /** Persona to authenticate as. Defaults to 'creator-ready' (Pro). */
  readonly persona?: DevTestAuthPersona;
  /** If true, test skips when the route redirects instead of rendering. */
  readonly allowRedirect?: boolean;
}

/**
 * Key authenticated surfaces to include in the color-contrast axe gate.
 *
 * Each entry is tested in BOTH light and dark themes. The route must render
 * meaningfully with the given persona so that color-contrast violations are
 * catchable before they reach production.
 *
 * Rationale for surface selection (JOV-11027):
 *  - releases: largest persistent dashboard view, many text/bg combinations
 *  - earnings: data-dense surface with charts and text overlays
 *  - settings: settings panel with form fields and labels
 *  - onboarding: multi-step flow, first touch for new users
 *  - library: media-dense surface with artwork overlays, waveforms, and
 *    text-on-image combinations distinct from the chart/table surfaces above
 *  - presence: status glyphs, outcome metrics, and connection-rail text on
 *    colored state indicators — a pattern not exercised by the other surfaces
 *
 * chat has its own dedicated coverage (tests/e2e/chat-axe.spec.ts) and is
 * intentionally not duplicated here.
 *
 * Surfaces that need Pro entitlements use 'creator-ready'.
 * Onboarding uses 'creator' (free/incomplete) to render the actual wizard.
 */
export const AUTHED_AXE_SURFACES: readonly AuthedAxeSurface[] = [
  {
    id: 'authed-releases',
    path: APP_ROUTES.RELEASES,
    readySelectors: ['main', '[data-testid]', 'h1'],
    persona: 'creator-ready',
  },
  {
    id: 'authed-earnings',
    path: APP_ROUTES.DASHBOARD_EARNINGS,
    readySelectors: ['main', '[data-testid]', 'h1'],
    persona: 'creator-ready',
  },
  {
    id: 'authed-settings',
    path: APP_ROUTES.SETTINGS,
    readySelectors: ['main', 'h1', '[data-testid]'],
    persona: 'creator-ready',
  },
  {
    id: 'authed-onboarding',
    path: APP_ROUTES.ONBOARDING,
    readySelectors: ['main', 'h1', 'form', '[data-testid]'],
    persona: 'creator',
    allowRedirect: true,
  },
  {
    id: 'authed-library',
    path: APP_ROUTES.LIBRARY,
    readySelectors: ['main', '[data-testid]', 'h1'],
    persona: 'creator-ready',
  },
  {
    id: 'authed-presence',
    path: APP_ROUTES.PRESENCE,
    readySelectors: ['main', '[data-testid]', 'h1'],
    persona: 'creator-ready',
  },
] as const;
