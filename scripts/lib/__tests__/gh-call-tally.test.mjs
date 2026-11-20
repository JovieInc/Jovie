import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import {
  chmodSync,
  copyFileSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import test from 'node:test';

const { load } = createRequire(import.meta.url)('js-yaml');
const root = resolve(import.meta.dirname, '../../..');
const WIRED = [
  ['lane-fix-relay.yml', ['rerun-unacquired', 'relay']],
  ['fleet-rules-evidence.yml', ['evidence', 'rerun']],
];

function stepsOf(file, job) {
  return load(readFileSync(resolve(root, '.github/workflows', file), 'utf8'))
    .jobs[job].steps;
}

test('every wired job starts and ends with the same gh call tally steps', () => {
  const starts = new Set();
  const reports = new Set();
  for (const [file, jobs] of WIRED)
    for (const job of jobs) {
      const steps = stepsOf(file, job);
      const start = steps.find(step => step.name === 'Count gh calls (start)');
      const report = steps.at(-1);
      assert.ok(start, `${file}:${job} has the start step`);
      assert.equal(
        report.name,
        'Report gh call tally',
        `${file}:${job} ends with the report`
      );
      assert.equal(report.if, 'always()');
      starts.add(start.run);
      reports.add(report.run);
    }
  assert.equal(starts.size, 1, 'one start script everywhere');
  assert.equal(reports.size, 1, 'one report script everywhere');
});

test('the tally counts gh invocations by token and reports github.token separately', () => {
  const steps = stepsOf('lane-fix-relay.yml', 'relay');
  const start = steps.find(step => step.name === 'Count gh calls (start)').run;
  const report = steps.at(-1).run;
  const dir = mkdtempSync(join(tmpdir(), 'gh-tally-'));
  try {
    const realBin = join(dir, 'real');
    mkdirSync(realBin);
    writeFileSync(
      join(realBin, 'gh'),
      '#!/usr/bin/env bash\necho "real gh $*"\n'
    );
    chmodSync(join(realBin, 'gh'), 0o755);
    const githubPath = join(dir, 'github_path');
    const githubEnv = join(dir, 'github_env');
    writeFileSync(githubPath, '');
    writeFileSync(githubEnv, '');
    const baseEnv = {
      PATH: `${realBin}:${process.env.PATH}`,
      RUNNER_TEMP: dir,
      GITHUB_PATH: githubPath,
      GITHUB_ENV: githubEnv,
      GITHUB_TOKEN_FOR_TALLY: 'ghs_github_token_value',
      GITHUB_WORKFLOW: 'Lane Fix Relay',
      GITHUB_JOB: 'relay',
    };
    const started = spawnSync('bash', ['-c', start], {
      env: baseEnv,
      encoding: 'utf8',
    });
    assert.equal(started.status, 0, started.stderr);
    const shimDir = readFileSync(githubPath, 'utf8').trim();
    const exported = Object.fromEntries(
      readFileSync(githubEnv, 'utf8')
        .trim()
        .split('\n')
        .map(line => line.split(/=(.*)/s).slice(0, 2))
    );
    const env = { ...baseEnv, ...exported, PATH: `${shimDir}:${baseEnv.PATH}` };
    // Run the wrapper the start step recorded. A literal command spawn is a
    // live-call hit even when PATH points at this local shim.
    const shim = join(shimDir, 'gh');
    const invoke = (token, ...args) =>
      spawnSync(shim, args, {
        env: { ...env, GH_TOKEN: token },
        encoding: 'utf8',
      });
    const viewed = invoke('ghs_github_token_value', 'pr', 'view', '1');
    assert.equal(viewed.status, 0, viewed.stderr);
    assert.equal(
      viewed.stdout.trim(),
      ['real', 'gh', 'pr', 'view', '1'].join(' ')
    );
    invoke('ghs_github_token_value', 'api', 'repos/o/r/issues');
    invoke('ghs_app_token_value', 'api', 'graphql');
    const reported = spawnSync('bash', ['-c', report], {
      env,
      encoding: 'utf8',
    });
    assert.equal(reported.status, 0, reported.stderr);
    assert.match(
      reported.stdout,
      /::notice title=gh-tally::workflow=Lane Fix Relay job=relay calls=3 github_token=2 other=1 top=/
    );
    assert.match(reported.stdout, /api repos\/o\/r\/issues:1/);
    // A job that made no gh call reports zero rather than failing.
    const empty = spawnSync('bash', ['-c', report], {
      env: { ...baseEnv, GH_CALL_TALLY_FILE: join(dir, 'none.tsv') },
      encoding: 'utf8',
    });
    assert.match(empty.stdout, /calls=0 github_token=0/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('the actual tally CLI uses the shared report ledger and never rates incomplete observations', () => {
  const dir = mkdtempSync(join(tmpdir(), 'gh-tally-cli-'));
  try {
    const bin = join(dir, 'bin');
    mkdirSync(bin);
    const gh = join(bin, 'gh');
    const calls = join(dir, 'calls');
    writeFileSync(
      gh,
      '#!/bin/sh\nprintf \'%s\\n\' "$*" >> "$TALLY_CALLS"\nprintf \'{"workflow_runs":[]}\'\n'
    );
    chmodSync(gh, 0o755);
    const env = {
      PATH: `${bin}:${process.env.PATH}`,
      GH_TOKEN: 'fixture-test-token',
      JOVIE_API_STATE_DIR: join(dir, 'ledger'),
      TALLY_CALLS: calls,
      GITHUB_REPOSITORY: 'JovieInc/Jovie',
    };
    const staged = join(dir, 'release');
    const paths = spawnSync(
      process.env.PYTHON3 || 'python3',
      [
        '-c',
        'import ast,json,pathlib; tree=ast.parse(pathlib.Path("scripts/lanes/lane_runner.py").read_text()); print(json.dumps(next(ast.literal_eval(n.value) for n in tree.body if isinstance(n,ast.Assign) and any(isinstance(t,ast.Name) and t.id=="RELEASE_EXTRAS" for t in n.targets))))',
      ],
      { cwd: root, encoding: 'utf8', timeout: 15000 }
    );
    assert.equal(paths.status, 0, paths.stderr);
    for (const relative of JSON.parse(paths.stdout)) {
      const destination = join(staged, relative);
      mkdirSync(dirname(destination), { recursive: true });
      copyFileSync(join(root, relative), destination);
    }
    const run = () =>
      spawnSync(
        process.execPath,
        ['scripts/lib/api-quota-report.mjs', 'tally', '--json'],
        {
          cwd: staged,
          env,
          encoding: 'utf8',
          timeout: 15000,
        }
      );
    const complete = run();
    assert.equal(complete.status, 0, complete.stderr);
    assert.ok(complete.stdout, JSON.stringify(complete));
    assert.deepEqual(JSON.parse(complete.stdout).rows, []);
    assert.equal(JSON.parse(complete.stdout).complete, true);
    const observed = readFileSync(calls, 'utf8').trim().split('\n');
    assert.equal(observed.length, 2);
    assert.ok(
      observed.every(line =>
        line.startsWith('api --include repos/JovieInc/Jovie/actions/workflows/')
      )
    );
    const ledger = readFileSync(
      join(dir, 'ledger/api-ledger/github.json'),
      'utf8'
    );
    assert.equal(JSON.parse(ledger).provider, 'github');
    assert.match(ledger, /"report"/);
    writeFileSync(
      gh,
      '#!/bin/sh\necho "private provider detail" >&2\nexit 1\n'
    );
    const failed = run();
    assert.equal(failed.status, 0, failed.stderr);
    assert.equal(JSON.parse(failed.stdout).complete, false);
    assert.equal(JSON.parse(failed.stdout).reason, 'read-failed');
    assert.deepEqual(JSON.parse(failed.stdout).rows, []);
    assert.doesNotMatch(failed.stdout, /private provider detail/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
