import { describe, expect, it } from 'vitest';
import {
  BUTTON_PEN_CONTRACT,
  FOUNDER_PEN_ATOM_CONSUMERS,
  FOUNDER_PEN_ATOM_FAMILIES,
  FOUNDER_PEN_ATOM_IDS,
  FOUNDER_PEN_VIDEO_ATOM_IDS,
  FOUNDER_PEN_VIDEO_SURFACE_CONSUMERS,
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

/**
 * JOV-5096: the seven skill-passed video atom masters (fit/contain) on the
 * durable `Jovie Design Studio — canonical.pen` save are the single source
 * of truth for product video/motion surfaces. This contract fails if a
 * locked root is dropped, renamed, duplicated, or collides with an atom
 * family master.
 */
describe('founder Pen video atom contract (JOV-5096)', () => {
  it('locks the seven fit/contain video masters in canonical order', () => {
    expect(FOUNDER_PEN_VIDEO_ATOM_IDS).toEqual([
      'nwLcB',
      'TJBDn',
      'iH2Mt',
      'vjFWM',
      'S1D4Bj',
      'EQ16R',
      'G5t8qZ',
    ]);
  });

  it('keeps a single master per surface with no duplicate or colliding roots', () => {
    expect(new Set(FOUNDER_PEN_VIDEO_ATOM_IDS).size).toBe(
      FOUNDER_PEN_VIDEO_ATOM_IDS.length
    );
    for (const root of FOUNDER_PEN_VIDEO_ATOM_IDS) {
      expect(Object.values(FOUNDER_PEN_ATOM_IDS)).not.toContain(root);
    }
  });

  it('binds the masters to the product video/motion surfaces', () => {
    expect(FOUNDER_PEN_VIDEO_SURFACE_CONSUMERS).toEqual([
      'apps/web/components/organisms/media-canvas/MediaCanvasViewer.tsx',
      'apps/web/components/features/demo/DemoVideoPlayer.tsx',
      'apps/web/components/features/demo/DemoVideoPage.tsx',
      'apps/web/components/features/pitch/InvestorBrief.tsx',
      'apps/web/components/features/admin/certifications/CertificationWalkthrough.tsx',
    ]);
  });
});
