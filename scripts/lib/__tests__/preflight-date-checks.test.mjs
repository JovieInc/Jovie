import assert from 'node:assert/strict';
import test from 'node:test';
import {
  censusFindings,
  dateChecks,
  parseArgs,
  scriptTimeBombTargets,
  webTimeBombTargets,
} from '../preflight-date-checks.mjs';

test('selects the census check only for census inputs and quotes every path', () => {
  assert.deepEqual(dateChecks(['README.md', 'docs/x.md'], 'origin/main'), []);
  const [census, bombs] = dateChecks(
    ['apps/web/app/(marketing)/pricing/page.tsx'],
    'origin/main'
  );
  assert.equal(census.id, 'date:surface-census');
  assert.match(
    census.command,
    /census --base 'origin\/main' -- 'apps\/web\/app\/\(marketing\)\/pricing\/page\.tsx'$/
  );
  assert.equal(bombs.id, 'date:time-bomb');
  const [only] = dateChecks(["scripts/it's.test.mjs"], 'origin/main');
  assert.equal(only.id, 'date:time-bomb');
  assert.match(only.command, /'scripts\/it'\\''s\.test\.mjs'$/);
});

test('scans changed web unit tests but not browser specs', () => {
  assert.deepEqual(
    webTimeBombTargets([
      'apps/web/tests/unit/a.test.ts',
      'apps/web/lib/b.test.tsx',
      'apps/web/tests/e2e/c.spec.ts',
      'apps/web/tests/e2e/d.test.ts',
      'apps/web/lib/e.ts',
      'scripts/f.test.mjs',
    ]),
    ['lib/b.test.tsx', 'tests/unit/a.test.ts']
  );
});

test('scans changed script contracts and the contracts that read changed files', () => {
  const contracts = ['scripts/a.test.mjs', 'scripts/b.test.mjs'];
  const targets = scriptTimeBombTargets(
    ['scripts/a.test.mjs', 'scripts/unlisted.test.mjs', 'scripts/lib/x.mjs'],
    {
      contracts,
      affected: (tests, changed) => {
        assert.deepEqual(tests, contracts);
        return changed.includes('scripts/lib/x.mjs')
          ? ['scripts/b.test.mjs']
          : [];
      },
    }
  );
  assert.deepEqual(targets, ['scripts/a.test.mjs', 'scripts/b.test.mjs']);
});

/** @param {{ stale?: string[], invalid?: string }} [options] */
function fakeCensus({ stale = [], invalid } = {}) {
  return {
    CENSUS_PATH: 'census.json',
    discoverPages: () => [],
    validateCensus: () => {
      if (invalid) throw new Error(invalid);
      return [
        { source: 'app/pricing/page.tsx', status: 'canonical' },
        { source: 'app/old/page.tsx', status: 'holdout' },
      ];
    },
    staleFiles: (_root, row) =>
      row.status === 'canonical' ? stale.map(file => ({ file })) : [],
  };
}

const io = census => ({
  baseRef: 'origin/main',
  census,
  readCurrent: () => ({}),
  readPrevious: () => null,
});

test('fails only for stale certified files this diff touches', () => {
  const census = fakeCensus({
    stale: ['app/pricing/page.tsx', 'lib/owner.ts'],
  });
  const own = censusFindings(['app/pricing/page.tsx'], io(census));
  assert.equal(own.errors.length, 1);
  assert.match(
    own.errors[0],
    /source changed; renew certification evidence \(app\/pricing\/page\.tsx\)/
  );
  const other = censusFindings(['apps/web/components/x.tsx'], io(census));
  assert.deepEqual(other, { errors: [], notes: [] });
});

test('census-wide validation blocks only a diff that touches the census or pages', () => {
  const census = fakeCensus({
    invalid: 'apps/web/app/new/page.tsx is not registered',
  });
  const page = censusFindings(['apps/web/app/new/page.tsx'], io(census));
  assert.equal(page.errors.length, 1);
  const unrelated = censusFindings(['apps/web/components/x.tsx'], io(census));
  assert.equal(unrelated.errors.length, 0);
  assert.match(unrelated.notes[0], /not registered/);
});

test('parses commands, defaults and paths after --', () => {
  assert.deepEqual(parseArgs(['census', '--base', 'abc', '--', 'a', 'b']), {
    command: 'census',
    base: 'abc',
    days: 7,
    paths: ['a', 'b'],
  });
  assert.equal(parseArgs(['time-bomb']).base, 'origin/main');
  assert.throws(() => parseArgs(['nope']), /usage/);
  assert.throws(() => parseArgs(['time-bomb', '--days', '0']), /--days/);
});
