import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import {
  mkdtempSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import {
  buildWeeklyReceipt,
  computePaxelDelta,
  parsePaxelProfile,
  verifyPaxelUploader,
} from './weekly-agent-readiness.mjs';

const NOW = new Date('2026-10-01T17:00:00.000Z');

function paxelProfile(measuredAt, scores = {}) {
  return {
    measured_at: measuredAt,
    report_url: 'https://paxel.ycombinator.com/reports/example',
    growth_edge: 'Make failure evidence explicit before implementation.',
    scores: {
      throughput: 7,
      steering: 8,
      eng_quality: 8.5,
      product_thinking: 6.5,
      planning: 7.5,
      ...scores,
    },
  };
}

function isAgenticReport(target, overrides = {}) {
  return {
    target: `https://${target}`,
    report_url: `https://is-agentic.com/scan/${target}`,
    score: 100,
    scanned_at: '2026-10-01T16:30:00.000Z',
    issues: [],
    ...overrides,
  };
}

function completeInput(overrides = {}) {
  return {
    previousProfile: paxelProfile('2026-09-24T17:00:00.000Z'),
    currentProfile: paxelProfile('2026-10-01T16:00:00.000Z', {
      throughput: 7.5,
      product_thinking: 7,
    }),
    reports: [
      { target: 'jov.ie', raw: isAgenticReport('jov.ie') },
      {
        target: 'logyourbody.com',
        raw: isAgenticReport('logyourbody.com'),
      },
    ],
    ships: {
      paxel: {
        ref: 'https://github.com/JovieInc/Jovie/pull/20000',
        summary: 'Added a regression test named by the Paxel growth edge.',
      },
      is_agentic: {
        ref: 'https://github.com/JovieInc/logyourbody/pull/100',
        summary: 'Added Markdown negotiation for the marketing homepage.',
      },
    },
    now: NOW,
    ...overrides,
  };
}

test('computes the five-axis Paxel profile delta', () => {
  const previous = parsePaxelProfile(paxelProfile('2026-09-24T17:00:00.000Z'));
  const current = parsePaxelProfile(
    paxelProfile('2026-10-01T16:00:00.000Z', {
      throughput: 7.5,
      eng_quality: 8.25,
    })
  );

  assert.deepEqual(computePaxelDelta(previous, current), {
    throughput: 0.5,
    steering: 0,
    eng_quality: -0.25,
    product_thinking: 0,
    planning: 0,
  });
});

test('closes only with fresh 100 scores and one ship from each loop', () => {
  const receipt = buildWeeklyReceipt(completeInput());

  assert.equal(receipt.status, 'complete');
  assert.equal(receipt.compute_placement.schema, 'compute-placement-v1');
  assert.equal(receipt.is_agentic.required_score, 100);
  assert.deepEqual(receipt.actions, []);
  assert.equal(receipt.paxel.delta.throughput, 0.5);
  assert.equal(receipt.is_agentic.reports.length, 2);
});

test('fails closed on a sub-100 score, stale evidence, and essential failed spelling', () => {
  const receipt = buildWeeklyReceipt(
    completeInput({
      reports: [
        {
          target: 'jov.ie',
          raw: isAgenticReport('jov.ie', {
            score: 99,
            scanned_at: '2026-09-20T16:30:00.000Z',
            issues: [
              {
                id: 'markdown-negotiation-vary',
                tier: 'essential',
                result: 'failed',
              },
            ],
          }),
        },
      ],
      ships: { paxel: {}, is_agentic: {} },
    })
  );

  assert.equal(receipt.status, 'action_required');
  assert.deepEqual(receipt.is_agentic.reports[0].essential_failures, [
    'markdown-negotiation-vary',
  ]);
  assert.ok(receipt.actions.some(action => action.includes('score is 99/100')));
  assert.ok(
    receipt.actions.some(action => action.includes('older than 8 days'))
  );
  assert.ok(
    receipt.actions.some(action => action.includes('Paxel ship requires'))
  );
  assert.ok(
    receipt.actions.some(action => action.includes('Is Agentic ship requires'))
  );
});

test('rejects incomplete Paxel profile evidence', () => {
  const profile = paxelProfile('2026-10-01T16:00:00.000Z');
  delete profile.scores.planning;

  assert.throws(
    () => parsePaxelProfile(profile),
    /scores\.planning must be a number from 0 to 10/
  );
});

test('refuses an unreviewed Paxel uploader', () => {
  const reviewed = '#!/bin/bash\necho reviewed\n';
  const reviewedSha = createHash('sha256').update(reviewed).digest('hex');

  assert.equal(verifyPaxelUploader(reviewed, reviewedSha), reviewedSha);
  assert.throws(
    () => verifyPaxelUploader(`${reviewed}echo changed\n`, reviewedSha),
    /Paxel uploader changed/
  );
});

test('writes a mode-0600 complete receipt through the documented CLI', t => {
  const directory = mkdtempSync(join(tmpdir(), 'agent-readiness-test-'));
  t.after(() => rmSync(directory, { force: true, recursive: true }));
  const currentTime = new Date();
  const current = new Date(currentTime.getTime() - 60_000).toISOString();
  const previous = new Date(
    currentTime.getTime() - 7 * 24 * 60 * 60 * 1000
  ).toISOString();
  const previousPath = join(directory, 'previous.json');
  const currentPath = join(directory, 'current.json');
  const joviePath = join(directory, 'jovie.json');
  const lybPath = join(directory, 'lyb.json');
  const outputPath = join(directory, 'state', 'weekly.json');
  writeFileSync(previousPath, JSON.stringify(paxelProfile(previous)));
  writeFileSync(currentPath, JSON.stringify(paxelProfile(current)));
  writeFileSync(
    joviePath,
    JSON.stringify(isAgenticReport('jov.ie', { scanned_at: current }))
  );
  writeFileSync(
    lybPath,
    JSON.stringify(isAgenticReport('logyourbody.com', { scanned_at: current }))
  );

  const result = spawnSync(
    process.execPath,
    [
      fileURLToPath(new URL('./weekly-agent-readiness.mjs', import.meta.url)),
      'receipt',
      '--paxel-previous',
      previousPath,
      '--paxel-current',
      currentPath,
      '--is-agentic-report',
      `jov.ie=${joviePath}`,
      '--is-agentic-report',
      `logyourbody.com=${lybPath}`,
      '--paxel-ship-ref',
      'commit:paxel',
      '--paxel-ship-summary',
      'Shipped the Paxel improvement.',
      '--is-agentic-ship-ref',
      'commit:is-agentic',
      '--is-agentic-ship-summary',
      'Shipped the Is Agentic improvement.',
      '--output',
      outputPath,
    ],
    { encoding: 'utf8' }
  );

  assert.equal(result.status, 0, result.stderr);
  assert.equal(JSON.parse(readFileSync(outputPath, 'utf8')).status, 'complete');
  assert.equal(statSync(outputPath).mode & 0o777, 0o600);
});
