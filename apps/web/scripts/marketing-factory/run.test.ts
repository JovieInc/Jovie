import { existsSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { loadFactoryBrief } from './brief';
import {
  dryProviders,
  FIXTURE_PASS_VERDICT,
  fixtureTransport,
  liveProviders,
} from './providers';
import {
  readJson,
  type StageAttemptRecord,
  verifyFactoryRun,
} from './receipts';
import { runFactory } from './run';
import { FACTORY_STAGE_RUNNERS } from './stages';
import { CONTENT_STAGE_RUNNERS } from './stages-content';

const PAGE_ID = 'solutions-founders';
const brief = loadFactoryBrief('solutions', 'founders');
const dryCopy = brief.dry?.copy as { slots: { text: string }[] };

let runsDir: string;
const runDir = () => join(runsDir, PAGE_ID);
const record = (file: string) =>
  readJson<StageAttemptRecord>(join(runDir(), file));

function run(options: Partial<Parameters<typeof runFactory>[0]> = {}) {
  return runFactory({
    family: 'solutions',
    slug: 'founders',
    dry: true,
    runsDir,
    runners: CONTENT_STAGE_RUNNERS,
    ...options,
  });
}

/** Dry providers whose copywriter writes an em dash until told not to. */
function copyProviders(input: { fixOnFeedback: boolean }) {
  return dryProviders(brief, {
    async generate(request) {
      if (request.stage !== 'copy') {
        return { status: 'ok', value: brief.dry?.[request.stage] };
      }
      const fixed =
        input.fixOnFeedback && request.feedback.includes('copy-no-em-dash');
      const slots = dryCopy.slots.map((slot, index) =>
        index === 0 && !fixed ? { ...slot, text: `${slot.text} — now` } : slot
      );
      return { status: 'ok', value: { slots } };
    },
  });
}

beforeEach(() => {
  runsDir = mkdtempSync(join(tmpdir(), 'factory-run-'));
});

afterEach(() => {
  rmSync(runsDir, { recursive: true, force: true });
});

describe('factory:run content stages', () => {
  it('passes truth through gap detection and stops where no runner exists', async () => {
    const manifest = await run();

    expect(manifest).toMatchObject({
      status: 'incomplete',
      stoppedAt: 'media-decision',
      mode: 'dry',
    });
    expect(manifest.chain.map(link => link.stage)).toEqual([
      'truth',
      'outcomes',
      'narrative',
      'copy',
      'layout',
      'hero-variant',
      'proof',
      'gap-detection',
    ]);
    expect(verifyFactoryRun(runDir())).toEqual([]);

    const copy = record('04-copy.attempt-1.json').receipt;
    expect(copy.producer).toMatchObject({
      modelId: 'fixture:anthropic/claude-opus-5.5',
      family: 'anthropic',
    });
    expect(copy.evaluators.map(e => e.family)).toEqual(['openai', 'zai']);
    expect(record('06-hero-variant.attempt-1.json').artifact).toMatchObject({
      variantId: 'xm2iz',
      headerId: 'eoUUU',
    });
    expect(record('07-proof.attempt-1.json').artifact).toMatchObject({
      items: [{ registryId: 'product-profile-subscribe-capture' }],
      requests: [],
    });
  });

  it('fails truth when the brief names a claim product truth does not hold', async () => {
    const manifest = await run({
      brief: { ...brief, claimIds: ['offer.free.price', 'made.up.claim'] },
    });

    expect(manifest).toMatchObject({ status: 'failed', stoppedAt: 'truth' });
    expect(record('01-truth.attempt-2.json').feedbackIn).toContain(
      'claim-resolves:made.up.claim'
    );
  });
});

describe('stage retries', () => {
  it('feeds failures into the next attempt and passes once fixed', async () => {
    const manifest = await run({
      providers: copyProviders({ fixOnFeedback: true }),
    });

    expect(manifest.chain.find(link => link.stage === 'copy')?.attempt).toBe(2);
    expect(record('04-copy.attempt-1.json').receipt.passed).toBe(false);
    expect(record('04-copy.attempt-2.json').feedbackIn).toContain(
      'copy-no-em-dash'
    );
    expect(verifyFactoryRun(runDir())).toEqual([]);
  });

  it('stops after three failed attempts and runs no later stage', async () => {
    const manifest = await run({
      providers: copyProviders({ fixOnFeedback: false }),
    });

    expect(manifest).toMatchObject({ status: 'failed', stoppedAt: 'copy' });
    expect(manifest.attempts.filter(file => file.includes('-copy.'))).toEqual([
      '04-copy.attempt-1.json',
      '04-copy.attempt-2.json',
      '04-copy.attempt-3.json',
    ]);
    expect(existsSync(join(runDir(), '05-layout.attempt-1.json'))).toBe(false);
    expect(manifest.chain.map(link => link.stage)).toEqual([
      'truth',
      'outcomes',
      'narrative',
    ]);
  });

  it('records stage errors as a failed invariant instead of crashing', async () => {
    const manifest = await run({
      runners: {
        ...FACTORY_STAGE_RUNNERS,
        layout: async () => {
          throw new Error('resolver exploded');
        },
      },
    });

    expect(manifest).toMatchObject({ status: 'failed', stoppedAt: 'layout' });
    expect(record('05-layout.attempt-3.json').feedbackIn).toContain(
      'stage-error: resolver exploded'
    );
  });
});

describe('harness rules', () => {
  it('rejects self-review even when the judge selection is wrong', async () => {
    const manifest = await run({
      providers: dryProviders(brief, {
        selectJudges: () => ['anthropic/claude-opus-5.5', 'openai/gpt-5.5'],
      }),
    });

    expect(manifest).toMatchObject({ status: 'failed', stoppedAt: 'outcomes' });
    const outcomes = record('02-outcomes.attempt-3.json').receipt;
    expect(outcomes.passed).toBe(false);
    expect(outcomes.invariantsFailed).toContain('cross-family-evaluator');
  });

  it('fails a stage when a judge asks for a revision', async () => {
    const manifest = await run({
      providers: dryProviders(brief, {
        transport: fixtureTransport(({ prompt }) =>
          JSON.stringify({
            score: 0.2,
            verdict: prompt.includes('"outcomes"') ? 'revise' : 'pass',
            critique: ['name the outcome'],
          })
        ),
      }),
    });

    expect(manifest).toMatchObject({ status: 'failed', stoppedAt: 'outcomes' });
    expect(record('02-outcomes.attempt-2.json').feedbackIn).toContain(
      'name the outcome'
    );
  });

  it('clamps out-of-range copy judge scores into the receipt range', async () => {
    const manifest = await run({
      providers: dryProviders(brief, {
        transport: fixtureTransport(() =>
          FIXTURE_PASS_VERDICT.replaceAll(/":9\b/g, '":12')
        ),
      }),
    });

    expect(manifest.chain.map(link => link.stage)).toContain('copy');
    const copy = record('04-copy.attempt-1.json').receipt;
    expect(copy.evaluators.every(e => e.score <= 1)).toBe(true);
  });

  it('reports credentials-unavailable instead of passing without models', async () => {
    const manifest = await run({ providers: liveProviders(null) });

    expect(manifest).toMatchObject({
      status: 'credentials-unavailable',
      stoppedAt: 'outcomes',
      mode: 'live',
    });
    const receipt = record('02-outcomes.attempt-1.json').receipt;
    expect(receipt.passed).toBe(false);
    expect(receipt.invariantsFailed).toContain('credentials-unavailable');
  });

  it('treats an unseated copy panel as credentials-unavailable', async () => {
    const manifest = await run({
      providers: dryProviders(brief, {
        transport: Object.assign(fixtureTransport(), {
          available: (model: string) => !model.startsWith('zai/'),
        }),
      }),
    });

    expect(manifest).toMatchObject({
      status: 'credentials-unavailable',
      stoppedAt: 'outcomes',
    });
    expect(manifest.reason).toMatch(/needs 2 cross-family judge/);
  });

  it('refuses --from-stage when the brief changed or earlier stages are missing', async () => {
    await run();

    await expect(run({ fromStage: 'layout' })).resolves.toMatchObject({
      status: 'incomplete',
    });
    await expect(
      run({ brief: { ...brief, icp: 'Someone else' }, fromStage: 'layout' })
    ).rejects.toThrow(/brief changed/);
    await expect(run({ fromStage: 'asset' })).rejects.toThrow(
      /earlier stages have not passed/
    );
  });
});
