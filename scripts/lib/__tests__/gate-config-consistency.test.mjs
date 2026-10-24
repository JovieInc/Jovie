import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { SCRIPT_CONTRACT_VITEST_TESTS } from '../../ci-fast-lanes.mjs';
import {
  actionFlags,
  auditGateConfigs,
  triggersPullRequest,
} from '../gate-config-consistency.mjs';

const REPO_ROOT = resolve(import.meta.dirname, '..', '..', '..');

function writeWorkflow(root, name, body) {
  const directory = join(root, '.github/workflows');
  mkdirSync(directory, { recursive: true });
  writeFileSync(join(directory, name), body);
}

const NIGHTLY_COVERAGE = `name: Coverage
on:
  push:
    branches: [main]
jobs:
  upload:
    runs-on: ubuntu-latest
    steps:
      - uses: codecov/codecov-action@v5
        with:
          flags: nightly-unittests
`;

const MATCHING_CODECOV = `coverage:
  status:
    patch:
      default:
        informational: true
flags:
  nightly-unittests:
    paths:
      - apps/web/
`;

describe('gate config consistency', () => {
  it('runs from the structural script contract lane', () => {
    expect(SCRIPT_CONTRACT_VITEST_TESTS).toContain(
      'scripts/lib/__tests__/gate-config-consistency.test.mjs'
    );
  });

  it('reads coverage flags from the codecov action, not test analytics', () => {
    const workflow = `
      - uses: codecov/test-results-action@v1
        with:
          flags: unittests
      - uses: codecov/codecov-action@v5
        with:
          flags: nightly-unittests,web
      - name: Later
        uses: actions/upload-artifact@v4
        with:
          flags: ignored
`;
    expect(actionFlags(workflow, 'codecov/codecov-action@')).toEqual([
      'nightly-unittests',
      'web',
    ]);
    expect(actionFlags(workflow, 'codecov/test-results-action@')).toEqual([
      'unittests',
    ]);
  });

  it('detects pull_request only inside the on block', () => {
    expect(
      triggersPullRequest(`on:
  push:
    branches: [main]
jobs:
  note:
    steps:
      - run: echo pull_request
`)
    ).toBe(false);
    expect(
      triggersPullRequest(`on:
  pull_request:
jobs:
  test:
    runs-on: ubuntu-latest
`)
    ).toBe(true);
  });

  it('accepts a coverage config that matches its producer', () => {
    const root = mkdtempSync(join(tmpdir(), 'gate-config-'));
    writeWorkflow(root, 'coverage.yml', NIGHTLY_COVERAGE);
    writeFileSync(join(root, 'codecov.yml'), MATCHING_CODECOV);
    expect(auditGateConfigs(root)).toEqual([]);
  });

  it.each(['nightly-unittests', '[nightly-unittests]'])(
    'does not treat non-mapping flags %s as declared coverage flags',
    flags => {
      const root = mkdtempSync(join(tmpdir(), 'gate-config-'));
      writeWorkflow(root, 'coverage.yml', NIGHTLY_COVERAGE);
      writeFileSync(
        join(root, 'codecov.yml'),
        MATCHING_CODECOV.replace(/flags:[\s\S]*/u, `flags: ${flags}\n`)
      );
      expect(auditGateConfigs(root)).toEqual([
        'a workflow uploads coverage flag "nightly-unittests" but codecov.yml does not declare it',
      ]);
    }
  );

  it.each([
    'null',
    'false',
    '[coverage]',
    'coverage: false',
    'coverage: {status: false}',
    'coverage: {status: {patch: false}}',
    'coverage: {status: {patch: {default: false}}}',
  ])('keeps the patch gate fail-closed for non-mapping YAML: %s', config => {
    const root = mkdtempSync(join(tmpdir(), 'gate-config-'));
    writeFileSync(join(root, 'codecov.yml'), config);
    expect(auditGateConfigs(root)).toEqual([
      'codecov.yml patch status is blocking, but no pull_request workflow uploads coverage. Exact-head Coverage in ci.yml is the pull-request line-coverage gate.',
    ]);
  });

  it('rejects a named blocking patch status when default is informational', () => {
    const root = mkdtempSync(join(tmpdir(), 'gate-config-'));
    writeWorkflow(root, 'coverage.yml', NIGHTLY_COVERAGE);
    writeFileSync(
      join(root, 'codecov.yml'),
      `coverage:
  status:
    patch:
      default:
        informational: true
      app:
        informational: false
flags:
  nightly-unittests:
    paths:
      - apps/web/
`
    );
    expect(auditGateConfigs(root)).toEqual([
      'codecov.yml patch status is blocking, but no pull_request workflow uploads coverage. Exact-head Coverage in ci.yml is the pull-request line-coverage gate.',
    ]);
  });

  it('rejects a blocking patch check and a coverage flag with no producer', () => {
    const root = mkdtempSync(join(tmpdir(), 'gate-config-'));
    writeWorkflow(root, 'coverage.yml', NIGHTLY_COVERAGE);
    writeWorkflow(
      root,
      'ci.yml',
      `on:
  pull_request:
jobs:
  test:
    steps:
      - uses: codecov/test-results-action@v1
        with:
          flags: unittests
`
    );
    writeFileSync(
      join(root, 'codecov.yml'),
      `coverage:
  status:
    patch:
      default:
        informational: false
flags:
  unittests:
    carryforward: true
`
    );
    const findings = auditGateConfigs(root);
    expect(findings.some(finding => finding.includes('unittests'))).toBe(true);
    expect(
      findings.some(finding => finding.includes('nightly-unittests'))
    ).toBe(true);
    expect(findings.some(finding => finding.includes('patch status'))).toBe(
      true
    );
  });

  it('treats the Chromatic GitHub action as a live workflow', () => {
    const root = mkdtempSync(join(tmpdir(), 'gate-config-'));
    writeWorkflow(root, 'coverage.yml', NIGHTLY_COVERAGE);
    writeWorkflow(
      root,
      'chromatic.yml',
      `name: Chromatic
on:
  pull_request:
jobs:
  visual:
    runs-on: ubuntu-latest
    steps:
      - uses: chromaui/action@v11
`
    );
    writeFileSync(join(root, 'codecov.yml'), MATCHING_CODECOV);
    writeFileSync(join(root, 'chromatic.config.json'), '{}\n');
    expect(auditGateConfigs(root)).toEqual([]);
  });

  it('rejects Chromatic config and the Storybook addon when no workflow runs Chromatic', () => {
    const root = mkdtempSync(join(tmpdir(), 'gate-config-'));
    writeWorkflow(root, 'coverage.yml', NIGHTLY_COVERAGE);
    writeFileSync(join(root, 'codecov.yml'), MATCHING_CODECOV);
    writeFileSync(join(root, 'chromatic.config.json'), '{}\n');
    mkdirSync(join(root, 'apps/web/.storybook'), { recursive: true });
    writeFileSync(
      join(root, 'apps/web/package.json'),
      JSON.stringify({
        devDependencies: { '@chromatic-com/storybook': '1.0.0' },
      })
    );
    writeFileSync(
      join(root, 'apps/web/.storybook/main.ts'),
      "addons: ['@chromatic-com/storybook']\n"
    );
    const findings = auditGateConfigs(root);
    expect(findings).toHaveLength(3);
    expect(
      findings.every(finding => /Chromatic|chromatic/u.test(finding))
    ).toBe(true);
  });

  it('keeps this repo aligned with the workflows that actually run', () => {
    expect(auditGateConfigs(REPO_ROOT)).toEqual([]);
  });
});
