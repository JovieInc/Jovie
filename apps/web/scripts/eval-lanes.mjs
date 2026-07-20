#!/usr/bin/env node
import { execFileSync, spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const webRoot = join(dirname(fileURLToPath(import.meta.url)), '..');
const manifestPath = join(webRoot, 'tests/eval/eval-lanes.json');
const LIVE_MARKERS = [
  'run-live-',
  'knowledge-accuracy.eval.ts',
  'golden-eval-set.real.test.ts',
  'vitest.config.real-eval.mts',
];
const LIVE_CREDENTIALS = [
  'AI_GATEWAY_API_KEY',
  'OPENAI_API_KEY',
  'ANTHROPIC_API_KEY',
  'XAI_API_KEY',
  'VERCEL_OIDC_TOKEN',
  'HELICONE_API_KEY',
];
const LIVE_FLAGS = [
  'JOVIE_RUN_LIVE_EVALS',
  'JOVIE_RUN_REAL_MODEL_EVALS',
  'JOVIE_RUN_LIVE_HTTP_EVALS',
  'JOVIE_RUN_LIVE_HTTP_RATE_LIMIT_EVALS',
  'JOVIE_RUN_LIVE_HTTP_MODEL_ERROR_EVALS',
];

export function loadEvalManifest() {
  return JSON.parse(readFileSync(manifestPath, 'utf8'));
}

export function discoverEvalFiles() {
  return execFileSync('git', ['ls-files'], { cwd: webRoot, encoding: 'utf8' })
    .trim()
    .split('\n')
    .filter(Boolean)
    .filter(
      path =>
        /^scripts\/run-.*eval.*\.sh$/.test(path) ||
        path === 'tests/eval/vitest.config.knowledge-live.mts' ||
        (/\.(?:test\.ts|eval\.ts)$/.test(path) &&
          (/^(?:lib\/eval|lib\/connectors\/eval)\//.test(path) ||
            /^lib\/chat\/tools\/.*-eval\.test\.ts$/.test(path) ||
            /^tests\/eval\//.test(path) ||
            /^tests\/unit\/.*\.eval\.test\.ts$/.test(path)))
    )
    .sort();
}

function isRecord(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function readStringArray(value, label, errors) {
  if (!Array.isArray(value)) {
    errors.push(`${label} must be an array`);
    return [];
  }
  return value.filter((entry, index) => {
    if (typeof entry === 'string' && entry.length > 0) return true;
    errors.push(`${label}[${index}] must be a non-empty string`);
    return false;
  });
}

function validateCommand(command, label, errors) {
  if (!Array.isArray(command) || command.length === 0) {
    errors.push(`${label} must be a non-empty array`);
    return false;
  }
  let valid = true;
  for (const [index, value] of command.entries()) {
    if (typeof value === 'string' && value.length > 0) continue;
    errors.push(`${label}[${index}] must be a non-empty string`);
    valid = false;
  }
  return valid;
}

export function validateEvalManifest(manifest = loadEvalManifest()) {
  const errors = [];
  if (!isRecord(manifest)) return ['manifest root must be an object'];
  if (manifest.schemaVersion !== 1) errors.push('schemaVersion must be 1');
  const deterministicLane = isRecord(manifest.deterministic)
    ? manifest.deterministic
    : undefined;
  const liveLane = isRecord(manifest.live) ? manifest.live : undefined;
  if (!deterministicLane) errors.push('deterministic lane must be an object');
  if (!liveLane) errors.push('live lane must be an object');

  const deterministicFiles = readStringArray(
    deterministicLane?.files,
    'deterministic.files',
    errors
  );
  const liveFiles = readStringArray(liveLane?.files, 'live.files', errors);
  const deterministic = new Set(deterministicFiles);
  const live = new Set(liveFiles);
  for (const path of deterministic) {
    if (live.has(path)) errors.push(`lane overlap: ${path}`);
  }
  const classified = new Set([...deterministic, ...live]);
  const discovered = discoverEvalFiles();
  for (const path of discovered) {
    if (!classified.has(path)) errors.push(`unclassified eval file: ${path}`);
  }
  for (const path of classified) {
    if (!discovered.includes(path)) errors.push(`missing eval file: ${path}`);
  }

  const deterministicCommands = Array.isArray(deterministicLane?.commands)
    ? deterministicLane.commands
    : [];
  if (!Array.isArray(deterministicLane?.commands)) {
    errors.push('deterministic.commands must be an array');
  } else {
    for (const [index, command] of deterministicCommands.entries()) {
      validateCommand(command, `deterministic.commands[${index}]`, errors);
    }
  }
  const serializedDeterministicCommands = JSON.stringify(deterministicCommands);
  for (const marker of LIVE_MARKERS) {
    if (serializedDeterministicCommands.includes(marker)) {
      errors.push(`deterministic command selects live path: ${marker}`);
    }
  }

  readStringArray(
    liveLane?.requiredOptInFlags,
    'live.requiredOptInFlags',
    errors
  );
  const liveCommands = Array.isArray(liveLane?.commands)
    ? liveLane.commands
    : [];
  if (!Array.isArray(liveLane?.commands)) {
    errors.push('live.commands must be an array');
  }
  const families = new Set();
  for (const [index, entry] of liveCommands.entries()) {
    if (!isRecord(entry)) {
      errors.push(`live.commands[${index}] must be an object`);
      continue;
    }
    if (typeof entry.family !== 'string' || entry.family.length === 0) {
      errors.push(`live.commands[${index}].family must be a non-empty string`);
    } else if (families.has(entry.family)) {
      errors.push(`duplicate live family: ${entry.family}`);
    } else {
      families.add(entry.family);
    }
    validateCommand(entry.command, `live.commands[${index}].command`, errors);
    if (entry.requiredEnvironment != null) {
      readStringArray(
        entry.requiredEnvironment,
        `live.commands[${index}].requiredEnvironment`,
        errors
      );
    }
  }
  return errors;
}

export function buildDeterministicEnvironment(sourceEnv = process.env) {
  for (const flag of LIVE_FLAGS) {
    if (sourceEnv[flag] === '1') {
      throw new Error(`Refusing deterministic eval lane with ${flag}=1`);
    }
  }
  const env = { ...sourceEnv };
  for (const flag of LIVE_FLAGS) env[flag] = '0';
  for (const credential of LIVE_CREDENTIALS) delete env[credential];
  return env;
}

function runCommands(commands, env) {
  for (const [command, ...args] of commands) {
    const result = spawnSync(command, args, {
      cwd: webRoot,
      env,
      stdio: 'inherit',
    });
    if (result.error) throw result.error;
    if (result.status !== 0) process.exit(result.status ?? 1);
  }
}

export function missingLivePrerequisites(manifest, env = process.env) {
  return manifest.live.commands.flatMap(entry =>
    (entry.requiredEnvironment ?? [])
      .filter(name => {
        const value = env[name];
        return (
          !value ||
          (name.startsWith('JOVIE_PROMPTFOO_EXPECT_') && value !== '1')
        );
      })
      .map(name => `${entry.family}:${name}`)
  );
}

export function runEvalLane(
  lane,
  {
    env = process.env,
    validateManifest = validateEvalManifest,
    executeCommands = runCommands,
  } = {}
) {
  const manifest = loadEvalManifest();
  if (lane === 'deterministic') {
    const errors = validateManifest(manifest);
    if (errors.length) throw new Error(errors.join('\n'));
    executeCommands(
      manifest.deterministic.commands,
      buildDeterministicEnvironment(env)
    );
    return;
  }
  if (lane === 'live') {
    const errors = validateManifest(manifest);
    if (errors.length) throw new Error(errors.join('\n'));
    const missing = manifest.live.requiredOptInFlags.filter(
      flag => env[flag] !== '1'
    );
    if (missing.length) {
      throw new Error(
        `Live eval lane is exhaustive and opt-in (Promptfoo all, all HTTP fault lanes, real-model, and knowledge accuracy); set all required flags to 1: ${missing.join(', ')}`
      );
    }
    const missingPrerequisites = missingLivePrerequisites(manifest, env);
    if (missingPrerequisites.length) {
      throw new Error(
        `Live eval prerequisites are missing; no commands were started: ${missingPrerequisites.join(', ')}`
      );
    }
    executeCommands(
      manifest.live.commands.map(entry => entry.command),
      env
    );
    return;
  }
  throw new Error('Usage: eval-lanes.mjs <deterministic|live|validate>');
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const lane = process.argv[2];
  if (lane === 'validate') {
    const errors = validateEvalManifest();
    if (errors.length) throw new Error(errors.join('\n'));
    console.log('Eval lane manifest is valid.');
  } else {
    runEvalLane(lane);
  }
}
