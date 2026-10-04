import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { beforeAll, describe, expect, it } from 'vitest';

/**
 * JOV-7713: the UI assurance denominator is the real exposed UI inventory.
 * Every `ui-inventory` object in the assurance matrix binds to an existing
 * registry export; this resolves each binding at runtime and proves every UI
 * failure class has a non-empty denominator, so a class can never certify
 * against zero units.
 */

const REPO_ROOT = join(process.cwd(), '../..');
const matrix = JSON.parse(
  readFileSync(
    join(REPO_ROOT, 'scripts/invariants/assurance-matrix.json'),
    'utf8'
  )
) as {
  scope: { requiredObjects: { id: string; kind: string; source?: string }[] };
  rows: { id: string; failureClass: string; covers: string[]; ui?: object }[];
};

// One loader per bound registry; a new inventory binding must add its loader.
const LOADERS: Record<string, () => Promise<Record<string, unknown>>> = {
  'apps/web/data/designSystem/uiOwnershipRegistry.ts': () =>
    import('@/data/designSystem/uiOwnershipRegistry'),
  'apps/web/data/appScreens/registry.ts': () =>
    import('@/data/appScreens/registry'),
  'apps/web/data/marketing/componentRegistry.ts': () =>
    import('@/data/marketing/componentRegistry'),
  'apps/web/lib/visual-qa/registry.ts': () =>
    import('@/lib/visual-qa/registry'),
  'apps/web/lib/platform/supported-platforms.ts': () =>
    import('@/lib/platform/supported-platforms'),
  'scripts/invariants/screen-certification.mjs': () =>
    import(
      pathToFileURL(
        join(REPO_ROOT, 'scripts/invariants/screen-certification.mjs')
      ).href
    ),
};

async function resolveUnits(source: string): Promise<readonly unknown[]> {
  const [path, exportName] = source.split('#');
  const load = LOADERS[path];
  if (!load) throw new Error(`no loader for UI inventory source ${path}`);
  const units = (await load())[exportName];
  return Array.isArray(units) ? units : [];
}

describe('UI assurance inventory denominator (JOV-7713)', () => {
  const inventory = matrix.scope.requiredObjects.filter(
    item => item.kind === 'ui-inventory'
  );
  const counts = new Map<string, number>();

  // Registry modules are large; load them once, off the per-test timeout.
  beforeAll(async () => {
    for (const item of inventory)
      counts.set(item.id, (await resolveUnits(item.source ?? '')).length);
  }, 60_000);

  it.each(inventory.map(item => item.id))(
    '%s resolves to a non-empty registry export',
    id => {
      expect(counts.get(id)).toBeGreaterThan(0);
    }
  );

  it('deliberate red: an unbound inventory source cannot resolve', async () => {
    await expect(resolveUnits('apps/web/unbound.ts#UNITS')).rejects.toThrow(
      'no loader'
    );
  });

  it('gives every UI class row a non-empty denominator', () => {
    for (const row of matrix.rows.filter(item => item.ui)) {
      const denominator = row.covers.reduce(
        (sum, id) => sum + (counts.get(id) ?? 0),
        0
      );
      expect(denominator, row.id).toBeGreaterThan(0);
    }
  });
});
