import { render } from '@testing-library/react';
import type { IconNode } from 'lucide-react';
import { describe, expect, it, vi } from 'vitest';
import {
  mirrorRailNode,
  RAIL_ICON_NODES,
  RAIL_MIRROR_TRANSFORM,
  type RailIconName,
  railIconName,
} from '@/components/atoms/rail-icons';

vi.mock('@jovie/ui', () => ({
  IconButton: ({
    children,
    variant: _variant,
    size: _size,
    ...props
  }: React.ComponentProps<'button'> & {
    readonly variant?: string;
    readonly size?: string;
  }) => <button {...props}>{children}</button>,
  TooltipShortcut: ({ children }: { readonly children: React.ReactNode }) =>
    children,
}));

import { RailToggleButton } from '@/components/atoms/RailToggleButton';

/**
 * JOV-7207 / ESC-UI-002 (founder decision 2026-10-03): rail toggles use one
 * Jovie-owned family with distinct open and closed art per side, the right
 * side is the exact mirror of the left, and no state draws an arrow or
 * chevron. Each rule has a deliberate red that must fail the same check.
 */

type Family = Record<RailIconName, IconNode>;

function familyViolations(family: Family): string[] {
  const violations: string[] = [];
  const same = (a: IconNode, b: IconNode) =>
    JSON.stringify(a) === JSON.stringify(b);
  for (const side of ['Left', 'Right'] as const)
    if (same(family[`Rail${side}Open`], family[`Rail${side}Closed`]))
      violations.push(`${side.toLowerCase()}:states-identical`);
  for (const state of ['Open', 'Closed'] as const)
    if (
      !same(
        family[`RailRight${state}`],
        mirrorRailNode(family[`RailLeft${state}`])
      )
    )
      violations.push(`${state.toLowerCase()}:right-not-mirror`);
  for (const [name, node] of Object.entries(family))
    for (const [tag, attrs] of node) {
      if (tag === 'polyline' || tag === 'line')
        violations.push(`${name}:arrow-stroke:${tag}`);
      const d = String((attrs as { d?: unknown }).d ?? '');
      // An arrowhead or chevron is an open polyline of two or more segments
      // (three or more points) with no arc or close. The rail divider
      // (`M9 3v18`) is a single straight stroke.
      const points = (d.match(/-?\d*\.?\d+/g) ?? []).length / 2;
      if (d && !/[aAzZ]/.test(d) && points >= 3)
        violations.push(`${name}:arrow-path`);
    }
  return violations;
}

const clone = (): Family => JSON.parse(JSON.stringify(RAIL_ICON_NODES));

describe('rail icon family (JOV-7207)', () => {
  it('is mirrored, state-distinct and arrow-free', () => {
    expect(familyViolations(clone())).toEqual([]);
    for (const node of [
      RAIL_ICON_NODES.RailRightOpen,
      RAIL_ICON_NODES.RailRightClosed,
    ])
      for (const [, attrs] of node)
        expect(attrs.transform).toBe(RAIL_MIRROR_TRANSFORM);
  });

  it('maps every side and state to its own family member', () => {
    expect(railIconName('left', true)).toBe('RailLeftOpen');
    expect(railIconName('left', false)).toBe('RailLeftClosed');
    expect(railIconName('right', true)).toBe('RailRightOpen');
    expect(railIconName('right', false)).toBe('RailRightClosed');
  });

  it.each([
    ['left', true, 'lucide-rail-left-open'],
    ['left', false, 'lucide-rail-left-closed'],
    ['right', true, 'lucide-rail-right-open'],
    ['right', false, 'lucide-rail-right-closed'],
  ] as const)('RailToggleButton %s open=%s renders %s', (side, open, glyph) => {
    const { getByTestId } = render(
      <RailToggleButton
        side={side}
        open={open}
        openLabel='Collapse'
        closedLabel='Expand'
        onToggle={() => undefined}
        iconTestId='glyph'
      />
    );
    const svg = getByTestId('glyph');
    expect(svg.getAttribute('class')).toContain(glyph);
    expect(svg.getAttribute('class')).not.toMatch(
      /panel-(left|right)-(open|close)/
    );
  });

  it('deliberate red: identical open and closed art', () => {
    const family = clone();
    family.RailLeftOpen = family.RailLeftClosed;
    expect(familyViolations(family)).toContain('left:states-identical');
  });

  it('deliberate red: a right side that is not the mirror of the left', () => {
    const family = clone();
    family.RailRightOpen = family.RailLeftOpen;
    expect(familyViolations(family)).toContain('open:right-not-mirror');
  });

  it('deliberate red: the legacy arrow-bearing panel glyph', () => {
    const family = clone();
    // lucide PanelLeftClose: frame, divider and a left-pointing chevron.
    family.RailLeftOpen = [
      ...family.RailLeftClosed,
      ['path', { d: 'm16 15-3-3 3-3', key: 'chevron' }],
    ];
    family.RailRightOpen = mirrorRailNode(family.RailLeftOpen);
    expect(familyViolations(family)).toContain('RailLeftOpen:arrow-path');
  });
});
