import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const REPO_ROOT = resolve(import.meta.dirname, '..', '..', '..');
const WORKFLOW = readFileSync(
  resolve(REPO_ROOT, '.github/workflows/golden-path-prod-autofix.yml'),
  'utf8'
);
const CI_WORKFLOW = readFileSync(
  resolve(REPO_ROOT, '.github/workflows/ci.yml'),
  'utf8'
);

describe('Golden Path prod autofix workflow contract', () => {
  it('is event-driven off Production Controller, not a cron', () => {
    expect(WORKFLOW).toContain('workflows: [Production Controller]');
    expect(WORKFLOW).toContain('types: [completed]');
    expect(WORKFLOW).not.toMatch(/^\s*schedule:/m);
    expect(WORKFLOW).not.toContain('cron:');
  });

  it('probes live jov.ie without signup secrets and fails closed without Cursor', () => {
    expect(WORKFLOW).toContain('node scripts/golden-path-lock.mjs prod-probe');
    expect(WORKFLOW).toContain('--origin https://jov.ie');
    expect(WORKFLOW).toContain('node scripts/golden-path-lock.mjs autofix');
    expect(WORKFLOW).toContain('secrets.CURSOR_API_KEY');
    expect(WORKFLOW).toContain(
      'CURSOR_API_KEY is missing. Detect without a ship lock is a hole.'
    );
    expect(WORKFLOW).not.toContain('E2E_PROD');
    expect(WORKFLOW).not.toContain(
      'continue-on-error: true\n        run: |\n          set -euo pipefail\n          mkdir -p /tmp/golden-path-lock\n          node scripts/golden-path-lock.mjs autofix'
    );
  });

  it('does not live inside the read-only post-deploy probe workflow', () => {
    const postdeploy = readFileSync(
      resolve(REPO_ROOT, '.github/workflows/postdeploy-probes.yml'),
      'utf8'
    );
    expect(postdeploy).toContain('Read-only evidence');
    expect(postdeploy).not.toContain('golden-path-lock.mjs');
    expect(postdeploy).not.toContain('CURSOR_API_KEY');
  });
});

describe('Golden Path Lock merge-gate contract', () => {
  it('fans the cheap lock into both PR Ready aggregates', () => {
    expect(CI_WORKFLOW).toContain('  ci-golden-path-lock:');
    expect(CI_WORKFLOW).toContain('name: Golden Path Lock');
    expect(CI_WORKFLOW).toContain(
      'needs: [ci-path-changes, ci-risk-classifier, ci-fast, ci-secret-scan, ci-golden-path-lock]'
    );
    expect(CI_WORKFLOW).toContain('ci-golden-path-lock,');
    expect(CI_WORKFLOW).toContain(
      'node scripts/golden-path-lock.mjs merge-gate'
    );
    const lockStart = CI_WORKFLOW.indexOf('  ci-golden-path-lock:');
    const lockEnd = CI_WORKFLOW.indexOf('\n  ci-fast-typecheck:', lockStart);
    const lockJob = CI_WORKFLOW.slice(lockStart, lockEnd);
    expect(lockJob).toContain('node scripts/golden-path-lock.mjs merge-gate');
    expect(lockJob).not.toMatch(/secrets\.[A-Z0-9_]+/);
  });
});
