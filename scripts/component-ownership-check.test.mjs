import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { checkRepository, findOwnershipViolations, readOwnershipMap } from './component-ownership-check.mjs';

test('ownership map has one public owner for every required family', () => {
  const map = readOwnershipMap();
  const families = Object.values(map.families);
  assert.equal(new Set(families.map(family => family.owner)).size, families.length);
  assert.ok(families.every(family => family.publicImport));
  assert.ok(families.every(family => fs.existsSync(path.resolve(family.owner))));
  assert.ok(families.some(family => family.contracts?.includes('scroll-ownership')));
  const firstRoute = fs.readFileSync(path.resolve(map.firstMigratedRoute), 'utf8');
  assert.match(firstRoute, /from ['"]@\/components\/canonical['"]/);
  assert.match(firstRoute, /<PageShell/);
});

test('repository has no route-local shell primitive', () => {
  assert.deepEqual(checkRepository(), []);
});

test('deliberate route-local duplicate fails the structural boundary', () => {
  const violations = findOwnershipViolations(
    'apps/web/app/app/(shell)/settings/page.tsx',
    'function NavigationRail() { return <nav />; }'
  );
  assert.equal(violations.length, 1);
  assert.match(violations[0].reason, /canonical owner/);
});
