import { describe, expect, it } from 'vitest';
import {
  collectValueImports,
  describeMatches,
  traceImportGraph,
} from '../../../helpers/import-graph';

/**
 * `ProfileCompactTemplate` is the `'use client'` boundary for every public
 * profile, so every value import reachable from it ships to the browser,
 * lazily or not. None of it may reach the database layer: that would put
 * Drizzle and the table/column schema in the public bundle.
 */
const CLIENT_ENTRIES = [
  'components/features/profile/templates/ProfileCompactTemplate.tsx',
  'components/features/profile/profile-surface-state.ts',
  'lib/profile/release-visibility.ts',
  'lib/profile/public-release-eligibility.shared.ts',
];

const DATABASE_SPECIFIERS = [
  /^@\/lib\/db(?:\/|$)/,
  /^drizzle-orm(?:\/|$)/,
  /^drizzle-zod$/,
  /^@neondatabase\/serverless$/,
  /^server-only$/,
];
const DATABASE_FILES = [/^lib\/db\//];

function findDatabaseImports(entry: string): string[] {
  const graph = traceImportGraph(entry, { followDynamicImports: true });
  return [
    ...describeMatches(graph.specifiers, DATABASE_SPECIFIERS),
    ...describeMatches(graph.files, DATABASE_FILES),
  ];
}

describe('public profile client import graph', () => {
  it('collects value imports and skips type-only imports', () => {
    const imports = collectValueImports(`
      import type { Artist } from '@/types/db';
      import { type SQL, and } from 'drizzle-orm';
      import 'server-only';
      export { discogReleases } from '@/lib/db/schema/content';
      export type { Foo } from './foo';
      // import { nope } from '@/lib/db';
      type Row = import('@/lib/db/schema').CreatorProfile;
      const lazy = () => import('@/lib/db/client');
    `);

    expect(imports.static).toEqual([
      'drizzle-orm',
      'server-only',
      '@/lib/db/schema/content',
    ]);
    expect(imports.dynamic).toEqual(['@/lib/db/client']);
  });

  it('flags the SQL eligibility builder, so importing it from client code fails here', () => {
    const violations = findDatabaseImports(
      'lib/profile/public-release-eligibility.ts'
    ).join('\n');

    expect(violations).toContain('drizzle-orm');
    expect(violations).toContain('@/lib/db/schema/content');
  });

  it.each(CLIENT_ENTRIES)('%s never reaches the database layer', entry => {
    expect(findDatabaseImports(entry)).toEqual([]);
  });
});
