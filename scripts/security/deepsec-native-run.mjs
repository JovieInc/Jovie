import { spawn, spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import {
  existsSync,
  lstatSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  realpathSync,
  writeFileSync,
} from 'node:fs';
import { join } from 'node:path';
import {
  admitSubscription,
  subscriptionEnvironment,
  subscriptionPlan,
  subscriptionReceipt,
} from './deepsec-subscription.mjs';

// Linux process groups bound the scanner and its native SDK descendants.
// Timeout or output overflow kills the group instead of leaving a paid/API
// fallback or an orphaned subscription request running in the background.
export function boundedNativeCommand(
  command,
  { cwd, env, timeoutMs, maxOutputBytes = 1024 * 1024 }
) {
  if (
    !Number.isSafeInteger(timeoutMs) ||
    timeoutMs < 1 ||
    !Number.isSafeInteger(maxOutputBytes) ||
    maxOutputBytes < 1
  )
    throw new Error('bounded native execution limits required');
  return new Promise(resolve => {
    const child = spawn(command[0], command.slice(1), {
      cwd,
      env,
      detached: true,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let stdout = '',
      stderr = '',
      bytes = 0,
      error;
    const killGroup = () => {
      if (!child.pid) return;
      try {
        process.kill(-child.pid, 'SIGKILL');
      } catch (failure) {
        if (failure.code !== 'ESRCH') error ??= failure;
      }
    };
    const timer = setTimeout(() => {
      error ??= new Error('native command timed out');
      killGroup();
    }, timeoutMs);
    const collect = target => chunk => {
      bytes += chunk.length;
      if (bytes > maxOutputBytes) {
        error ??= new Error('native command output exceeded its bound');
        clearTimeout(timer);
        killGroup();
        return;
      }
      if (target === 'stdout') stdout += chunk.toString('utf8');
      else stderr += chunk.toString('utf8');
    };
    child.stdout.on('data', collect('stdout'));
    child.stderr.on('data', collect('stderr'));
    child.on('error', failure => {
      error ??= failure;
    });
    child.on('close', (status, signal) => {
      clearTimeout(timer);
      killGroup();
      resolve({ status, signal, stdout, stderr, error });
    });
  });
}

function git(sourceRoot, args) {
  const result = spawnSync('git', ['-C', sourceRoot, ...args], {
    env: subscriptionEnvironment(process.env),
    encoding: 'utf8',
    timeout: 30_000,
    maxBuffer: 1024 * 1024,
  });
  if (result.status !== 0)
    throw new Error('native scanner source identity unavailable');
  return result.stdout.trim();
}

export function nativeSourceState(sourceRoot, files) {
  if (
    !lstatSync(join(sourceRoot, '.git')).isDirectory() ||
    realpathSync(sourceRoot) !== sourceRoot ||
    git(sourceRoot, ['rev-parse', '--show-toplevel']) !== sourceRoot
  )
    throw new Error('isolated real source checkout required');
  const remote = git(sourceRoot, ['remote', 'get-url', 'origin']);
  if (
    !/^(?:https:\/\/github\.com\/|git@github\.com:)JovieInc\/Jovie(?:\.git)?$/.test(
      remote
    )
  )
    throw new Error('same-repository source checkout required');
  const headSha = git(sourceRoot, ['rev-parse', '--verify', 'HEAD']);
  // Dependencies and scanner tools belong outside this fresh source clone.
  // Ignored files could otherwise alter what the agent reads at this SHA.
  const changes = git(sourceRoot, [
    'status',
    '--porcelain=v1',
    '--untracked-files=all',
    '--ignored',
  ]);
  const hashes = files.map(file => {
    git(sourceRoot, ['ls-files', '--error-unmatch', '--', file]);
    const path = join(sourceRoot, file);
    if (!lstatSync(path).isFile() || realpathSync(path) !== path)
      throw new Error('regular tracked security targets required');
    return createHash('sha256').update(readFileSync(path)).digest('hex');
  });
  return { headSha, changes, hashes };
}

/** Execute native DeepSec in an empty trusted workspace outside an isolated checkout.
 * No workflow, comment, ledger or Linear write is performed here. */
export async function runNativeSubscriptionScan(
  input,
  { environment = process.env, execute = boundedNativeCommand } = {}
) {
  const plan = subscriptionPlan(input);
  const before = nativeSourceState(input.sourceRoot, plan.files);
  if (before.headSha !== plan.headSha || before.changes)
    throw new Error('clean exact-head source required');
  if (existsSync(input.workspace)) {
    if (
      realpathSync(input.workspace) !== input.workspace ||
      readdirSync(input.workspace).length
    )
      throw new Error('empty real scanner workspace required');
  } else mkdirSync(input.workspace, { recursive: false });
  const env = subscriptionEnvironment(environment);
  const options = { cwd: input.workspace, env, timeoutMs: 30_000 };
  const version = await execute(plan.admission[0], options);
  const login = await execute(plan.admission[1], options);
  admitSubscription({ version, login });
  writeFileSync(
    join(input.workspace, 'deepsec.config.mjs'),
    `export default ${JSON.stringify(plan.config)};\n`,
    { flag: 'wx', mode: 0o600 }
  );
  writeFileSync(
    join(input.workspace, 'files.txt'),
    `${plan.files.join('\n')}\n`,
    { flag: 'wx', mode: 0o600 }
  );
  const result = await execute(plan.command, {
    ...options,
    timeoutMs: 12 * 60_000,
  });
  const after = nativeSourceState(input.sourceRoot, plan.files);
  const sourceChanged = JSON.stringify(before) !== JSON.stringify(after);
  if (sourceChanged) throw new Error('source changed during native scan');
  const exported = await execute(plan.exportCommand, options);
  if (exported.status !== 0 || exported.signal || exported.error)
    throw new Error('native findings export failed');
  const path = join(input.workspace, 'findings.json');
  if (
    !lstatSync(path).isFile() ||
    realpathSync(path) !== path ||
    lstatSync(path).size > 4 * 1024 * 1024
  )
    throw new Error('bounded native findings data required');
  const findings = JSON.parse(readFileSync(path, 'utf8'));
  const finalSource = nativeSourceState(input.sourceRoot, plan.files);
  const receipt = subscriptionReceipt({
    plan,
    result,
    findings,
    observedHead: finalSource.headSha,
    sourceChanged: JSON.stringify(before) !== JSON.stringify(finalSource),
  });
  return { receipt, findings };
}
