import assert from 'node:assert/strict';
import { test } from 'node:test';
import { retireCoverageReports } from './lib/retire-coverage-reports.mjs';

const repo = 'JovieInc/Jovie';
const source = 'a'.repeat(40);
const old = 'b'.repeat(40);
const sha = 'c'.repeat(40);
const url = `https://github.com/${repo}/pull/10`;
const reports =
  'docs/TEST_COVERAGE_HEATMAP.md\napps/web/reports/test-coverage-snapshot.json';
const candidate = () => ({
  number: 1,
  headRefName: 'bot/coverage-audit-123-1',
  isDraft: true,
  labels: [],
  body: `Measured source: \`${old}\`.`,
});
const pr = () => ({
  state: 'open',
  draft: true,
  labels: [],
  base: { ref: 'main' },
  title: 'chore(testing): refresh changed-evidence heatmap',
  body: candidate().body,
  head: { ref: candidate().headRefName, sha, repo: { full_name: repo } },
});

function fixture({
  candidates = [candidate()],
  first = pr(),
  second = first,
  third = undefined,
  failLabel = false,
  parents = [{ sha: old }],
  files = reports,
  ancestor = true,
  failClose = false,
  profile = 'coverage-audit',
} = {}) {
  const calls = [];
  let reads = 0;
  const gh = args => {
    calls.push(args);
    if (args[0] === 'pr' && args[1] === 'list')
      return JSON.stringify(candidates);
    if (args[0] === 'pr' && args[1] === 'close') {
      if (failClose) throw new Error('close denied');
      return '';
    }
    if (args[0] === 'pr' && args[1] === 'edit') {
      if (failLabel) throw new Error('label denied');
      return '';
    }
    if (args.includes('--paginate')) return files;
    if (args[1].includes('/git/commits/')) return JSON.stringify({ parents });
    return JSON.stringify(
      reads++ === 0
        ? first
        : reads === 2
          ? second
          : (third ?? { ...second, labels: [{ name: 'duplicate' }] })
    );
  };
  const run = () =>
    retireCoverageReports({
      gh,
      profile,
      repo,
      url,
      source,
      isAncestor: (older, newer) => {
        assert.equal(older, old);
        assert.equal(newer, source);
        return ancestor;
      },
    });
  return {
    calls,
    run,
    closed: () => calls.filter(args => args[1] === 'close'),
  };
}

test('retires only the older measured-source report after checking ancestry, parent and files', () => {
  const f = fixture();
  assert.deepEqual(f.run(), [1]);
  assert.deepEqual(f.closed(), [['pr', 'close', '1', '--repo', repo]]);
  assert.equal(
    f.calls.filter(args => args[1] === `repos/${repo}/pulls/1`).length,
    3
  );
  assert.ok(f.calls.some(args => args.includes('--paginate')));
});

test('closure requires an explicit duplicate label on the same proven report head', () => {
  const f = fixture();
  assert.deepEqual(f.run(), [1]);
  const label = ['pr', 'edit', '1', '--repo', repo, '--add-label', 'duplicate'];
  assert.deepEqual(
    f.calls.find(args => args[1] === 'edit'),
    label
  );
  assert.ok(
    f.calls.findIndex(args => args[1] === 'edit') <
      f.calls.findIndex(args => args[1] === 'close')
  );
  assert.throws(() => fixture({ failLabel: true }).run(), /label denied/);
  for (const override of [
    { labels: [] },
    { labels: [{ name: 'duplicate' }, { name: 'hold' }] },
    { labels: [{ name: 'duplicate' }, { name: 'queue-poison' }] },
    { head: { ...pr().head, sha: source } },
    { state: 'closed' },
    { draft: false },
    { body: 'writer takeover' },
  ]) {
    const held = fixture({
      third: { ...pr(), labels: [{ name: 'duplicate' }], ...override },
    });
    assert.deepEqual(held.run(), []);
    assert.deepEqual(held.closed(), []);
  }
});

test('preserves the replacement, newer runs, held/ready PRs and non-report branches', () => {
  for (const override of [
    { number: 10 },
    { number: 11 },
    { isDraft: false },
    { labels: [{ name: 'hold' }] },
    { headRefName: 'codex/work' },
    { body: 'no measurement receipt' },
  ]) {
    const f = fixture({ candidates: [{ ...candidate(), ...override }] });
    assert.deepEqual(f.run(), []);
    assert.deepEqual(f.closed(), []);
  }
  assert.deepEqual(fixture({ ancestor: false }).run(), []);
});

test('fails closed on writer takeover, forks, retargeting, extra commits and unrelated files', () => {
  for (const override of [
    { state: 'closed' },
    { draft: false },
    { labels: [{ name: 'hold' }] },
    { base: { ref: 'feature' } },
    { head: { ...pr().head, repo: { full_name: 'external/Jovie' } } },
    { head: { ...pr().head, ref: 'codex/takeover' } },
    { body: 'writer-owned now' },
    { title: 'source repair' },
  ]) {
    assert.deepEqual(fixture({ first: { ...pr(), ...override } }).run(), []);
    assert.deepEqual(fixture({ second: { ...pr(), ...override } }).run(), []);
  }
  assert.deepEqual(
    fixture({ second: { ...pr(), head: { ...pr().head, sha: source } } }).run(),
    []
  );
  for (const parents of [
    [],
    [{ sha: source }],
    [{ sha: old }, { sha: source }],
  ]) {
    assert.deepEqual(fixture({ parents }).run(), []);
  }
  for (const files of ['', `${reports}\nsource.ts`]) {
    assert.deepEqual(fixture({ files }).run(), []);
  }
});

test('missing publication receipts never authorize cleanup and cleanup failures remain visible', () => {
  assert.throws(
    () =>
      retireCoverageReports({
        url: 'no receipt',
        repo,
        source,
        gh: () => {
          throw new Error('invalid receipt must not read GitHub');
        },
        isAncestor: () => false,
      }),
    /Invalid replacement/
  );
  assert.throws(() => fixture({ failClose: true }).run(), /close denied/);
});

const nightlyFiles =
  'docs/NIGHTLY_TESTING_AGENT_REPORT.md\napps/web/reports/nightly-agent/last-run.json';
const nightlyCandidate = () => ({
  ...candidate(),
  headRefName: 'bot/nightly-evidence-123-1',
});
const nightlyPR = () => ({
  ...pr(),
  title: 'chore(testing): refresh nightly testing evidence',
  head: { ...pr().head, ref: nightlyCandidate().headRefName },
});

test('nightly retirement closes only an older nightly report and preserves coverage', () => {
  const f = fixture({
    profile: 'nightly-evidence',
    candidates: [candidate(), nightlyCandidate()],
    first: nightlyPR(),
    files: nightlyFiles,
  });
  assert.deepEqual(f.run(), [1]);
  assert.equal(f.closed().length, 1);
  assert.equal(f.calls.filter(args => args.includes('--paginate')).length, 1);
});

test('coverage and nightly ownership cannot cross report namespaces, titles or files', () => {
  assert.deepEqual(
    fixture({
      candidates: [nightlyCandidate()],
      first: nightlyPR(),
      files: nightlyFiles,
    }).run(),
    []
  );
  assert.deepEqual(fixture({ profile: 'nightly-evidence' }).run(), []);
  for (const override of [
    { title: pr().title },
    { labels: [{ name: 'hold' }] },
    { draft: false },
    { head: { ...nightlyPR().head, sha: source } },
  ]) {
    const f = fixture({
      profile: 'nightly-evidence',
      candidates: [nightlyCandidate()],
      first: nightlyPR(),
      second: { ...nightlyPR(), ...override },
      files: nightlyFiles,
    });
    assert.deepEqual(f.run(), []);
  }
  for (const files of [reports, `${nightlyFiles}\nsource.ts`, '']) {
    assert.deepEqual(
      fixture({
        profile: 'nightly-evidence',
        candidates: [nightlyCandidate()],
        first: nightlyPR(),
        files,
      }).run(),
      []
    );
  }
  assert.throws(() => fixture({ profile: 'unknown' }).run(), /report profile/);
});
