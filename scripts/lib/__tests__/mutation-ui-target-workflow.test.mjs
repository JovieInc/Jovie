import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import { runInNewContext } from 'node:vm';
import { afterEach, describe, expect, it } from 'vitest';

const REPO_ROOT = resolve(import.meta.dirname, '..', '..', '..');
const fullWorkflow = readFileSync(
  resolve(REPO_ROOT, '.github/workflows/mutation-diff.yml'),
  'utf8'
);
const { load } = createRequire(import.meta.url)('js-yaml');
const fixtureRoots = [];
afterEach(() => {
  for (const root of fixtureRoots.splice(0))
    rmSync(root, { recursive: true, force: true });
});

describe('targeted UI mutation recovery', () => {
  const target = 'packages/ui/atoms/form.tsx';
  const uiSteps = () => load(fullWorkflow).jobs.sweep.steps;
  const fixture = () => {
    const root = mkdtempSync(resolve(tmpdir(), 'mutation-ui-workflow-'));
    fixtureRoots.push(root);
    const put = (path, text, mode) => {
      const file = resolve(root, path);
      mkdirSync(resolve(file, '..'), { recursive: true });
      writeFileSync(file, text, mode ? { mode } : undefined);
      return file;
    };
    for (const name of [
      'form.tsx',
      'badge.tsx',
      'form.test.tsx',
      'form.spec.tsx',
      'form.stories.tsx',
      'types.d.ts',
    ])
      put(`packages/ui/atoms/${name}`, 'export const fixture = true;');
    expect(spawnSync('git', ['init', '--quiet'], { cwd: root }).status).toBe(0);
    expect(spawnSync('git', ['add', '.'], { cwd: root }).status).toBe(0);
    const env = {
      ...process.env,
      GIT_AUTHOR_DATE: '2000-01-01T00:00:00Z',
      GIT_COMMITTER_DATE: '2000-01-01T00:00:00Z',
    };
    expect(
      spawnSync(
        'git',
        [
          '-c',
          'user.name=fixture',
          '-c',
          'user.email=fixture@example.invalid',
          'commit',
          '--quiet',
          '-m',
          'fixture',
        ],
        { cwd: root, env }
      ).status
    ).toBe(0);
    const sha = spawnSync('git', ['rev-parse', 'HEAD'], {
      cwd: root,
      encoding: 'utf8',
    }).stdout.trim();
    put('packages/ui/atoms/untracked.tsx', 'export const untracked = true;');
    return { root, put, sha };
  };
  const shell = (command, root, env = {}) =>
    spawnSync('bash', ['-e', '-o', 'pipefail', '-c', command], {
      cwd: root,
      encoding: 'utf8',
      env: { ...process.env, ...env },
    });
  const outputs = path =>
    Object.fromEntries(
      readFileSync(path, 'utf8')
        .trim()
        .split('\n')
        .filter(Boolean)
        .map(line => line.split('='))
    );

  it('admits UI only through validated trusted-main dispatch targets', () => {
    const doc = load(fullWorkflow);
    expect(doc.on.workflow_dispatch.inputs.mode.options).toContain('ui');
    const sweep = doc.jobs.sweep.steps;
    const scope = sweep.find(step => step.id === 'ui_scope');
    expect(scope).toBeDefined();
    expect(scope.if).toContain("github.event_name == 'workflow_dispatch'");
    expect(scope.if).toContain("inputs.mode == 'ui'");
    expect(sweep.indexOf(scope)).toBeGreaterThan(
      sweep.findIndex(step => step.name === 'Checkout main')
    );
    expect(sweep.indexOf(scope)).toBeLessThan(
      sweep.findIndex(step => step.id === 'capacity')
    );
    expect(scope.env.INPUT_FILES).toContain('inputs.files');
    expect(scope.env.INPUT_MAX_FILES).toContain('inputs.max_files');
    const score = sweep.find(step => step.id === 'score');
    expect(score.env.UI_ONLY).toContain("inputs.mode == 'ui'");
    expect(score.env.UI_INCLUDE).toContain('steps.ui_scope.outputs.include');
    expect(score.env.UI_INCLUDE).toContain('packages/ui/');
    expect(score.env.MODE).toContain("inputs.mode == 'ui'");
    expect(score.env.MODE).toContain("'sweep'");
    expect(score.env.MAX_FILES).toContain('steps.ui_scope.outputs.max_files');
    const chain = sweep.find(step => step.name === 'Chain the next batch');
    const chainCondition = chain.if.replace(/^\$\{\{\s*|\s*\}\}$/gu, '');
    expect(
      runInNewContext(chainCondition, {
        github: { event_name: 'workflow_dispatch' },
        inputs: { mode: 'ui' },
        steps: { score: { outputs: { remaining: '100', scored: '1' } } },
      })
    ).toBe(false);
    const { root, put } = fixture();
    const output = put('scope-output', '');
    const input = `${target} packages/ui/atoms/badge.tsx`;
    const result = shell(scope.run, root, {
      INPUT_FILES: input,
      INPUT_MAX_FILES: '6',
      GITHUB_OUTPUT: output,
    });
    expect(result.status, result.stderr).toBe(0);
    expect(outputs(output).include.split(',').sort()).toEqual(
      input.split(' ').sort()
    );
    expect(outputs(output).max_files).toBe('2');
  });

  it.each([
    '',
    'atoms/form.tsx',
    'apps/web/lib/auth/policy.ts',
    'packages/ui/atoms/',
    'packages/ui/atoms/form',
    'packages/ui/atoms/../atoms/form.tsx',
    'packages/ui/atoms/form.test.tsx',
    'packages/ui/atoms/form.spec.tsx',
    'packages/ui/atoms/form.stories.tsx',
    'packages/ui/atoms/types.d.ts',
    'packages/ui/atoms/untracked.tsx',
    'packages/ui/atoms/missing.tsx',
    'packages/ui/atoms/form.tsx;touch injected',
  ])('rejects unsafe or ambiguous target %j before scoring', input => {
    const scope = uiSteps().find(step => step.id === 'ui_scope');
    expect(scope).toBeDefined();
    const { root, put } = fixture();
    const output = put('scope-output', '');
    const result = shell(scope.run, root, {
      INPUT_FILES: input,
      INPUT_MAX_FILES: '1',
      GITHUB_OUTPUT: output,
    });
    expect(result.status, result.stderr).not.toBe(0);
    expect(outputs(output).include).toBeUndefined();
    expect(existsSync(resolve(root, 'injected'))).toBe(false);
  });

  it('rejects a tracked runtime filename that would widen the include prefix', () => {
    const scope = uiSteps().find(step => step.id === 'ui_scope');
    expect(scope).toBeDefined();
    const { root, put } = fixture();
    put(`${target}-other.tsx`, 'export const other = true;');
    expect(spawnSync('git', ['add', '.'], { cwd: root }).status).toBe(0);
    const output = put('scope-output', '');
    expect(
      shell(scope.run, root, {
        INPUT_FILES: target,
        INPUT_MAX_FILES: '1',
        GITHUB_OUTPUT: output,
      }).status
    ).not.toBe(0);
    expect(outputs(output).include).toBeUndefined();
  });

  it.each(['0', '-1', '1.5', '9007199254740992', 'not-a-number'])(
    'rejects invalid UI file budget %s',
    max => {
      const scope = uiSteps().find(step => step.id === 'ui_scope');
      expect(scope).toBeDefined();
      const { root, put } = fixture();
      const output = put('scope-output', '');
      expect(
        shell(scope.run, root, {
          INPUT_FILES: target,
          INPUT_MAX_FILES: max,
          GITHUB_OUTPUT: output,
        }).status
      ).not.toBe(0);
      expect(outputs(output)).toEqual({});
    }
  );

  it.each([0, 1, 'held', 'rolling'])(
    'keeps bounded routing and canonical publication for %s',
    outcome => {
      const uiOnly = outcome !== 'rolling';
      const sweep = uiSteps();
      const score = sweep.find(step => step.id === 'score');
      const { root, put, sha } = fixture();
      const home = resolve(root, 'home');
      const runnerTemp = resolve(root, 'temp');
      mkdirSync(runnerTemp);
      const output = put('output', '');
      const summary = put('summary', '');
      const calls = put('calls', '');
      const gitCalls = put('git-calls', '');
      const stateFile = '.cache/jovie-mutation/sweep-state.json';
      const original = JSON.stringify({
        schemaVersion: 1,
        modules: { preserved: { status: 'unknown', score: null } },
        highWater: { preserved: 'anchor' },
      });
      put(stateFile, original);
      put(
        'bin/git',
        '#!/bin/sh\nprintf "%s\\n" "$*" >> "$GIT_CALLS"\nif [ "$1" = rev-parse ]; then printf "%s\\n" "$TEST_SHA"; fi\n',
        0o755
      );
      put(
        'bin/node',
        `#!${process.execPath}
import { appendFileSync, readFileSync, writeFileSync } from 'node:fs';
const args = process.argv.slice(2);
appendFileSync(process.env.CALLS, JSON.stringify(args) + '\\n');
const arg = flag => args[args.indexOf(flag) + 1];
if (args[0] === 'scripts/mutation-sweep.mjs') {
  const path = arg('--state');
  const state = JSON.parse(readFileSync(path, 'utf8'));
  state.modules['packages/ui/atoms/form.tsx'] = { status: 'unknown', score: null, error: 'fixture: no mutation execution' };
  writeFileSync(path, JSON.stringify(state));
  appendFileSync(path + '.runs.jsonl', '{"status":"unknown","ratchet":"unknown"}\\n');
  if (args.includes('--propose-baseline')) writeFileSync(arg('--propose-baseline'), '{}');
  process.exit(Number(process.env.UI_EXIT));
}
if (args[0] === 'scripts/test-quality-loop.mjs' && args[1] === 'report') writeFileSync(arg('--out'), '{"evidenceKind":"fixture"}');
`,
        0o755
      );
      const env = {
        HOME: home,
        RUNNER_TEMP: runnerTemp,
        GITHUB_OUTPUT: output,
        GITHUB_STEP_SUMMARY: summary,
        PATH: `${resolve(root, 'bin')}:${process.env.PATH}`,
        CALLS: calls,
        GIT_CALLS: gitCalls,
        UI_ONLY: String(uiOnly),
        UI_INCLUDE: uiOnly ? target : 'packages/ui/',
        MODE: 'sweep',
        MAX_FILES: '1',
        UI_EXIT: String(outcome === 1 ? 1 : 0),
        CI: 'true',
        STRYKER_CONCURRENCY: '1',
        MUTATION_MAX_LOAD: '8',
        SCORE_BODY: score.run,
        TEST_SHA: sha,
        SCORE_SHA: sha,
        GITHUB_RUN_ID: '901',
        GITHUB_RUN_ATTEMPT: '2',
      };
      const command =
        outcome === 'held'
          ? 'mkdir -p "$HOME/.local/state/jovie-mutation"; exec 8>"$HOME/.local/state/jovie-mutation/sweep.lock"; flock -n 8; bash -e -o pipefail -c "$SCORE_BODY"'
          : score.run;
      const result = shell(command, root, env);
      expect(result.status, result.stderr).toBe(outcome === 1 ? 1 : 0);
      const invocations = readFileSync(calls, 'utf8')
        .trim()
        .split('\n')
        .filter(Boolean)
        .map(line => JSON.parse(line));
      const admitted = outputs(output);
      const snapshot = sweep.find(step => step.id === 'snapshot');
      const save = sweep.find(step => step.name === 'Save sweep state');
      expect(sweep.indexOf(snapshot)).toBeLessThan(sweep.indexOf(save));
      expect(save.if).toContain("steps.snapshot.outcome == 'success'");
      for (const name of [
        'Save sweep state',
        'Snapshot sweep state and survivor tasks',
        'Prepare survivor issue drafts',
      ]) {
        const step = sweep.find(candidate => candidate.name === name);
        const condition = step.if
          .replace(/^\$\{\{\s*|\s*\}\}$/gu, '')
          .replace(/steps\.([\w-]+)/gu, 'steps["$1"]');
        expect(
          runInNewContext(condition, {
            always: () => true,
            hashFiles: () => 'state-digest',
            steps: {
              capacity: { outputs: { run: 'true' } },
              portable_state: { outcome: 'success' },
              snapshot: { outcome: outcome === 'held' ? 'skipped' : 'success' },
              score: {
                outputs: admitted,
                outcome: outcome === 1 ? 'failure' : 'success',
              },
            },
          })
        ).toBe(outcome !== 'held');
      }
      if (outcome === 'held') {
        expect(invocations).toEqual([]);
        expect(admitted.admitted).toBeUndefined();
        expect(readFileSync(resolve(root, stateFile), 'utf8')).toBe(original);
        expect(result.stdout).toContain('Another sweep holds');
        return;
      }
      const mutation = invocations.filter(
        args => args[0] === 'scripts/mutation-sweep.mjs'
      );
      expect(mutation).toHaveLength(uiOnly ? 1 : 2);
      const arg = flag => mutation[0][mutation[0].indexOf(flag) + 1];
      expect(arg('--include')).toBe(env.UI_INCLUDE);
      expect(arg('--state')).toBe(stateFile);
      expect(arg('--max-files')).toBe('1');
      expect(arg('--max-minutes')).toBe('10');
      expect(arg('--file-timeout-minutes')).toBe('5');
      if (uiOnly)
        expect(arg('--propose-baseline')).toBe(
          resolve(runnerTemp, 'baseline-proposal.json')
        );
      else {
        expect(mutation[0]).not.toContain('--propose-baseline');
        expect(mutation[1]).not.toContain('--include');
        const webArg = flag => mutation[1][mutation[1].indexOf(flag) + 1];
        expect(webArg('--state')).toBe(stateFile);
        expect(webArg('--max-minutes')).toBe('75');
        expect(webArg('--github-output')).toBe(output);
        expect(webArg('--propose-baseline')).toBe(
          resolve(runnerTemp, 'baseline-proposal.json')
        );
      }
      expect(mutation[0]).not.toContain('--github-output');
      for (const command of ['rank', 'model-check'])
        expect(invocations.some(args => args[1] === command)).toBe(!uiOnly);
      expect(invocations.some(args => args[0].includes('api-client'))).toBe(
        false
      );
      expect(readFileSync(gitCalls, 'utf8').includes('fetch')).toBe(!uiOnly);
      expect(admitted).toEqual({ admitted: 'true', sha });
      const measured = JSON.parse(
        readFileSync(resolve(root, stateFile), 'utf8')
      );
      expect(measured.modules[target]).toMatchObject({
        status: 'unknown',
        score: null,
      });
      expect(measured.highWater).toEqual({ preserved: 'anchor' });
      put(
        '.cache/jovie-mutation/survivor-drafts.json',
        '{"drafts":[],"evidenceKind":"fixture"}'
      );
      expect(snapshot.env.SCORE_SHA).toContain('steps.score.outputs.sha');
      for (const key of ['UI_ONLY', 'UI_INCLUDE', 'MAX_FILES'])
        expect(snapshot.env[key]).toBe(score.env[key]);
      const snapshotEnv = {
        ...env,
        PATH: `${resolve(process.execPath, '..')}:${process.env.PATH}`,
      };
      const snap = shell(snapshot.run, root, snapshotEnv);
      expect(snap.status, snap.stderr).toBe(0);
      for (const name of [
        'sweep-state.json',
        'sweep-state.json.runs.jsonl',
        'survivor-drafts.json',
      ])
        expect(readFileSync(resolve(runnerTemp, 'sweep-out', name))).toEqual(
          readFileSync(resolve(root, '.cache/jovie-mutation', name))
        );
      expect(
        readFileSync(
          resolve(runnerTemp, 'sweep-out/baseline-proposal.json'),
          'utf8'
        )
      ).toBe('{}');
      const hash = name =>
        createHash('sha256')
          .update(readFileSync(resolve(runnerTemp, 'sweep-out', name)))
          .digest('hex');
      const receipt = JSON.parse(
        readFileSync(
          resolve(runnerTemp, 'sweep-out/producer-receipt.json'),
          'utf8'
        )
      );
      expect(receipt).toMatchObject({
        schema: 'jovie.mutation-producer-receipt/v1',
        sha,
        runId: '901',
        runAttempt: '2',
        cacheKey: 'mutation-sweep-portable-v2-901-2',
        scope: {
          kind: uiOnly ? 'ui' : 'rolling',
          include: env.UI_INCLUDE,
          maxFiles: 1,
        },
        runtime: { node: process.versions.node },
        stateSha256: hash('sweep-state.json'),
        attemptsSha256: hash('sweep-state.json.runs.jsonl'),
      });
      if (outcome === 0) {
        rmSync(resolve(root, `${stateFile}.runs.jsonl`));
        rmSync(resolve(runnerTemp, 'sweep-out'), { recursive: true });
        expect(shell(snapshot.run, root, snapshotEnv).status).toBe(0);
        const withoutLog = JSON.parse(
          readFileSync(
            resolve(runnerTemp, 'sweep-out/producer-receipt.json'),
            'utf8'
          )
        );
        expect(withoutLog.attemptsSha256).toBeNull();
      }
      expect(
        shell(snapshot.run, root, { ...snapshotEnv, SCORE_SHA: 'f'.repeat(40) })
          .status
      ).not.toBe(0);
    }
  );
});
