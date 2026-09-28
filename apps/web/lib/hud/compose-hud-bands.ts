/**
 * Single executive-cockpit composition for every Ovie Ops presentation.
 *
 * Ops is one scan-first screen, not an accordion of subsystem panels. Every
 * presentation (shell, signed-in fullscreen, kiosk token) renders the same
 * ordered sections via `composeHudForPresentation` so the densities cannot
 * drift. Section bodies decide for themselves whether their data is
 * meaningful — empty subsystems render nothing instead of empty chrome.
 */

export const HUD_SECTION_IDS = [
  'company-metrics',
  'shipping',
  'exceptions',
  'action-required',
  'whats-new',
  'bottlenecks',
] as const;

export type HudSectionId = (typeof HUD_SECTION_IDS)[number];

export type HudPresentation = 'shell' | 'kiosk' | 'token';

export const HUD_SECTION_TEST_IDS = {
  'company-metrics': 'hud-company-metrics',
  shipping: 'hud-shipping-strip',
  exceptions: 'hud-exceptions',
  'action-required': 'tim-action-required',
  'whats-new': 'what-shipped-card',
  bottlenecks: 'hud-bottlenecks',
} as const satisfies Record<HudSectionId, string>;

export const HUD_SECTION_LABELS = {
  'company-metrics': 'Company',
  shipping: 'Shipping',
  exceptions: 'Needs attention',
  'action-required': 'Needs Tim',
  'whats-new': "What's New",
  bottlenecks: 'Bottlenecks',
} as const satisfies Record<HudSectionId, string>;

export interface HudComposedSection {
  readonly id: HudSectionId;
  readonly testId: (typeof HUD_SECTION_TEST_IDS)[HudSectionId];
  readonly label: (typeof HUD_SECTION_LABELS)[HudSectionId];
}

const HUD_COMPOSED_SECTIONS: readonly HudComposedSection[] =
  HUD_SECTION_IDS.map(id => ({
    id,
    testId: HUD_SECTION_TEST_IDS[id],
    label: HUD_SECTION_LABELS[id],
  }));

/**
 * Shipped HUD composition used by shell, signed-in fullscreen, and kiosk token.
 * Presentation may change chrome and fetch sources; it must not reorder
 * sections or duplicate a signal.
 */
export function composeHudForPresentation(
  _presentation: HudPresentation
): readonly HudComposedSection[] {
  return HUD_COMPOSED_SECTIONS;
}
