/**
 * Single need-then-noise composition for every Ovie HUD presentation.
 *
 * Need is what an operator must see before walking away. Noise is after-action.
 * Admin-shell and kiosk/fullscreen both call `composeHudForPresentation` so
 * the two densities cannot drift.
 */

export const HUD_NEED_SECTION_IDS = [
  'morning-walk',
  'cash-mrr',
  'factory-health',
  'shipper',
] as const;

export const HUD_NOISE_SECTION_IDS = [
  'design-jury',
  'velocity',
  'agent-runs',
  'what-shipped',
  'action-required',
  'dispatch-details',
] as const;

export type HudNeedSectionId = (typeof HUD_NEED_SECTION_IDS)[number];
export type HudNoiseSectionId = (typeof HUD_NOISE_SECTION_IDS)[number];
export type HudSectionId = HudNeedSectionId | HudNoiseSectionId;

export type HudPresentation = 'shell' | 'kiosk' | 'token';
export type HudBandKind = 'need' | 'noise';

export const HUD_SECTION_TEST_IDS = {
  'morning-walk': 'founder-morning-walk',
  'cash-mrr': 'hud-cash-mrr',
  'factory-health': 'hud-system-health-strip',
  shipper: 'hud-shipper-status-panel',
  'design-jury': 'hud-design-jury',
  velocity: 'hud-shipping-velocity',
  'agent-runs': 'hud-agent-runs',
  'what-shipped': 'what-shipped-card',
  'action-required': 'tim-action-required',
  'dispatch-details': 'hud-dispatch-details',
} as const satisfies Record<HudSectionId, string>;

export interface HudComposedSection {
  readonly id: HudSectionId;
  readonly band: HudBandKind;
  readonly testId: (typeof HUD_SECTION_TEST_IDS)[HudSectionId];
}

function section(
  id: HudNeedSectionId | HudNoiseSectionId,
  band: HudBandKind
): HudComposedSection {
  return { id, band, testId: HUD_SECTION_TEST_IDS[id] };
}

const HUD_COMPOSED_SECTIONS: readonly HudComposedSection[] = [
  ...HUD_NEED_SECTION_IDS.map(id => section(id, 'need')),
  ...HUD_NOISE_SECTION_IDS.map(id => section(id, 'noise')),
];

/**
 * Shipped HUD composition used by shell, signed-in fullscreen, and kiosk token.
 * Presentation may change chrome and fetch sources; it must not reorder bands
 * or duplicate a need signal.
 */
export function composeHudForPresentation(
  _presentation: HudPresentation
): readonly HudComposedSection[] {
  return HUD_COMPOSED_SECTIONS;
}

export function getHudNeedBand(
  sections: readonly HudComposedSection[]
): readonly HudComposedSection[] {
  return sections.filter(entry => entry.band === 'need');
}

export function getHudNoiseBand(
  sections: readonly HudComposedSection[]
): readonly HudComposedSection[] {
  return sections.filter(entry => entry.band === 'noise');
}

export function needSignalIds(
  sections: readonly HudComposedSection[]
): readonly HudNeedSectionId[] {
  return getHudNeedBand(sections).map(entry => entry.id as HudNeedSectionId);
}
