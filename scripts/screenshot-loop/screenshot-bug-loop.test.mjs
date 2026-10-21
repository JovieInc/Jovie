import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import {
  bugFingerprint,
  defaultVisionProviders,
  listScreenshotEvents,
  loadLedger,
  processScreenshot,
  sweepOnce,
  watchDirs,
} from './screenshot-bug-loop.mjs';

const PNG_BYTES = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64'
);

function fixtureDir() {
  return mkdtempSync(join(tmpdir(), 'screenshot-loop-'));
}

function writeShot(dir, name, bytes = PNG_BYTES) {
  const path = join(dir, name);
  writeFileSync(path, bytes);
  return path;
}

function visionProvider({
  classify = undefined,
  analyze = undefined,
  name = 'fake-vision',
  ok = true,
} = {}) {
  return {
    name,
    available: () => true,
    async analyze(_path, prompt) {
      if (!ok) return { ok: false, reason: 'rate_limited' };
      const isClassify = prompt.includes('classify');
      return {
        ok: true,
        text: JSON.stringify(isClassify ? classify : analyze),
      };
    },
  };
}

function fakeIntake(calls) {
  return async args => {
    calls.push(args);
    return { ok: true, action: 'created', id: 'id-1', identifier: 'JOV-1' };
  };
}

/** @param {any} extra */
function deps(extra) {
  return { now: () => '2026-10-12T00:00:00.000Z', env: {}, ...extra };
}

test('product screenshot is classified, analyzed and filed as one issue', async () => {
  const dir = fixtureDir();
  try {
    const shot = writeShot(dir, 'Screenshot 2026-10-12 at 9.00.00.png');
    const [entry] = listScreenshotEvents(dir);
    const intakeCalls = [];
    const receipt = await processScreenshot(
      deps({
        entry,
        ledgerPath: join(dir, 'events.jsonl'),
        providers: [
          visionProvider({
            classify: {
              surface: 'jovie-product',
              product: 'jovie',
              summary: 'dashboard',
            },
            analyze: {
              title: 'Play button overlaps progress bar',
              symptoms: 'overlap',
              repro: 'open release page',
              severity: 'P1',
            },
          }),
        ],
        intake: fakeIntake(intakeCalls),
      })
    );
    assert.equal(receipt.status, 'filed');
    assert.equal(/** @type {any} */ (receipt).issue, 'JOV-1');
    assert.equal(receipt.stages.verify.status, 'chain-verified');
    assert.equal(intakeCalls.length, 1);
    assert.equal(
      intakeCalls[0].fingerprint,
      bugFingerprint(readFileSync(shot))
    );
    assert.match(intakeCalls[0].title, /^Screenshot bug: /);
    assert.equal(intakeCalls[0].priority, 2);
    // Evidence is linked by hash, not by file path or image content.
    assert.match(intakeCalls[0].description, /Evidence-Key: screenshot-/);
    assert.ok(!intakeCalls[0].description.includes(dir));
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('personal screenshot stays silent — no issue is filed', async () => {
  const dir = fixtureDir();
  try {
    writeShot(dir, 'Screenshot 2026-10-12 at 9.01.00.png');
    const [entry] = listScreenshotEvents(dir);
    const intakeCalls = [];
    const receipt = await processScreenshot(
      deps({
        entry,
        ledgerPath: join(dir, 'events.jsonl'),
        providers: [
          visionProvider({
            classify: {
              surface: 'personal',
              product: null,
              summary: 'family photo',
            },
          }),
        ],
        intake: fakeIntake(intakeCalls),
      })
    );
    assert.equal(receipt.status, 'ignored-personal');
    assert.equal(intakeCalls.length, 0);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('duplicate capture dedupes across sweeps without refiling', async () => {
  const dir = fixtureDir();
  try {
    writeShot(dir, 'Screenshot 2026-10-12 at 9.02.00.png');
    const intakeCalls = [];
    const providers = [
      visionProvider({
        classify: {
          surface: 'jovie-product',
          product: 'jovie',
          summary: 'bug',
        },
        analyze: { title: 'broken', severity: 'P2' },
      }),
    ];
    const ledgerPath = join(dir, 'events.jsonl');
    const first = await sweepOnce(
      deps({
        dirs: [dir],
        ledgerPath,
        providers,
        intake: fakeIntake(intakeCalls),
      })
    );
    const second = await sweepOnce(
      deps({
        dirs: [dir],
        ledgerPath,
        providers,
        intake: fakeIntake(intakeCalls),
      })
    );
    assert.equal(first[0].status, 'filed');
    assert.equal(second[0].status, 'deduplicated-sweep');
    assert.equal(intakeCalls.length, 1);
    const ledger = loadLedger(ledgerPath);
    assert.equal(ledger.size, 1);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('all vision providers unavailable fails closed with a receipt and retries', async () => {
  const dir = fixtureDir();
  try {
    writeShot(dir, 'Screenshot 2026-10-12 at 9.03.00.png');
    const intakeCalls = [];
    const providers = [
      visionProvider({ name: 'primary', ok: false }),
      {
        name: 'unconfigured-fallback',
        available: () => false,
        analyze: async () => ({ ok: false }),
      },
    ];
    const ledgerPath = join(dir, 'events.jsonl');
    const first = await sweepOnce(
      deps({
        dirs: [dir],
        ledgerPath,
        providers,
        intake: fakeIntake(intakeCalls),
      })
    );
    assert.equal(first[0].status, 'provider-unavailable');
    assert.equal(first[0].retryable, true);
    assert.equal(first[0].stages.classify.status, 'failed-closed');
    assert.deepEqual(
      first[0].stages.classify.attempts.map(a => a.provider),
      ['primary', 'unconfigured-fallback']
    );
    assert.equal(intakeCalls.length, 0);
    // Non-terminal: a later sweep with a healthy provider retries and files.
    const healthy = [
      visionProvider({
        classify: { surface: 'jovie-product', product: 'lyb', summary: 'bug' },
        analyze: { title: 'still broken', severity: 'P0' },
      }),
    ];
    const second = await sweepOnce(
      deps({
        dirs: [dir],
        ledgerPath,
        providers: healthy,
        intake: fakeIntake(intakeCalls),
      })
    );
    assert.equal(second[0].status, 'filed');
    assert.equal(intakeCalls.length, 1);
    assert.equal(intakeCalls[0].priority, 1);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('watch dirs default to ~/Desktop and honor SCREENSHOT_WATCH_DIRS', () => {
  assert.deepEqual(watchDirs({}, '/home/tim'), ['/home/tim/Desktop']);
  assert.deepEqual(
    watchDirs({ SCREENSHOT_WATCH_DIRS: '~/Desktop,~/Pictures' }, '/home/tim'),
    ['/home/tim/Desktop', '/home/tim/Pictures']
  );
});

test('default vision route uses subscriptions even when legacy metered keys are configured', async () => {
  const dir = fixtureDir();
  try {
    const shot = writeShot(dir, 'shot.png');
    const calls = [];
    const providers = defaultVisionProviders(
      {
        ANTHROPIC_API_KEY: 'unused-test-key',
        AI_GATEWAY_API_KEY: 'unused-test-key',
      },
      async request => {
        calls.push(request);
        return JSON.stringify({ surface: 'personal', product: null });
      }
    );
    const [entry] = listScreenshotEvents(dir);
    const intakeCalls = [];
    const receipt = await processScreenshot(
      deps({
        entry,
        ledgerPath: join(dir, 'events.jsonl'),
        providers,
        intake: fakeIntake(intakeCalls),
      })
    );
    assert.equal(receipt.status, 'ignored-personal');
    assert.equal(intakeCalls.length, 0);
    assert.equal(calls.length, 1);
    assert.equal(calls[0].model, 'anthropic/claude-sonnet-5.5');
    assert.deepEqual(calls[0].images, [shot]);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('subscription vision fallback preserves bug analysis without a metered provider', async () => {
  const dir = fixtureDir();
  try {
    writeShot(dir, 'shot.png');
    const [entry] = listScreenshotEvents(dir);
    const models = [];
    const providers = defaultVisionProviders({}, async request => {
      models.push(request.model);
      if (request.model.startsWith('anthropic/'))
        throw new Error('subscription unavailable');
      return JSON.stringify(
        request.prompt.includes('classify')
          ? {
              surface: 'jovie-product',
              product: 'jovie',
              summary: 'release page',
            }
          : {
              title: 'Repair clipped play control',
              symptoms: 'clipped',
              repro: 'open release',
              severity: 'P2',
            }
      );
    });
    const intakeCalls = [];
    const receipt = await processScreenshot(
      deps({
        entry,
        ledgerPath: join(dir, 'events.jsonl'),
        providers,
        intake: fakeIntake(intakeCalls),
      })
    );
    assert.equal(receipt.status, 'filed');
    assert.equal(intakeCalls.length, 1);
    assert.deepEqual(models, [
      'anthropic/claude-sonnet-5.5',
      'openai/gpt-5.6-luna',
      'anthropic/claude-sonnet-5.5',
      'openai/gpt-5.6-luna',
    ]);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
