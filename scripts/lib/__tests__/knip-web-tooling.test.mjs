import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const repoRoot = join(import.meta.dirname, '../../..');

function read(path) {
  return readFileSync(join(repoRoot, path), 'utf8');
}

describe('Knip web tooling entries', () => {
  const webPackage = JSON.parse(read('apps/web/package.json'));
  const knip = JSON.parse(read('knip.json'));

  it('keeps the used CLIs and drops the unused vitest runner', () => {
    expect(webPackage.devDependencies['@stryker-mutator/core']).toBe('10.0.0');
    expect(webPackage.devDependencies.promptfoo).toBe('0.121.20');
    expect(webPackage.devDependencies).not.toHaveProperty(
      '@stryker-mutator/vitest-runner'
    );
    expect(webPackage.scripts.promptfoo).toBe('promptfoo');
    expect(webPackage.scripts.stryker).toBe('stryker');
  });

  it('does not ignore dependencies Knip can already see', () => {
    const ignored = knip.workspaces['apps/web'].ignoreDependencies;
    expect(ignored).not.toContain('@radix-ui/react-avatar');
    expect(ignored).not.toContain('@sentry/node');
  });

  it('still invokes the CLIs from the eval and mutation runners', () => {
    const promptfooScripts = [
      'apps/web/scripts/run-deterministic-promptfoo-evals.sh',
      'apps/web/scripts/run-live-promptfoo-evals.sh',
      'apps/web/scripts/run-live-promptfoo-http-evals.sh',
      'apps/web/scripts/run-live-promptfoo-http-rate-limit-evals.sh',
      'apps/web/scripts/run-live-promptfoo-http-model-error-evals.sh',
    ];
    for (const path of promptfooScripts) {
      expect(read(path)).toMatch(/\bpromptfoo\b/);
    }
    expect(read('scripts/mutation-diff.mjs')).toContain(
      'node_modules/.bin/stryker'
    );
    expect(read('packages/audio-contracts/package.json')).toContain(
      'apps/web/node_modules/.bin/stryker'
    );
  });
});
