import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { expect, test } from 'vitest';
import {
  buildDeterministicEnvironment,
  discoverEvalFiles,
  loadEvalManifest,
  missingLivePrerequisites,
  runEvalLane,
  validateEvalManifest,
} from './eval-lanes.mjs';

const webRoot = join(dirname(fileURLToPath(import.meta.url)), '..');
const repoRoot = join(webRoot, '../..');

test('manifest classifies every eval test and script exactly once', () => {
  const manifest = loadEvalManifest();
  expect(validateEvalManifest(manifest)).toEqual([]);
  const deterministic = new Set(manifest.deterministic.files);
  const live = new Set(manifest.live.files);
  expect([...deterministic].filter(path => live.has(path))).toEqual([]);
  expect([...deterministic, ...live].sort()).toEqual(discoverEvalFiles());
});

test('discovery ignores git hook environment leaked into pre-push', () => {
  const expected = discoverEvalFiles();
  const absoluteGitDir = execFileSync(
    'git',
    ['rev-parse', '--absolute-git-dir'],
    { cwd: webRoot, encoding: 'utf8' }
  ).trim();
  const leakedNames = [
    'GIT_DIR',
    'GIT_WORK_TREE',
    'GIT_PREFIX',
    'GIT_INDEX_FILE',
  ];
  const previous = Object.fromEntries(
    leakedNames.map(name => [name, process.env[name]])
  );
  // Mirrors `git push` from a linked worktree: GIT_DIR points at the absolute
  // worktree gitdir and GIT_PREFIX is empty, which makes `git ls-files` print
  // repo-root-relative paths unless the variables are scrubbed.
  process.env.GIT_DIR = absoluteGitDir;
  process.env.GIT_PREFIX = '';
  delete process.env.GIT_WORK_TREE;
  delete process.env.GIT_INDEX_FILE;
  try {
    expect(discoverEvalFiles()).toEqual(expected);
  } finally {
    for (const name of leakedNames) {
      if (previous[name] === undefined) delete process.env[name];
      else process.env[name] = previous[name];
    }
  }
});

test('manifest validation rejects malformed lane and command structures', () => {
  expect(validateEvalManifest(null)).toEqual([
    'manifest root must be an object',
  ]);

  const malformedLanes = structuredClone(loadEvalManifest());
  malformedLanes.deterministic = null;
  malformedLanes.live = [];
  expect(validateEvalManifest(malformedLanes)).toEqual(
    expect.arrayContaining([
      'deterministic lane must be an object',
      'live lane must be an object',
      'deterministic.commands must be an array',
      'live.commands must be an array',
    ])
  );

  const malformedCommands = structuredClone(loadEvalManifest());
  malformedCommands.deterministic.commands = [['bash', 42]];
  malformedCommands.live.commands = [
    {
      family: '',
      command: 'pnpm',
      requiredEnvironment: ['AI_GATEWAY_API_KEY', false],
    },
  ];
  expect(validateEvalManifest(malformedCommands)).toEqual(
    expect.arrayContaining([
      'deterministic.commands[0][1] must be a non-empty string',
      'live.commands[0].family must be a non-empty string',
      'live.commands[0].command must be a non-empty array',
      'live.commands[0].requiredEnvironment[1] must be a non-empty string',
    ])
  );
});

test('deterministic commands contain no live entry point', () => {
  const commands = JSON.stringify(loadEvalManifest().deterministic.commands);
  expect(commands).not.toMatch(/run-live-|real-eval|knowledge-accuracy/);
});

test('deterministic environment disables live flags and strips credentials', () => {
  const env = buildDeterministicEnvironment({
    ...process.env,
    OPENAI_API_KEY: 'must-not-reach-child',
  });
  expect(env.JOVIE_RUN_LIVE_EVALS).toBe('0');
  expect(env.JOVIE_RUN_REAL_MODEL_EVALS).toBe('0');
  expect(env.OPENAI_API_KEY).toBeUndefined();
});

test('deterministic lane sanitizes the injected environment', () => {
  let executedEnvironment;
  runEvalLane('deterministic', {
    env: {
      JOVIE_EVAL_SENTINEL: 'preserved',
      OPENAI_API_KEY: 'must-not-reach-child',
    },
    validateManifest: () => [],
    executeCommands: (_commands, env) => {
      executedEnvironment = env;
    },
  });
  expect(executedEnvironment.JOVIE_EVAL_SENTINEL).toBe('preserved');
  expect(executedEnvironment.OPENAI_API_KEY).toBeUndefined();
});

test('exhaustive live lane runs each command family once', () => {
  const entries = loadEvalManifest().live.commands;
  const promptfoo = entries.filter(
    entry => entry.command[1] === 'scripts/run-live-promptfoo-evals.sh'
  );
  expect(promptfoo.map(entry => entry.command)).toEqual([
    ['bash', 'scripts/run-live-promptfoo-evals.sh', 'all'],
  ]);
  expect(new Set(entries.map(entry => entry.family)).size).toBe(entries.length);
});

test('knowledge live config selects exactly the knowledge accuracy file', () => {
  const configPath = join(
    webRoot,
    'tests/eval/vitest.config.knowledge-live.mts'
  );
  const source = readFileSync(configPath, 'utf8');
  expect(source).toMatch(
    /include: \['tests\/eval\/knowledge-accuracy\.eval\.ts']/
  );
  expect(source).not.toMatch(/tests\/eval\/\*\*/);
  const listed = execFileSync(
    'pnpm',
    [
      'exec',
      'vitest',
      'list',
      '--config=tests/eval/vitest.config.knowledge-live.mts',
    ],
    { cwd: webRoot, encoding: 'utf8' }
  );
  expect(listed).toMatch(/tests\/eval\/knowledge-accuracy\.eval\.ts/);
  expect(listed).not.toMatch(/golden-eval-set/);
});

test('fast Vitest config owns the eval-lane regression suite', () => {
  const defaultConfig = readFileSync(
    join(webRoot, 'vitest.config.mts'),
    'utf8'
  );
  expect(defaultConfig).toContain(
    "export { default } from './vitest.config.fast.mts';"
  );

  const fastConfig = readFileSync(
    join(webRoot, 'vitest.config.fast.mts'),
    'utf8'
  );
  const selectionStart = fastConfig.indexOf('test: {');
  const selectionEnd = fastConfig.indexOf('// Use forks');
  expect(selectionStart).toBeGreaterThanOrEqual(0);
  expect(selectionEnd).toBeGreaterThan(selectionStart);
  const selectionBlock = fastConfig.slice(selectionStart, selectionEnd);
  expect(selectionBlock).not.toMatch(/\binclude:/);
  expect(selectionBlock).not.toContain('scripts/eval-lanes.test.mjs');
});

test('affected selection cannot omit eval-lane coverage', () => {
  const planFor = changedFiles =>
    JSON.parse(
      execFileSync(
        process.execPath,
        [
          '--input-type=module',
          '--eval',
          `import { buildAffectedTestPlan } from './scripts/run-affected-tests.mjs'; console.log(JSON.stringify(buildAffectedTestPlan(${JSON.stringify(
            changedFiles
          )})))`,
        ],
        { cwd: repoRoot, encoding: 'utf8' }
      )
    );
  const testPlan = planFor(['apps/web/scripts/eval-lanes.test.mjs']);
  expect(testPlan.mode).toBe('selected');
  expect(testPlan.selectedTests).toContain(
    'apps/web/scripts/eval-lanes.test.mjs'
  );
  expect(planFor(['apps/web/scripts/eval-lanes.mjs']).mode).toBe('full');
});

test('live prerequisites fail closed before real-model commands can skip', () => {
  const manifest = loadEvalManifest();
  const env = Object.fromEntries(
    manifest.live.requiredOptInFlags.map(flag => [flag, '1'])
  );
  Object.assign(env, {
    JOVIE_PROMPTFOO_BASE_URL: 'http://127.0.0.1:3100',
    JOVIE_PROMPTFOO_EXPECT_MODEL_KEYS_DISABLED: '1',
    JOVIE_PROMPTFOO_EXPECT_REDIS_DISABLED: '1',
  });
  const missing = missingLivePrerequisites(manifest, env);
  expect(missing).toContain('real-model-golden:AI_GATEWAY_API_KEY');
  expect(missing).toContain('real-model-golden:HELICONE_API_KEY');

  let validationCalls = 0;
  let executionCalls = 0;
  expect(() =>
    runEvalLane('live', {
      env,
      validateManifest: () => {
        validationCalls += 1;
        return [];
      },
      executeCommands: () => {
        executionCalls += 1;
      },
    })
  ).toThrow(
    /no commands were started:.*real-model-golden:AI_GATEWAY_API_KEY.*real-model-golden:HELICONE_API_KEY/
  );
  expect(validationCalls).toBe(1);
  expect(executionCalls).toBe(0);
});

test('live lane validates the manifest before reading opt-in metadata', () => {
  expect(() =>
    runEvalLane('live', {
      env: {},
      validateManifest: () => ['invalid live manifest'],
    })
  ).toThrow('invalid live manifest');
});

test('live lane refuses to run without every explicit opt-in', () => {
  const flags = loadEvalManifest().live.requiredOptInFlags;
  const previous = Object.fromEntries(
    flags.map(flag => [flag, process.env[flag]])
  );
  for (const flag of flags) delete process.env[flag];
  try {
    let validationCalls = 0;
    let executionCalls = 0;
    expect(() =>
      runEvalLane('live', {
        validateManifest: () => {
          validationCalls += 1;
          return [];
        },
        executeCommands: () => {
          executionCalls += 1;
        },
      })
    ).toThrow(/Live eval lane is exhaustive and opt-in/);
    expect(validationCalls).toBe(1);
    expect(executionCalls).toBe(0);
  } finally {
    for (const flag of flags) {
      if (previous[flag] === undefined) delete process.env[flag];
      else process.env[flag] = previous[flag];
    }
  }
});

test('deterministic lane refuses an enabled live flag before spawning', () => {
  const previous = process.env.JOVIE_RUN_LIVE_EVALS;
  process.env.JOVIE_RUN_LIVE_EVALS = '1';
  try {
    expect(() => runEvalLane('deterministic')).toThrow(
      /Refusing deterministic eval lane/
    );
  } finally {
    if (previous === undefined) delete process.env.JOVIE_RUN_LIVE_EVALS;
    else process.env.JOVIE_RUN_LIVE_EVALS = previous;
  }
});
