import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { parseShippingCockpitProjection } from '@/lib/ovie/shipping-state/client';
import { freshShippingProjection } from '../../e2e/utils/admin-visual-shipping-fixture';
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
    // The sign-in modal's live regions; the first proof refresh refused them.
    expect(findErrorCopy('Jovie')).toBeNull();
    expect(findErrorCopy('Move your music forward.')).toBeNull();
  });

  it('lets a surface allow one help sentence and still flags the rest', () => {
    const help =
      'Add both manually in Stories when native file share is unavailable.';
    const allow = [/when native file\s+share is unavailable/i];
    expect(findErrorCopy(help)).not.toBeNull();
    expect(findErrorCopy(help, allow)).toBeNull();
    expect(findErrorCopy(`${help} Preview unavailable`, allow)).toContain(
      'Preview unavailable'
    );
  });

  it('stubs the reads that showed error states in admin captures', () => {
    const source = readFileSync(
      resolve(e2eDirectory, 'admin-visual-regression.spec.ts'),
      'utf8'
    );
    expect(source).toContain("'**/api/ovie/home/blocker'");
    expect(source).toContain("'**/api/hud/shipping-state**'");
  });

  it('answers the shipping read with a projection Home renders as ready', () => {
    const projection = parseShippingCockpitProjection(
      freshShippingProjection()
    );
    expect(projection).not.toBeNull();
    // Home and Ops show a skeleton while the task cache is `syncing` with no
    // observation; the first proof refresh refused Admin Home for it.
    expect(projection?.operationalTasks.syncState).toBe('fresh');
    expect(projection?.operationalTasks.observedAt).not.toBeNull();
  });

  it('does not treat a bare role="alert" region as a problem', () => {
    const gate = readFileSync(
      resolve(e2eDirectory, 'utils/visual-capture-ready.ts'),
      'utf8'
    );
    expect(gate).not.toMatch(/locator\(['"]\[role="alert"\]['"]\)/);
  });
});
