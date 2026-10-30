import { describe, expect, it } from 'vitest';
import { IMAGERY_STAGES } from '../../lib/imagery/stages';
import { hashPlateSpec, hashStageSpec } from './spec-hash.mjs';
import {
  buildVerdict,
  geometryFindings,
  needsVerify,
  parseVerifyArgs,
} from './verify-core';

const stage = IMAGERY_STAGES[0];
const meta = { judge: 'j', model: 'm', at: 'now', imageHash: 'h' };

describe('geometry findings', () => {
  const ok = stage.layers.map(layer => ({
    shotId: layer.shotId,
    visible: true,
    box: { x: 0.45, y: 0.1, w: 0.2, h: 0.2 },
  }));

  it('is clean when layers render on stage and out of the quiet zone', () => {
    expect(geometryFindings(stage, 'desktop', ok)).toEqual([]);
  });

  it('fails a layer inside the quiet zone and one missing from the page', () => {
    const inZone = [
      { ...ok[0], box: { x: 0.1, y: 0.4, w: 0.1, h: 0.1 } },
      ok[1],
    ];
    expect(geometryFindings(stage, 'desktop', inZone)[0].detail).toMatch(
      /quiet zone/
    );
    const missing = geometryFindings(stage, 'desktop', [ok[0]]);
    expect(missing[0].detail).toMatch(/did not render/);
  });

  it('expects hidden mobile layers to be absent, and off-stage layers to fail', () => {
    const [back, front] = ok;
    expect(geometryFindings(stage, 'mobile', [front])).toEqual([]);
    const off = geometryFindings(stage, 'mobile', [
      { ...front, box: { x: 0.9, y: 0.1, w: 0.3, h: 0.2 } },
    ]);
    expect(off[0].detail).toMatch(/leaves the stage/);
    void back;
  });
});

describe('verdict', () => {
  it('passes with no blocker and fewer than two majors', () => {
    expect(buildVerdict([], meta).pass).toBe(true);
    expect(
      buildVerdict([{ source: 'a', severity: 'major', detail: 'x' }], meta).pass
    ).toBe(true);
    expect(
      buildVerdict(
        [
          { source: 'a', severity: 'major', detail: 'x' },
          { source: 'b', severity: 'major', detail: 'y' },
        ],
        meta
      ).pass
    ).toBe(false);
    expect(
      buildVerdict([{ source: 'a', severity: 'blocker', detail: 'x' }], meta)
        .findings[0]
    ).toBe('a blocker: x');
  });
});

describe('advisory findings', () => {
  it('records non-gating findings without failing the stage', () => {
    const verdict = buildVerdict(
      [
        { source: 'cold', severity: 'major', gate: false, detail: 'a' },
        { source: 'cold', severity: 'major', gate: false, detail: 'b' },
        { source: 'clef', severity: 'major', detail: 'c' },
      ],
      meta
    );
    expect(verdict.pass).toBe(true);
    expect(verdict.findings[0]).toBe('cold advisory: a');
  });
});

describe('args and staleness', () => {
  it('parses flags and rejects unknown ones', () => {
    expect(
      parseVerifyArgs(['--stale', '--no-judge', '--only', 'x'])
    ).toMatchObject({
      stale: true,
      judge: false,
      only: 'x',
    });
    expect(
      parseVerifyArgs([], { IMAGERY_BASE_URL: 'http://h:1/' }).baseUrl
    ).toBe('http://h:1');
    expect(() => parseVerifyArgs(['--x'])).toThrow(/Unknown/);
  });

  it('needs verify until spec, plate and both verdicts are current', () => {
    const shots = {} as Record<string, { sourceHash: string }>;
    const verdict = { pass: true, findings: [], ...meta };
    const manifest = {
      schema: 'jovie.imagery/v1',
      plates: { [stage.plate.id]: { specHash: hashPlateSpec(stage) } },
      stages: {
        [stage.id]: {
          specHash: hashStageSpec(stage, shots),
          verdicts: { desktop: verdict, mobile: verdict },
        },
      },
    } as never;
    expect(needsVerify(stage, manifest, shots)).toBe(false);
    expect(
      needsVerify(stage, manifest, {
        'setup-share-profile': { sourceHash: 'new' },
      })
    ).toBe(true);
    expect(needsVerify(IMAGERY_STAGES[1], manifest, shots)).toBe(true);
  });
});
