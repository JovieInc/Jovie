import assert from 'node:assert/strict';
import test from 'node:test';
import { draftBody, gate, lockedCitation } from './pr-open.mjs';

const file = (filename, status = 'modified') => ({
  filename,
  status,
  patch: '',
});
const metric = 'egress|MB|lower|26|pg_stat_statements|select 1';

test('a drafted compounding body with a measured before passes every body gate', () => {
  const files = [file('scripts/x.mjs'), file('scripts/x.test.mjs', 'added')];
  const title = 'perf(ci): cut x';
  const body = draftBody({
    title,
    files,
    labels: ['compounding'],
    metric,
    summary: 'Cuts x.',
    claim: 'x is cheaper',
    theme: 'cost',
  });
  assert.match(body, /Metric: egress \| MB \| lower \| 26 \| \? \|/);
  assert.match(body, /Pending: yes/);
  assert.deepEqual(
    gate({ title, body, labels: ['compounding'], files }).errors,
    []
  );
});

test('an unmeasured compounding PR is refused instead of getting an invented number', () => {
  const files = [file('scripts/x.mjs')];
  const body = draftBody({
    title: 'perf(ci): x',
    files,
    labels: ['compounding'],
    summary: 's',
  });
  assert.ok(
    gate({ title: 'perf(ci): x', body, labels: ['compounding'], files }).errors
      .length > 0
  );
});

test('a fix: title needs a failing command and run, never a fabricated one', () => {
  const files = [file('scripts/x.mjs'), file('scripts/x.test.mjs', 'added')];
  const bare = draftBody({ title: 'fix(web): x', files, summary: 's' });
  assert.ok(
    gate({ title: 'fix(web): x', body: bare, files }).errors.some(e =>
      e.startsWith('red-before-green')
    )
  );
  const body = draftBody({
    title: 'fix(web): x',
    files,
    summary: 's',
    failingCommand: 'pnpm test',
    failingRun: 'https://github.com/JovieInc/Jovie/actions/runs/123',
  });
  assert.deepEqual(gate({ title: 'fix(web): x', body, files }).errors, []);
});

test('locked paths cite the ownership-map page for their class', () => {
  assert.equal(
    lockedCitation(['apps/web/lib/auth/a.ts']).page,
    'canon-ownership-json'
  );
  assert.equal(
    lockedCitation(['x/y-baseline.json']).page,
    'decisions/engineering/repo-waste-sweep-2026-10-29'
  );
  assert.equal(lockedCitation(['apps/web/lib/a.ts']), null);
  const files = [file('apps/web/lib/auth/a.ts')];
  const body = draftBody({ title: 'chore(auth): a', files, summary: 's' });
  assert.deepEqual(
    gate({ title: 'chore(auth): a', body, files }).errors.filter(e =>
      e.startsWith('locked')
    ),
    []
  );
});

test('customer-facing code gets the internal marker unless declared customer-visible', () => {
  const files = [file('apps/web/lib/a.ts')];
  assert.match(
    draftBody({ title: 'chore: a', files, summary: 's' }),
    /releaseWorthy":false/
  );
});
