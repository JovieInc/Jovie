// @coverage-via apps/web/tests/unit/design-system/rail-icon-family.test.tsx

import { createLucideIcon, type IconNode } from 'lucide-react';

/**
 * Jovie-owned rail-toggle icon family (JOV-7207, registered via JOV-4701).
 *
 * Founder decision 2026-10-03: mirrored, distinct states. Each side has its
 * own open and closed art, the right side is the exact mirror of the left,
 * and no state carries an arrow or chevron. Geometry starts from the clean
 * Lucide `PanelLeft` frame on the 24px grid so stroke weight, radius and
 * optical size match every other registry glyph at 14-16px.
 *
 *   closed: the pane frame and rail divider only (rail hidden)
 *   open:   the same frame with the rail filled (rail shown)
 */

const FRAME: IconNode = [
  [
    'rect',
    { width: '18', height: '18', x: '3', y: '3', rx: '2', key: 'frame' },
  ],
  ['path', { d: 'M9 3v18', key: 'divider' }],
];
const FILLED_RAIL: IconNode = [
  [
    'path',
    {
      d: 'M3 5a2 2 0 0 1 2-2h4v18H5a2 2 0 0 1-2-2Z',
      fill: 'currentColor',
      stroke: 'none',
      key: 'rail',
    },
  ],
];

/** Mirror across the vertical centre of the 24px grid. */
export const RAIL_MIRROR_TRANSFORM = 'matrix(-1 0 0 1 24 0)';

export function mirrorRailNode(node: IconNode): IconNode {
  return node.map(([tag, attrs]) => [
    tag,
    { ...attrs, transform: RAIL_MIRROR_TRANSFORM },
  ]);
}

const LEFT_CLOSED = FRAME;
const LEFT_OPEN: IconNode = [...FRAME, ...FILLED_RAIL];

export const RAIL_ICON_NODES = {
  RailLeftClosed: LEFT_CLOSED,
  RailLeftOpen: LEFT_OPEN,
  RailRightClosed: mirrorRailNode(LEFT_CLOSED),
  RailRightOpen: mirrorRailNode(LEFT_OPEN),
} as const satisfies Record<string, IconNode>;

export type RailIconName = keyof typeof RAIL_ICON_NODES;

export const RailLeftClosed = createLucideIcon(
  'rail-left-closed',
  RAIL_ICON_NODES.RailLeftClosed
);
export const RailLeftOpen = createLucideIcon(
  'rail-left-open',
  RAIL_ICON_NODES.RailLeftOpen
);
export const RailRightClosed = createLucideIcon(
  'rail-right-closed',
  RAIL_ICON_NODES.RailRightClosed
);
export const RailRightOpen = createLucideIcon(
  'rail-right-open',
  RAIL_ICON_NODES.RailRightOpen
);

/** The one place shell rail controls resolve their glyph. */
export function railIconName(
  side: 'left' | 'right',
  open: boolean
): RailIconName {
  if (side === 'left') return open ? 'RailLeftOpen' : 'RailLeftClosed';
  return open ? 'RailRightOpen' : 'RailRightClosed';
}
