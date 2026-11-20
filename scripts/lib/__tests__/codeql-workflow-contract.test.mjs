import { readdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const REPO_ROOT = resolve(import.meta.dirname, '..', '..', '..');
const WORKFLOWS_DIR = resolve(REPO_ROOT, '.github/workflows');
const WORKFLOW_FILES = readdirSync(WORKFLOWS_DIR)
  .filter(file => file.endsWith('.yml') || file.endsWith('.yaml'))
  .map(file => ({
    content: readFileSync(resolve(WORKFLOWS_DIR, file), 'utf8'),
    file,
  }));
const DEPENDABOT_CONFIG = readFileSync(
  resolve(REPO_ROOT, '.github/dependabot.yml'),
  'utf8'
);
const AFFECTED_TEST_RUNNER = readFileSync(
  resolve(REPO_ROOT, 'scripts/run-affected-tests.mjs'),
  'utf8'
);
const GITHUB_ACTIONS_DEPENDABOT = DEPENDABOT_CONFIG.match(
  /  - package-ecosystem: 'github-actions'[\s\S]*?(?=\n  - package-ecosystem:|$)/
)?.[0];
const NPM_DEPENDABOT = DEPENDABOT_CONFIG.match(
  /  - package-ecosystem: 'npm'[\s\S]*?(?=\n  - package-ecosystem:|$)/
)?.[0];

const CODEQL_ACTION_USE =
  /^\s*uses:\s*github\/codeql-action\/([^@\s]+)@([^\s#]+)(?:\s+#\s+(\S+))?\s*$/gm;

function collectCodeqlActionUses() {
  return WORKFLOW_FILES.flatMap(({ content, file }) =>
    [...content.matchAll(CODEQL_ACTION_USE)].map(match => ({
      component: match[1],
      line: content.slice(0, match.index).split('\n').length,
      revision: match[2],
      version: match[3] ?? null,
      workflow: file,
    }))
  );
}

function expectCoherentCodeqlRelease(pins) {
  expect(pins.map(pin => pin.component)).toEqual(
    expect.arrayContaining(['analyze', 'init', 'upload-sarif'])
  );
  expect(
    pins.filter(pin => !/^[0-9a-f]{40}$/.test(pin.revision))
  ).toStrictEqual([]);
  expect(
    pins.filter(pin => !/^v\d+\.\d+\.\d+$/.test(pin.version ?? ''))
  ).toStrictEqual([]);
  // Dependabot owns the release pin. Check coherence, so a grouped bump does
  // not require updating a second copy of the release in this contract.
  expect(new Set(pins.map(pin => pin.revision)).size).toBe(1);
  expect(new Set(pins.map(pin => pin.version)).size).toBe(1);
}

describe('CodeQL workflow version coherence', () => {
  it('keeps every workflow CodeQL action use on one immutable release', () => {
    expectCoherentCodeqlRelease(collectCodeqlActionUses());
  });

  it('accepts a coordinated future release without updating the contract', () => {
    const pins = collectCodeqlActionUses().map(pin => ({
      ...pin,
      revision: '1'.repeat(40),
      version: 'v99.0.0',
    }));

    expectCoherentCodeqlRelease(pins);
  });

  it.each([
    ['a different immutable revision', { revision: '2'.repeat(40) }],
    ['a different release comment', { version: 'v99.0.1' }],
    ['a mutable tag', { revision: 'v99.0.0' }],
    ['a short revision', { revision: '1234567' }],
    ['a missing release comment', { version: null }],
    ['a mutable release comment', { version: 'v99' }],
  ])('rejects %s in any component', (_label, change) => {
    const pins = collectCodeqlActionUses();

    for (const index of pins.keys()) {
      const changed = pins.map((pin, i) =>
        i === index ? { ...pin, ...change } : pin
      );
      expect(() => expectCoherentCodeqlRelease(changed)).toThrow();
    }
  });

  it.each(['analyze', 'init', 'upload-sarif'])(
    'rejects a missing %s component',
    component => {
      const pins = collectCodeqlActionUses().filter(
        pin => pin.component !== component
      );
      expect(() => expectCoherentCodeqlRelease(pins)).toThrow();
    }
  );

  it('groups CodeQL action updates so Dependabot moves every component together', () => {
    expect(GITHUB_ACTIONS_DEPENDABOT).toMatch(
      /groups:\n(?:\s+#.*\n)*\s+codeql-action:\n\s+patterns:\n(?:\s+#.*\n)*\s+- 'github\/codeql-action\*'/
    );
    // An exact name missed github/codeql-action/analyze and /upload-sarif, which
    // then arrived as separate PRs (#18829, #18832) (JOV-6837).
    expect(GITHUB_ACTIONS_DEPENDABOT).not.toContain(
      "- 'github/codeql-action'\n"
    );
  });

  it('runs this coherence contract in the structural control suite', () => {
    expect(AFFECTED_TEST_RUNNER).toContain(
      "'scripts/lib/__tests__/codeql-workflow-contract.test.mjs'"
    );
  });

  it('uses Dependabot schema values for Electron major updates', () => {
    expect(NPM_DEPENDABOT).toMatch(
      /electron-major:[\s\S]*?update-types:\n\s+- 'major'/
    );
  });
});
