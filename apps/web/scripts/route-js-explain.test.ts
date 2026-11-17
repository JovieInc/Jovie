import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { gzipSync } from 'node:zlib';
import { afterEach, expect, it } from 'vitest';
import { cleanupFixtures, fixtureRoots } from './route-js-budget-fixtures';
import { explainRouteJs } from './route-js-explain.mjs';

afterEach(cleanupFixtures);

it('attributes only initial route chunks, deduplicating shared entries and sources', () => {
  const nextDir = mkdtempSync(join(tmpdir(), 'route-js-explain-'));
  fixtureRoots.push(nextDir);
  const chunks = join(nextDir, 'static/chunks');
  const manifest = join(nextDir, 'server/app/app/admin/room');
  mkdirSync(chunks, { recursive: true });
  mkdirSync(manifest, { recursive: true });
  writeFileSync(
    join(nextDir, 'build-manifest.json'),
    JSON.stringify({
      rootMainFiles: ['static/chunks/shared.js'],
    })
  );
  writeFileSync(
    join(manifest, 'page_client-reference-manifest.js'),
    `globalThis.__RSC_MANIFEST = ${JSON.stringify({
      '/app/admin/room/page': {
        entryJSFiles: {
          layout: ['static/chunks/shared.js'],
          page: ['static/chunks/room.js'],
        },
      },
    })}`
  );
  writeFileSync(
    join(chunks, 'shared.js'),
    'shared();\n//# sourceMappingURL=different-hash.js.map\n'
  );
  writeFileSync(
    join(chunks, 'different-hash.js.map'),
    JSON.stringify({
      sources: ['shared.ts', 'shared.ts'],
    })
  );
  writeFileSync(join(chunks, 'room.js'), 'room();');
  writeFileSync(join(chunks, 'unrelated.js'), 'marketing();');
  const rows = explainRouteJs(nextDir, '/app/admin/room');
  expect(rows).toHaveLength(2);
  expect(rows.find(row => row.file.endsWith('shared.js'))).toEqual({
    file: 'static/chunks/shared.js',
    gzipBytes: gzipSync('shared();', { level: 9 }).length,
    sources: ['shared.ts'],
  });
  expect(rows.find(row => row.file.endsWith('room.js'))?.sources).toBeNull();
  expect(() => explainRouteJs(nextDir, '/app/missing')).toThrow(
    'No client manifest'
  );
});
