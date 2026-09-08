import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

const RUNBOOK_PATH = resolve(
  process.cwd(),
  'scripts/symphony/runbooks/merge-queue-fleet-gate-recovery.md'
);

const REQUIRED_SECTIONS = [
  'Safe stop',
  'Inspect current state',
  'Quarantine',
  'Replay or resume',
  'Reconcile',
  'Restore',
  'Verify recovery',
  'Communicate',
  'Audit trail',
  'Runbook freshness',
];

const SHA = 'a3eeefdd4dc681d1c9b5b4385720d661f5129137';

function nowIso() {
  return new Date().toISOString();
}

function hexDigest(seed: number) {
  return seed.toString(16).padStart(64, '0');
}

function capacityEvidence(target = 4) {
  const observedAt = nowIso();
  return {
    schema: 'gem-concurrency-evidence/v1' as const,
    source: 'execution-proven-useful-turns' as const,
    target,
    approved: true,
    severeIncidents: 0,
    observedAt,
    acceptedEvidence: Array.from({ length: target }, (_, index) => ({
      schema: 'symphony-useful-turn-proof/v1' as const,
      provider: 'openai',
      profile: `profile-${index + 1}`,
      model: 'gpt-5.6-sol',
      rc: 0,
      useful: true,
      completedAt: observedAt,
      outputDigest: hexDigest(index + 1),
      outputBytes: 32,
      outputTokens: 8,
    })),
  };
}

function signals() {
  const observedAt = nowIso();
  return {
    main: { status: 'green' as const, sha: SHA },
    production: { status: 'green' as const, deployedSha: SHA },
    controller: { status: 'green' as const },
    integrity: { status: 'clear' as const },
    queue: {
      repository: 'JovieInc/Jovie',
      status: 'known' as const,
      eligiblePrs: 0,
      greenReadyPrs: 0,
      target: 15,
      laneCapacity: {
        schema: 'jovie-lane-capacity/v2' as const,
        observedAt,
        repositories: { 'JovieInc/Jovie': { ready: 0, budget: 15 } },
        defaultLaneBudget: 4,
        lanes: {},
        sharedResources: {},
      },
    },
    closureHealth: {
      schema: 'jovie-closure-health/v1' as const,
      repository: 'JovieInc/Jovie',
      status: 'healthy' as const,
      authority: 'Summer',
      newIssueIntakeAllowed: true,
      promotionContinues: true,
      remediationContinues: true,
      reasons: [],
    },
    independentReview: {
      schema: 'jovie-independent-review/v1' as const,
      status: 'passed' as const,
      authority: 'Gem',
      reviewer: 'Gem',
      reviewId: 'review-wrapper',
      headSha: SHA,
      scope: 'exact-main-head',
      observedAt,
      accepted: true,
    },
    concurrencyEvidence: capacityEvidence(),
  };
}

describe('merge-queue / fleet-gate recovery runbook', () => {
  it('exists and contains the required recovery sections', () => {
    const runbook = readFileSync(RUNBOOK_PATH, 'utf8');
    for (const section of REQUIRED_SECTIONS) {
      expect(runbook).toContain(section);
    }
  });

  it('references only repo-relative paths that exist', () => {
    const runbook = readFileSync(RUNBOOK_PATH, 'utf8');
    const matches = [
      ...runbook.matchAll(
        /(?:^|[\s`'"(])scripts\/symphony\/[\w./-]+(?:\.\w+)?/gm
      ),
    ];

    expect(matches.length).toBeGreaterThan(0);

    for (const match of matches) {
      const referencedPath = match[0].trim();
      const trimmedPath = referencedPath.replace(/^[\s`'"(]+/, '');
      const absolutePath = resolve(process.cwd(), trimmedPath);
      expect
        .soft(absolutePath, `runbook references missing path: ${trimmedPath}`)
        .toBeTruthy();
      if (trimmedPath.includes('.')) {
        expect
          .soft(
            require('node:fs').existsSync(absolutePath),
            `runbook references missing file: ${trimmedPath}`
          )
          .toBe(true);
      }
    }
  });

  it('proves the fleet-gate evaluate wrapper emits a bounded GREEN receipt', () => {
    const tmpDir = mkdtempSync(resolve(tmpdir(), 'fleet-gate-test-'));
    const receiptPath = resolve(tmpDir, 'receipt.json');
    const outputPath = resolve(tmpDir, 'github-output');

    const env = {
      ...process.env,
      FLEET_GATE_EVALUATE_JSON: JSON.stringify(signals()),
      FLEET_GATE_DRY_RUN: '1',
      FLEET_GATE_CONSUMER: 'fleet',
      FLEET_GATE_RECEIPT: receiptPath,
      GITHUB_OUTPUT: outputPath,
    };

    execFileSync('bash', ['scripts/symphony/evaluate-fleet-gate.sh'], {
      cwd: process.cwd(),
      env,
      stdio: 'pipe',
    });

    const receipt = JSON.parse(readFileSync(receiptPath, 'utf8'));
    expect(receipt.schema).toBe('jovie-fleet-gate/v1');
    expect(receipt.state).toBe('GREEN');
    expect(receipt.promotionMode).toBe('normal');
    expect(receipt.workAdmission.allowed).toBe(true);
    expect(receipt.promotionAdmission.allowed).toBe(true);

    const outputs = Object.fromEntries(
      readFileSync(outputPath, 'utf8')
        .trim()
        .split('\n')
        .map(line => line.split('='))
    );
    expect(outputs.mode).toBe('normal');
    expect(outputs.state).toBe('GREEN');
    expect(outputs.work_allowed).toBe('true');
    expect(outputs.promotion_allowed).toBe('true');
    expect(outputs.receipt_b64).toBeTruthy();
    expect(Buffer.from(outputs.receipt_b64, 'base64').length).toBeLessThan(
      32_768
    );
  });
});
