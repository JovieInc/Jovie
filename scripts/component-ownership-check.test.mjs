import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import {
  checkChromeRepository,
  checkRepository,
  chromeAllowlistKey,
  findChromeOverrideViolations,
  findOwnershipViolations,
  readOwnershipMap,
} from './component-ownership-check.mjs';

test('ownership map has one public owner for every required family', () => {
  const map = readOwnershipMap();
  const families = Object.values(map.families);
  assert.equal(
    new Set(families.map(family => family.owner)).size,
    families.length
  );
  assert.ok(families.every(family => family.publicImport));
  assert.ok(
    families.every(family => fs.existsSync(path.resolve(family.owner)))
  );
  assert.ok(
    families.some(family => family.contracts?.includes('scroll-ownership'))
  );
  const firstRoute = fs.readFileSync(
    path.resolve(map.firstMigratedRoute),
    'utf8'
  );
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

const AURA_PIERCE_RED_CSS = `
.homepage-name-search .input-aura-frame__illumination {
  opacity: 1;
}
.homepage-close .input-aura-frame--editorial {
  filter: none;
}
`;

const AURA_NEIGHBOR_GREEN_CSS = `
.homepage-name-search__field {
  background: var(--homepage-editorial-field);
}
`;

test('chrome map names one owner for search aura, header, footer, frames, logos', () => {
  const map = readOwnershipMap();
  for (const family of [
    'search-aura',
    'headers',
    'footers',
    'device-frames',
    'logos',
    'form-fields-and-buttons',
  ]) {
    assert.ok(map.families[family]?.owner, family);
  }
  assert.ok(
    (map.chromePierceAllowlist ?? []).every(
      key => !key.includes('input-aura-frame')
    )
  );
});

test('descendant selectors into aura internals fail; owner variants and field tokens pass', () => {
  const red = findChromeOverrideViolations(
    'apps/web/app/(home)/home.css',
    AURA_PIERCE_RED_CSS
  );
  assert.ok(
    red.some(item => item.internal === 'input-aura-frame__illumination')
  );
  assert.ok(red.some(item => item.internal === 'input-aura-frame--editorial'));
  assert.equal(
    findChromeOverrideViolations(
      'apps/web/app/(home)/home.css',
      AURA_NEIGHBOR_GREEN_CSS
    ).length,
    0
  );
  assert.equal(
    findChromeOverrideViolations(
      'apps/web/components/features/home/InputAuraFrame.css',
      '.input-aura-frame--editorial > .input-aura-frame__illumination {}'
    ).length,
    0
  );
});

test('header, footer, and device-frame internals fail outside the owner', () => {
  const red = [
    ...findChromeOverrideViolations(
      'apps/web/app/(home)/page.tsx',
      '.local .marketing-glass-header__cta { color: red; }'
    ),
    ...findChromeOverrideViolations(
      'apps/web/app/(home)/home.css',
      '.local .mf-mark-tagline { color: red; }'
    ),
    ...findChromeOverrideViolations(
      'apps/web/app/(home)/home.css',
      '.local .ap-phone-frame__notch { width: 7rem; }'
    ),
  ];
  assert.deepEqual(red.map(item => item.internal).sort(), [
    'ap-phone-frame__notch',
    'marketing-glass-header__cta',
    'mf-mark-tagline',
  ]);
  assert.equal(
    findChromeOverrideViolations(
      'apps/web/components/organisms/HeaderNav.css',
      '.marketing-glass-header__cta { min-height: 2rem; }'
    ).length,
    0
  );
});

test('repository chrome pierces stay on the shrink-only allowlist', () => {
  assert.deepEqual(checkChromeRepository(), []);
  const map = readOwnershipMap();
  assert.ok((map.chromePierceAllowlist ?? []).length > 0);
  assert.equal(
    new Set(map.chromePierceAllowlist).size,
    map.chromePierceAllowlist.length
  );
  for (const key of map.chromePierceAllowlist) {
    assert.match(key, /:/);
  }
  assert.ok(
    !map.chromePierceAllowlist.some(key =>
      chromeAllowlistKey({
        filePath: key.split(':')[0],
        internal: key.split(':')[1],
      }).includes('input-aura-frame')
    )
  );
});
