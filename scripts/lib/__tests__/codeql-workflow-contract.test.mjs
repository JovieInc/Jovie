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
const EXPECTED_CODEQL_ACTION_REVISION =
  'cdf488f595d80d6e07e03d4674febd5ab45fa938';
const EXPECTED_CODEQL_ACTION_VERSION = 'v4.37.9';

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

describe('CodeQL workflow version coherence', () => {
  it('keeps every workflow CodeQL action use on one immutable release', () => {
    const pins = collectCodeqlActionUses();

    expect(pins.map(pin => pin.component)).toEqual(
      expect.arrayContaining(['analyze', 'init', 'upload-sarif'])
    );
    expect(
      pins.filter(pin => !/^[0-9a-f]{40}$/.test(pin.revision))
    ).toStrictEqual([]);
    expect(
      pins.filter(pin => pin.revision !== EXPECTED_CODEQL_ACTION_REVISION)
    ).toStrictEqual([]);
    expect(
      pins.filter(pin => pin.version !== EXPECTED_CODEQL_ACTION_VERSION)
    ).toStrictEqual([]);
  });

  it('groups CodeQL action updates so Dependabot moves every component together', () => {
    expect(GITHUB_ACTIONS_DEPENDABOT).toMatch(
      /groups:\n(?:\s+#.*\n)*\s+codeql-action:\n\s+patterns:\n\s+- 'github\/codeql-action'/
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
