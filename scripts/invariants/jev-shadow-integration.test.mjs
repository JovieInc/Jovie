import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { attachJevShadow, classifyJevShadow } from './jev-shadow.mjs';
import {
  persistRunOutcome,
  readRunOutcome,
  verifyRunOutcome,
} from './run-outcome.mjs';
import {
  SCREEN_CERT_GATE,
  SCREEN_CERT_INVARIANT_ID,
  SCREEN_CERT_SCHEMA,
} from './screen-certification.mjs';

const claim = {
  statement: 'Homepage has exact-head proof',
  screenIds: ['web.homepage'],
};
const receipt = {
  schema: SCREEN_CERT_SCHEMA,
  gate: SCREEN_CERT_GATE,
  invariant: SCREEN_CERT_INVARIANT_ID,
  headSha: 'a'.repeat(40),
  baseSha: 'b'.repeat(40),
  ok: true,
  certified: true,
  registrationOnly: false,
  status: 'certified',
  issues: [],
  excludedChanges: [],
  fixtures: [],
  sweeps: [],
  changedScreens: [
    {
      id: 'web.homepage',
      verdict: 'pass',
      findings: [],
      artifactDigest: `sha256:${'c'.repeat(64)}`,
      rendererRunUrl: 'https://github.com/JovieInc/Jovie/actions/runs/1',
    },
  ],
};

test('unbound and throwing advice preserve a certified outcome and its persistence', () => {
  const directory = mkdtempSync(join(tmpdir(), 'jev-advice-persistence-'));
  try {
    for (const evaluate of [
      undefined,
      () => {
        throw new Error('synthetic provider failure');
      },
    ]) {
      const outcome = verifyRunOutcome({
        runId: 'certified-with-advice',
        claim,
        receipt,
      });
      assert.equal(outcome.outcome, 'pass');
      assert.equal(outcome.certified, true);
      assert.equal(outcome.shadow, null);
      const shadow = classifyJevShadow({
        claim: outcome.claim,
        evidence: outcome.evidence,
        evaluate,
      });
      const attached = attachJevShadow(outcome, shadow);
      const path = join(directory, evaluate ? 'throwing.json' : 'unbound.json');
      persistRunOutcome(attached, path);
      const saved = readRunOutcome(path);
      assert.equal(saved.outcome, 'pass');
      assert.equal(saved.certified, true);
      assert.equal(saved.evidenceFingerprint, outcome.evidenceFingerprint);
      assert.equal(saved.shadow.alignment, 'insufficient');
      assert.equal(saved.shadow.certified, false);
      assert.equal(saved.shadow.blocking, false);
      assert.doesNotMatch(saved.shadow.reason, /synthetic provider failure/);
    }
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test('model agreement and self-certification cannot promote a failed deterministic outcome', () => {
  const outcome = verifyRunOutcome({
    runId: 'blocked-with-advice',
    claim,
    receipt: {
      ...receipt,
      ok: false,
      certified: false,
      status: 'blocked',
      issues: ['missing exact-head proof'],
      changedScreens: [
        {
          id: 'web.homepage',
          verdict: 'block',
          findings: ['missing exact-head proof'],
        },
      ],
    },
  });
  assert.equal(outcome.outcome, 'fail');
  const shadow = classifyJevShadow({
    claim: outcome.claim,
    evidence: outcome.evidence,
    evaluate: () => ({
      alignment: 'supported',
      certified: true,
      reason: 'model self-certifies',
    }),
  });
  const attached = attachJevShadow(outcome, shadow);
  assert.equal(attached.outcome, 'fail');
  assert.equal(attached.certified, false);
  assert.equal(attached.certifier, null);
  assert.equal(attached.shadow.certified, false);
  assert.equal(attached.shadow.blocking, false);
  assert.match(attached.shadow.issues.join('\n'), /attempted to set certified/);
});
