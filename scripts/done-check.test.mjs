// Done means seen working on production (Tim 2026-11-22): pins each of the
// four conditions, and that an unreadable source is never read as done.
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { doneCheck, screenshotFile } from './done-check.mjs';

const MERGE = 'a'.repeat(40);
const SERVED = 'b'.repeat(40);
const OLD = 'c'.repeat(40);

function world(over = {}) {
  const state = {
    pull: { merged_at: '2026-11-22T10:00:00Z', merge_commit_sha: MERGE },
    served: SERVED,
    compare: { [`${MERGE}...${SERVED}`]: 'ahead', [`${MERGE}...${OLD}`]: 'behind' },
    runs: [{ id: 7, head_sha: SERVED, conclusion: 'success', html_url: 'https://github.com/JovieInc/Jovie/actions/runs/7' }],
    artifacts: [{ id: 9, name: 'pen-golden-path-pairs-7', size_in_bytes: 10, expired: false }],
    fail: '',
    ...over,
  };
  const gh = async url => {
    if (state.fail && url.includes(state.fail)) throw new Error('GitHub 502');
    if (url.includes('/pulls/')) return state.pull;
    if (url.includes('/compare/')) return { status: state.compare[url.split('/compare/')[1]] ?? 'diverged' };
    if (url.includes('/workflows/')) return { workflow_runs: state.runs };
    if (url.includes('/artifacts')) return { artifacts: state.artifacts };
    throw new Error(`unexpected ${url}`);
  };
  return { gh, served: async () => ({ sha: state.served }) };
}

test('merged, deployed, probes green and screenshots kept is done', async () => {
  const verdict = await doneCheck({ pr: 1 }, world());
  assert.equal(verdict.status, 'done');
  assert.equal(verdict.screenshotUrl, 'https://github.com/JovieInc/Jovie/actions/runs/7/artifacts/9');
});

test('an unmerged PR is not done', async () => {
  const verdict = await doneCheck({ pr: 1 }, world({ pull: { merged_at: null, merge_commit_sha: null } }));
  assert.equal(verdict.status, 'not-done');
  assert.deepEqual(verdict.reasons, ['not merged']);
});

test('merged but production still serves an older build is not done', async () => {
  const verdict = await doneCheck({ pr: 1 }, world({ served: OLD, runs: [] }));
  assert.equal(verdict.status, 'not-done');
  assert.equal(verdict.deployed, false);
  assert.match(verdict.reasons.join(' '), /does not contain the merge/);
});

test('a red probe run on a build with the merge is not done and names the run', async () => {
  const verdict = await doneCheck({ pr: 1 }, world({ runs: [{ id: 7, head_sha: SERVED, conclusion: 'failure', html_url: 'u7' }] }));
  assert.equal(verdict.status, 'not-done');
  assert.equal(verdict.outcome, false);
  assert.match(verdict.reasons.join(' '), /concluded failure: u7/);
});

test('a probe run on a build without the merge does not count', async () => {
  const verdict = await doneCheck({ pr: 1 }, world({ runs: [{ id: 6, head_sha: OLD, conclusion: 'success', html_url: 'u6' }] }));
  assert.equal(verdict.outcome, false);
  assert.match(verdict.reasons.join(' '), /no Post-Deploy Probes run/);
});

test('no screenshot is not done, and an agent capture fills it only when it is a real image', async () => {
  const bare = world({ artifacts: [] });
  assert.equal((await doneCheck({ pr: 1 }, bare)).status, 'not-done');
  const dir = mkdtempSync(path.join(tmpdir(), 'done-check-'));
  try {
    const png = path.join(dir, 'prod.png');
    writeFileSync(png, Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a]));
    const text = path.join(dir, 'prod.txt');
    writeFileSync(text, 'not an image');
    assert.equal(screenshotFile(text), false);
    assert.equal((await doneCheck({ pr: 1, screenshot: text }, bare)).status, 'not-done');
    const verdict = await doneCheck({ pr: 1, screenshot: png }, bare);
    assert.equal(verdict.status, 'done');
    assert.equal(verdict.screenshotFile, png);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('an unreadable source is unknown, never done', async () => {
  for (const fail of ['/pulls/', '/workflows/', '/artifacts']) {
    const verdict = await doneCheck({ pr: 1 }, world({ fail }));
    assert.equal(verdict.status, 'unknown', fail);
  }
  const down = { ...world(), served: async () => { throw new Error('build-info HTTP 503'); } };
  assert.equal((await doneCheck({ pr: 1 }, down)).status, 'unknown');
});
