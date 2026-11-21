import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { findErrorCopy } from '../../e2e/utils/visual-capture-copy';

/**
 * Capture gate guard (repo headroom audit, 2026-11-21).
 *
 * The daily visual refresh adopts whatever renders. It committed a loading
 * skeleton as `admin-home`, then the "Revenue state unavailable" card. Every
 * app suite the refresh writes must call `expectCaptureReady` before each
 * screenshot, so a capture showing a skeleton, a busy region or an error
 * fails its test and is never published.
 */

const testDirectory = dirname(fileURLToPath(import.meta.url));
const webWorkspace = resolve(testDirectory, '../../..');
const repoRoot = resolve(webWorkspace, '../..');
const e2eDirectory = resolve(webWorkspace, 'tests/e2e');

function refreshedAppSpecs(): string[] {
  const workflow = readFileSync(
    resolve(repoRoot, '.github/workflows/visual-regression.yml'),
    'utf8'
  );
  const specs: string[] = [];
  for (const line of workflow.split('\n')) {
    if (!/^\s*- \{ suite:/.test(line)) continue;
    const spec = /spec: ([\w.-]+\.spec\.ts)/.exec(line)?.[1];
    const server = /server: (\w+)/.exec(line)?.[1];
    const update = /update: '(\w+)'/.exec(line)?.[1];
    if (spec && server === 'app' && update === 'true') specs.push(spec);
  }
  return specs;
}

describe('visual capture gate', () => {
  const specs = refreshedAppSpecs();

  it('finds the refreshed app suites in the workflow matrix', () => {
    expect(specs).toContain('admin-visual-regression.spec.ts');
    expect(specs.length).toBeGreaterThanOrEqual(4);
  });

  it.each(specs)('%s gates every screenshot', spec => {
    const source = readFileSync(resolve(e2eDirectory, spec), 'utf8');
    const screenshots = source.match(/\.toHaveScreenshot\(/g)?.length ?? 0;
    const gates = source.match(/await expectCaptureReady\(/g)?.length ?? 0;
    expect(screenshots).toBeGreaterThan(0);
    expect(gates).toBe(screenshots);
  });

  it('flags the error copy the refresh adopted before', () => {
    expect(findErrorCopy('Bottleneck Revenue state unavailable')).toContain(
      'unavailable'
    );
    expect(
      findErrorCopy('Company state could not be read. Retry or check Summer.')
    ).toContain('could not be read');
    expect(findErrorCopy('Configuration Error')).not.toBeNull();
  });

  it('passes ordinary copy', () => {
    expect(findErrorCopy('Nothing is blocking revenue')).toBeNull();
    expect(findErrorCopy('No artist has paid yet.')).toBeNull();
    expect(findErrorCopy('Sign in to Jovie')).toBeNull();
  });
});
