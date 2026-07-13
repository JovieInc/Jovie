import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const repoRoot = resolve(import.meta.dirname, '../../../../..');

describe('self-hosted runner setup action', () => {
  const action = readFileSync(
    resolve(repoRoot, '.github/actions/setup-node-pnpm/action.yml'),
    'utf8'
  );

  it('never saves pnpm stores from fixed or ephemeral self-hosted runners', () => {
    expect(action).not.toContain('uses: actions/cache@');
    expect(action).not.toContain('STORE_PATH=');
    expect(action).not.toContain('steps.pnpm-cache.outputs.STORE_PATH');
    expect(action).toContain('run: pnpm fetch --frozen-lockfile');
    expect(action).toContain('run: pnpm install --frozen-lockfile');
  });

  it('preserves setup-node caching only for GitHub-hosted runners', () => {
    const setupNodeStep = action.match(
      /- name: Setup Node\.js with pnpm cache\n(?<step>[\s\S]*?)(?=\n    - name:)/
    )?.groups?.step;

    expect(setupNodeStep).toContain('uses: actions/setup-node@');
    expect(setupNodeStep).toContain(
      "cache: ${{ runner.environment == 'github-hosted' && 'pnpm' || '' }}"
    );
    expect(setupNodeStep).toContain(
      "cache-dependency-path: '**/pnpm-lock.yaml'"
    );
  });
});
