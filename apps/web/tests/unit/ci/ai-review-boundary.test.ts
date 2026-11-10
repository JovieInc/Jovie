import { execFileSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { tmpdir } from 'node:os';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

const testDir = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(testDir, '..', '..', '..', '..', '..');
const scanner = resolve(repoRoot, 'scripts/company-guards/ai-review-boundary.mjs');

const CLEAN_ADVISORY = `# Advisory AI review — comments only, never blocks a merge.
name: Advisory AI Review
on:
  workflow_run:
    workflows: ['CI']
    types: [completed]
jobs:
  review:
    steps:
      - run: node .github/scripts/advisory-ai-review.mjs
`;

const WARDEN_BLOCKING = `name: Warden
on: [pull_request]
permissions:
  pull-requests: write
jobs:
  review:
    steps:
      - run: gh pr review $PR --request-changes --body "$VERDICT"
      - run: warden --fail-on findings "$PR"
`;

const SEER_FAILCHECK = `name: Sentry Seer code review
on: [pull_request]
jobs:
  review:
    steps:
      - run: exit 1 # failCheck on findings
      - run: echo posting a failing check run for the PR head
`;

let tmp;

function writeWorkflow(name, content) {
  mkdirSync(resolve(tmp, '.github/workflows'), { recursive: true });
  writeFileSync(resolve(tmp, '.github/workflows', name), content);
}

function runScanner(root) {
  return execFileSync('node', [scanner, '--root', root], { encoding: 'utf8' });
}

function runScannerExpectFailure(root) {
  try {
    execFileSync('node', [scanner, '--root', root], { encoding: 'utf8', stdio: 'pipe' });
  } catch (error) {
    return error;
  }
  return null;
}

beforeAll(() => {
  tmp = mkdtempSync(resolve(tmpdir(), 'ai-review-boundary-'));
});

afterAll(() => {
  rmSync(tmp, { recursive: true, force: true });
});

describe('ai-review boundary scanner', () => {
  it('passes an advisory, comment-only AI reviewer', () => {
    writeWorkflow('advisory.yml', CLEAN_ADVISORY);
    expect(runScanner(tmp)).toContain('ai-review-boundary: ok');
  });

  it('fails a Warden-style review that requests changes', () => {
    writeWorkflow('warden.yml', WARDEN_BLOCKING);
    const error = runScannerExpectFailure(tmp);
    expect(error).not.toBeNull();
    expect(error.stderr).toContain('warden.yml');
    expect(error.stderr).toContain('request-changes');
    rmSync(resolve(tmp, '.github/workflows/warden.yml'));
  });

  it('fails a Seer-style review that fails a check', () => {
    writeWorkflow('seer.yml', SEER_FAILCHECK);
    const error = runScannerExpectFailure(tmp);
    expect(error).not.toBeNull();
    expect(error.stderr).toContain('seer.yml');
    rmSync(resolve(tmp, '.github/workflows/seer.yml'));
  });

  it('ignores non-AI files that merely mention the signals', () => {
    writeWorkflow('pr-labels.yml', '# a maintainer may request changes; see CONTRIBUTING\n');
    expect(runScanner(tmp)).toContain('ai-review-boundary: ok');
  });

  it('leaves the checked-in .github tree clean', () => {
    expect(runScanner(repoRoot)).toContain('ai-review-boundary: ok');
  });

  it('keeps the boundary step wired into the required Company Guards job', () => {
    const workflow = readFileSync(
      resolve(repoRoot, '.github/workflows/company-guards.yml'),
      'utf8'
    );
    expect(workflow).toContain('node scripts/company-guards/ai-review-boundary.mjs');
  });
});
