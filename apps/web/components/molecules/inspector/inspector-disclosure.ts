/**
 * Inspector progressive-disclosure hierarchy (JOV-6170 / JOV-6173).
 *
 * L1 always visible facts and verbs.
 * L2 ⓘ InfoPopover for helper copy.
 * L3 DisclosureRow for expandable secondary detail.
 * L4 OverflowMenu or a dedicated surface for rare / destructive work.
 */
export const INSPECTOR_DISCLOSURE_LEVELS = ['l1', 'l2', 'l3', 'l4'] as const;

export type InspectorDisclosureLevel =
  (typeof INSPECTOR_DISCLOSURE_LEVELS)[number];

export const INSPECTOR_DISCLOSURE_CONTRACT = {
  l1: 'always-visible',
  l2: 'info-popover',
  l3: 'disclosure-row',
  l4: 'overflow-or-dedicated',
} as const;
