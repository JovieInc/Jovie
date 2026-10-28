import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, it } from 'node:test';
import { checkRunnerPins } from './workflow-runner-pin-check.mjs';

function fixture(workflows, allow = []) {
  const dir = mkdtempSync(path.join(tmpdir(), 'pins-'));
  mkdirSync(path.join(dir, 'wf'));
  for (const [name, text] of Object.entries(workflows))
    writeFileSync(path.join(dir, 'wf', name), text);
  const allowlistPath = path.join(dir, 'allow.json');
  writeFileSync(allowlistPath, JSON.stringify({ jobs: allow }));
  return { workflowsDir: path.join(dir, 'wf'), allowlistPath };
}

describe('workflow runner pins', () => {
  it('passes explicit images', () => {
    assert.deepEqual(
      checkRunnerPins(
        fixture({
          'a.yml': 'jobs:\n  x:\n    runs-on: ubuntu-24.04\n    steps: []\n',
        })
      ),
      []
    );
  });
  it('fails a new floating job', () => {
    const errors = checkRunnerPins(
      fixture({
        'a.yml': 'jobs:\n  x:\n    runs-on: ubuntu-latest\n    steps: []\n',
      })
    );
    assert.match(errors[0], /a\.yml#x uses floating ubuntu-latest/);
  });
  it('detects floating images in expressions and matrices', () => {
    const errors = checkRunnerPins(
      fixture({
        'a.yml':
          "jobs:\n  x:\n    runs-on: ${{ cond && 'macos-15' || 'ubuntu-latest' }}\n    steps: []\n  y:\n    runs-on: ${{ matrix.os }}\n    strategy:\n      matrix:\n        os: [ubuntu-latest, macos-latest]\n    steps: []\n",
      })
    );
    assert.equal(errors.length, 2);
  });
  it('allows an allowlisted non-Playwright job but flags a stale entry', () => {
    const files = {
      'a.yml': 'jobs:\n  x:\n    runs-on: ubuntu-latest\n    steps: []\n',
    };
    assert.deepEqual(checkRunnerPins(fixture(files, ['a.yml#x'])), []);
    const stale = checkRunnerPins(
      fixture(
        { 'a.yml': 'jobs:\n  x:\n    runs-on: ubuntu-24.04\n    steps: []\n' },
        ['a.yml#x']
      )
    );
    assert.match(stale[0], /no longer floats/);
  });
  it('never allows a floating Playwright job, even if allowlisted', () => {
    const errors = checkRunnerPins(
      fixture(
        {
          'a.yml':
            'jobs:\n  x:\n    runs-on: ubuntu-latest\n    steps:\n      - uses: ./.github/actions/setup-playwright\n',
        },
        ['a.yml#x']
      )
    );
    assert.match(errors[0], /runs Playwright on floating ubuntu-latest/);
  });
  it('does not match unrelated names', () => {
    assert.deepEqual(
      checkRunnerPins(
        fixture({
          'a.yml':
            'env:\n  R: github-ubuntu-latest\njobs:\n  x:\n    runs-on: ubuntu-24.04\n    steps: []\n',
        })
      ),
      []
    );
  });
});
