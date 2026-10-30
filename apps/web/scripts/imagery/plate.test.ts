import { describe, expect, it } from 'vitest';
import { IMAGERY_STAGES } from '../../lib/imagery/stages';
import { buildPlatePrompt } from './prompt';
import { parsePlateArgs, selectPlates } from './select';
import { hashPlateSpec } from './spec-hash.mjs';

describe('imagery:plate', () => {
  it('requires --id or --stale and rejects unknown flags', () => {
    expect(() => parsePlateArgs([])).toThrow(/--id/);
    expect(() => parsePlateArgs(['--nope'])).toThrow(/Unknown/);
    expect(parsePlateArgs(['--id', 'x'])).toEqual({ id: 'x', stale: false });
    expect(parsePlateArgs(['--stale'])).toEqual({ id: null, stale: true });
  });

  it('selects missing and stale plates, skips fresh ones', () => {
    const [first, second] = IMAGERY_STAGES;
    const plates = {
      [first.plate.id]: { specHash: hashPlateSpec(first) },
      [second.plate.id]: { specHash: 'old' },
    } as never;
    expect(
      selectPlates({ id: null, stale: true }, { plates }).map(s => s.id)
    ).toEqual([second.id]);
    expect(() =>
      selectPlates({ id: 'nope', stale: false }, { plates })
    ).toThrow(/Unknown plate/);
  });

  it('changes the plate spec hash when the light moves', () => {
    const stage = IMAGERY_STAGES[0];
    const moved = { ...stage, light: { ...stage.light, spread: 0.5 } };
    expect(hashPlateSpec(moved)).not.toBe(hashPlateSpec(stage));
  });

  it('prompts name one hue and forbid text, people and music clichés', () => {
    for (const stage of IMAGERY_STAGES) {
      const prompt = buildPlatePrompt(stage);
      expect(prompt).toMatch(/One single hue only/);
      expect(prompt).toMatch(/No text/);
      expect(prompt).toMatch(/no people/);
      expect(prompt).toMatch(/microphones, no headphones, no stage, no crowd/);
      expect(prompt).toMatch(/Quiet zone/);
    }
  });
});
