import { existsSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  FactoryEditorialPageBriefSchema,
  FactoryPageBriefSchema,
  loadFactoryBrief,
} from './brief';
import { dryProviders } from './providers';
import { runFactory } from './run';
import { FACTORY_STAGE_RUNNERS } from './stages';

const legacy = loadFactoryBrief('solutions', 'founders');
const editorial = {
  benefit: 'Find the next release action',
  focalDetail: 'One release inspector action',
  rationale: 'A focused capture explains the action',
  fallback: 'Retain the benefit without imagery',
  alternatives: [
    { medium: 'video' as const, reason: 'Motion adds no explanation' },
  ],
};
const authored = {
  ...legacy,
  media: legacy.media.map(entry => ({
    ...entry,
    input: { ...entry.input, editorial },
  })),
};
let runsDir: string;
beforeEach(() => {
  runsDir = mkdtempSync(join(tmpdir(), 'factory-editorial-'));
});
afterEach(() => {
  rmSync(runsDir, { recursive: true, force: true });
});

function run(brief = legacy, dry = false) {
  const providers = {
    ...dryProviders(brief),
    mode: dry ? ('dry' as const) : ('live' as const),
  };
  const truth = vi.fn(FACTORY_STAGE_RUNNERS.truth!);
  return {
    truth,
    promise: runFactory({
      family: brief.family,
      slug: brief.slug,
      brief,
      runsDir,
      providers,
      runners: { truth },
      allowPartial: true,
    }),
  };
}

describe('live editorial brief admission', () => {
  it('reads legacy artifacts but rejects live reuse before a stage or receipt is produced', async () => {
    expect(FactoryPageBriefSchema.parse(legacy).media).toEqual(legacy.media);
    const attempt = run();
    await expect(attempt.promise).rejects.toThrow(/editorial/);
    expect(attempt.truth).not.toHaveBeenCalled();
    expect(existsSync(join(runsDir, 'solutions-founders'))).toBe(false);
  });
  it('rejects absent or malformed rationale for any section', () => {
    expect(
      FactoryEditorialPageBriefSchema.safeParse({
        ...authored,
        media: [...authored.media, legacy.media[0]],
      }).success
    ).toBe(false);
    expect(
      FactoryEditorialPageBriefSchema.safeParse({
        ...authored,
        media: [
          {
            ...authored.media[0],
            input: {
              ...authored.media[0]!.input,
              editorial: { ...editorial, alternatives: [] },
            },
          },
        ],
      }).success
    ).toBe(false);
  });
  it('rejects whitespace-only intent instead of marking it authored', () => {
    expect(
      FactoryEditorialPageBriefSchema.safeParse({
        ...authored,
        media: [
          {
            ...authored.media[0],
            input: {
              ...authored.media[0]!.input,
              editorial: { ...editorial, rationale: '   ' },
            },
          },
        ],
      }).success
    ).toBe(false);
  });
  it('admits an authored live brief to the existing pipeline without qualifying its appearance', async () => {
    const attempt = run(authored);
    const manifest = await attempt.promise;
    expect(attempt.truth).toHaveBeenCalledOnce();
    expect(manifest.mode).toBe('live');
    expect(manifest.status).toBe('incomplete');
  });
  it('keeps old offline replays explicitly dry', async () => {
    const attempt = run(legacy, true);
    const manifest = await attempt.promise;
    expect(attempt.truth).toHaveBeenCalledOnce();
    expect(manifest.mode).toBe('dry');
    expect(manifest.status).toBe('incomplete');
  });
});
