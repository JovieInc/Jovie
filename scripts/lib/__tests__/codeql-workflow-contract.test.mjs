import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const REPO_ROOT = resolve(import.meta.dirname, '..', '..', '..');
const CODEQL_WORKFLOW = readFileSync(
  resolve(REPO_ROOT, '.github/workflows/codeql.yml'),
  'utf8'
);
const DEPENDABOT_CONFIG = readFileSync(
  resolve(REPO_ROOT, '.github/dependabot.yml'),
  'utf8'
);
const GITHUB_ACTIONS_DEPENDABOT = DEPENDABOT_CONFIG.match(
  /  - package-ecosystem: 'github-actions'[\s\S]*?(?=\n  - package-ecosystem:|$)/
)?.[0];
const NPM_DEPENDABOT = DEPENDABOT_CONFIG.match(
  /  - package-ecosystem: 'npm'[\s\S]*?(?=\n  - package-ecosystem:|$)/
)?.[0];

const CODEQL_ACTION_PIN =
  /^\s*uses:\s*github\/codeql-action\/([^@\s]+)@([0-9a-f]{40})\s+#\s+(v\S+)\s*$/gm;

describe('CodeQL workflow version coherence', () => {
  it('pins every CodeQL component in the job to one action release', () => {
    const pins = [...CODEQL_WORKFLOW.matchAll(CODEQL_ACTION_PIN)].map(
      match => ({
        component: match[1],
        revision: match[2],
        version: match[3],
      })
    );

    expect(pins.map(pin => pin.component).sort()).toEqual(['analyze', 'init']);
    expect([...new Set(pins.map(pin => pin.revision))]).toHaveLength(1);
    expect([...new Set(pins.map(pin => pin.version))]).toHaveLength(1);
  });

  it('groups CodeQL action updates so Dependabot moves every component together', () => {
    expect(GITHUB_ACTIONS_DEPENDABOT).toMatch(
      /groups:\n(?:\s+#.*\n)*\s+codeql-action:\n\s+patterns:\n\s+- 'github\/codeql-action'/
    );
  });

  it('uses Dependabot schema values for Electron major updates', () => {
    expect(NPM_DEPENDABOT).toMatch(
      /electron-major:[\s\S]*?update-types:\n\s+- 'major'/
    );
  });
});
