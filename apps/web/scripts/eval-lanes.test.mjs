import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import {
  buildDeterministicEnvironment,
  discoverEvalFiles,
  loadEvalManifest,
  missingLivePrerequisites,
  runEvalLane,
  validateEvalManifest,
} from './eval-lanes.mjs';

const webRoot = join(dirname(fileURLToPath(import.meta.url)), '..');

test('manifest classifies every eval test and script exactly once', () => {
  const manifest = loadEvalManifest();
  assert.deepEqual(validateEvalManifest(manifest), []);
  const deterministic = new Set(manifest.deterministic.files);
  const live = new Set(manifest.live.files);
  assert.deepEqual(
    [...deterministic].filter(path => live.has(path)),
    []
  );
  assert.deepEqual([...deterministic, ...live].sort(), discoverEvalFiles());
});

test('deterministic commands contain no live entry point', () => {
  const commands = JSON.stringify(loadEvalManifest().deterministic.commands);
  assert.doesNotMatch(commands, /run-live-|real-eval|knowledge-accuracy/);
});

test('deterministic environment disables live flags and strips credentials', () => {
  const previous = process.env.OPENAI_API_KEY;
  process.env.OPENAI_API_KEY = 'must-not-reach-child';
  try {
    const env = buildDeterministicEnvironment();
    assert.equal(env.JOVIE_RUN_LIVE_EVALS, '0');
    assert.equal(env.JOVIE_RUN_REAL_MODEL_EVALS, '0');
    assert.equal(env.OPENAI_API_KEY, undefined);
  } finally {
    if (previous === undefined) delete process.env.OPENAI_API_KEY;
    else process.env.OPENAI_API_KEY = previous;
  }
});

test('exhaustive live lane runs each command family once', () => {
  const entries = loadEvalManifest().live.commands;
  const promptfoo = entries.filter(
    entry => entry.command[1] === 'scripts/run-live-promptfoo-evals.sh'
  );
  assert.deepEqual(
    promptfoo.map(entry => entry.command),
    [['bash', 'scripts/run-live-promptfoo-evals.sh', 'all']]
  );
  assert.equal(
    new Set(entries.map(entry => entry.family)).size,
    entries.length
  );
});

test('knowledge live config selects exactly the knowledge accuracy file', () => {
  const configPath = join(
    webRoot,
    'tests/eval/vitest.config.knowledge-live.mts'
  );
  const source = readFileSync(configPath, 'utf8');
  assert.match(
    source,
    /include: \['tests\/eval\/knowledge-accuracy\.eval\.ts']/
  );
  assert.doesNotMatch(source, /tests\/eval\/\*\*/);
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
  assert.match(listed, /tests\/eval\/knowledge-accuracy\.eval\.ts/);
  assert.doesNotMatch(listed, /golden-eval-set/);
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
  assert.ok(missing.includes('real-model-golden:AI_GATEWAY_API_KEY'));
  assert.ok(missing.includes('real-model-golden:HELICONE_API_KEY'));

  let validationCalls = 0;
  let executionCalls = 0;
  assert.throws(
    () =>
      runEvalLane('live', {
        env,
        validateManifest: () => {
          validationCalls += 1;
          return [];
        },
        executeCommands: () => {
          executionCalls += 1;
        },
      }),
    /no commands were started:.*real-model-golden:AI_GATEWAY_API_KEY.*real-model-golden:HELICONE_API_KEY/
  );
  assert.equal(validationCalls, 0);
  assert.equal(executionCalls, 0);
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
    assert.throws(
      () =>
        runEvalLane('live', {
          validateManifest: () => {
            validationCalls += 1;
            return [];
          },
          executeCommands: () => {
            executionCalls += 1;
          },
        }),
      /Live eval lane is exhaustive and opt-in/
    );
    assert.equal(validationCalls, 0);
    assert.equal(executionCalls, 0);
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
    assert.throws(
      () => runEvalLane('deterministic'),
      /Refusing deterministic eval lane/
    );
  } finally {
    if (previous === undefined) delete process.env.JOVIE_RUN_LIVE_EVALS;
    else process.env.JOVIE_RUN_LIVE_EVALS = previous;
  }
});
