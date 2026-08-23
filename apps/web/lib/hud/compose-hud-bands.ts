/**
 * Single need-then-noise composition for every Ovie Ops presentation.
 *
 * Need is what an operator must see before walking away. Noise is after-action
 * disclosure. Admin-shell and kiosk/fullscreen both call
 * `composeHudForPresentation` so the two densities cannot drift.
 */

export const HUD_NEED_SECTION_IDS = ['cash-mrr'] as const;

export const HUD_NOISE_SECTION_IDS = [
  'action-required',
  'bottleneck',
  'shipper',
  'factory-health',
  'morning-walk',
  'design-jury',
  'velocity',
  'agent-runs',
  'what-shipped',
  'dispatch-details',
] as const;

export type HudNeedSectionId = (typeof HUD_NEED_SECTION_IDS)[number];
export type HudNoiseSectionId = (typeof HUD_NOISE_SECTION_IDS)[number];
export type HudSectionId = HudNeedSectionId | HudNoiseSectionId;

export type HudPresentation = 'shell' | 'kiosk' | 'token';
export type HudBandKind = 'need' | 'noise';

export const HUD_SECTION_TEST_IDS = {
  'action-required': 'tim-action-required',
  'cash-mrr': 'hud-cash-mrr',
  bottleneck: 'hud-bottleneck',
  shipper: 'hud-shipper-status-panel',
  'factory-health': 'hud-system-health-strip',
  'morning-walk': 'founder-morning-walk',
  'design-jury': 'hud-design-jury',
  velocity: 'hud-shipping-velocity',
  'agent-runs': 'hud-agent-runs',
  'what-shipped': 'what-shipped-card',
  'dispatch-details': 'hud-dispatch-details',
} as const satisfies Record<HudSectionId, string>;

export const HUD_SECTION_LABELS = {
  'action-required': 'Needs Tim',
  'cash-mrr': 'Company Now',
  bottleneck: 'Bottleneck',
  shipper: 'Delivery',
  'factory-health': 'Operating chain',
  'morning-walk': 'Morning walk',
  'design-jury': 'Design jury',
  velocity: 'Velocity',
  'agent-runs': 'Agent runs',
  'what-shipped': 'What shipped',
  'dispatch-details': 'Dispatch and diagnostics',
} as const satisfies Record<HudSectionId, string>;

export interface HudComposedSection {
  readonly id: HudSectionId;
  readonly band: HudBandKind;
  readonly testId: (typeof HUD_SECTION_TEST_IDS)[HudSectionId];
  readonly label: (typeof HUD_SECTION_LABELS)[HudSectionId];
}

function section(
  id: HudNeedSectionId | HudNoiseSectionId,
  band: HudBandKind
): HudComposedSection {
  return {
    id,
    band,
    testId: HUD_SECTION_TEST_IDS[id],
    label: HUD_SECTION_LABELS[id],
  };
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
