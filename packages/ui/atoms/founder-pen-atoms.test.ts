import { describe, expect, it } from 'vitest';
import {
  BUTTON_PEN_CONTRACT,
  FOUNDER_PEN_ATOM_CONSUMERS,
  FOUNDER_PEN_ATOM_FAMILIES,
  FOUNDER_PEN_ATOM_IDS,
  ICON_BUTTON_PEN_CONTRACT,
} from '../index';

/**
 * JOV-5095: the skill-passed founder atom masters on
 * `Jovie Design Studio — canonical.pen` (live-canvas frontend-skill PASS,
 * 2026-08-14) are the single source of truth. This contract fails if any
 * family loses its verified root, gains a second master, or drifts from the
 * executable per-component contracts that consume it.
 */
describe('founder Pen atom contract (JOV-5095)', () => {
  it('maps every skill-passed family to its exact canonical Pen root', () => {
    expect(FOUNDER_PEN_ATOM_IDS).toEqual({
      palette: 'QFA71',
      surfaces: 'ovdxc',
      geometry: 'yxp2C',
      actionButton: 'g3IC1',
      iconButton: 'XYhft',
      statusControl: 'KOTod',
      overflow: 'OVLxQ',
      board: 'stD8g',
    });
    expect(FOUNDER_PEN_ATOM_FAMILIES).toHaveLength(8);
  });

  it('keeps a single master per family with no duplicate roots', () => {
    const roots = Object.values(FOUNDER_PEN_ATOM_IDS);
    expect(new Set(roots).size).toBe(roots.length);
  });

  it('aligns the executable component contracts with the founder masters', () => {
    expect(
      BUTTON_PEN_CONTRACT.rootByVariantKey['button/primary/lg/idle']
    ).toMatchObject({ rootId: FOUNDER_PEN_ATOM_IDS.actionButton });
    expect(ICON_BUTTON_PEN_CONTRACT.rootId).toBe(
      FOUNDER_PEN_ATOM_IDS.iconButton
    );
  });

  it('fails closed for families without a Jovie source consumer', () => {
    expect(FOUNDER_PEN_ATOM_CONSUMERS.statusControl).toBeNull();
    expect(FOUNDER_PEN_ATOM_CONSUMERS.board).toBeNull();
  });
});
