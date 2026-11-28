#!/usr/bin/env node
// Local-only advisory review runner; never a CI or branch-protection gate.
import { spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { copyFileSync, mkdirSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import {
  configuredSkills,
  emit,
  executable,
  hash,
  inputIdentity,
  priorResult,
  reusePolicy,
  storage,
  WARDEN_VERSION as version,
} from './warden-observation.mjs';
import { parseReviewResult, RESULT_FORMAT } from './warden-result.mjs';
import { readTriage } from './warden-triage.mjs';

const here = import.meta.dirname;

// Node owns the timer on Linux and macOS: no timeout/gtimeout dependency.
async function run(command, args, env, seconds) {
  return new Promise(resolveRun => {
    let child;
    let timer;
    let killer;
    let stopped = null;
    let providerError = false;
    let tail = '';
    let output = '';
    let outputTruncated = false;
    const killGroup = signal => {
      try {
        if (process.platform === 'win32') child.kill(signal);
        else process.kill(-child.pid, signal);
      } catch {
        /* already exited */
      }
    };
    const stop = reason => {
      if (stopped) return;
      stopped = reason;
      killGroup('SIGTERM');
      killer = setTimeout(() => killGroup('SIGKILL'), 250);
    };
    const interrupt = () => stop('interrupted');
    const finish = (code, signal, error) => {
      clearTimeout(timer);
      clearTimeout(killer);
      if (stopped) killGroup('SIGKILL');
      process.removeListener('SIGINT', interrupt);
      process.removeListener('SIGTERM', interrupt);
      resolveRun({
        outcome:
          stopped ||
          (error
            ? 'runtime-error'
            : providerError
              ? 'provider-error'
              : signal
                ? 'interrupted'
                : code === 0
                  ? 'completed'
                  : 'runtime-error'),
        exitCode: code,
        signal,
        commandAttempted: !error,
        output: outputTruncated ? null : output,
      });
    };
    try {
      child = spawn(command, args, {
        env,
        detached: process.platform !== 'win32',
        stdio: ['ignore', 'pipe', 'pipe'],
      });
      /** @type {[import('node:stream').Readable, NodeJS.WriteStream][]} */
      const streams = [
        [child.stdout, process.stdout],
        [child.stderr, process.stderr],
      ];
      for (const [stream, target] of streams) {
        stream.on('data', chunk => {
          target.write(chunk);
          if (stream === child.stdout && !outputTruncated) {
            output += chunk.toString();
            if (Buffer.byteLength(output) > 1024 * 1024) {
              output = '';
              outputTruncated = true;
            }
          }
          // Only retain a bounded tail for error classification, never log output.
          if (stream === child.stderr)
            tail = (tail + chunk.toString()).slice(-4096);
          if (
            /auth_failed|authentication_error|invalid x-api-key|credit balance|insufficient.?credit|rate.?limit|Pi model not found/i.test(
              tail
            )
          )
            providerError = true;
        });
      }
      process.on('SIGINT', interrupt);
      process.on('SIGTERM', interrupt);
      if (seconds > 0)
        timer = setTimeout(() => stop('timeout'), seconds * 1000);
      let error = null;
      child.once('error', value => {
        error = value;
      });
      child.once('close', (code, signal) => finish(code, signal, error));
    } catch (error) {
      finish(null, null, error);
    }
  });
}

export async function main(mode = process.argv[2], env = process.env) {
  if (env.CI) return 0;
  if (!['staged', 'branch'].includes(mode)) {
    console.error('[warden] unknown mode; skipping local review');
    return 0;
  }
  const startedAt = new Date().toISOString();
  const dir = storage(env);
  const id = randomUUID();
  let identity = { mode };
  let identityError = false;
  try {
    identity = inputIdentity(mode, env);
  } catch {
    identityError = true;
  }
  const observation = {
    schema: 'jovie-local-review-observation/v1',
    id,
    ...identity,
    startedAt,
    finishedAt: null,
    route: null,
    reason: null,
    outcome: null,
    commandAttempted: false,
    modelActuallyAttempted: null,
    modelRequestAttempted: null,
    knownCostUsd: null,
    runtimeReportedCostUsd: null,
    requestedModelsWithUsage: null,
    modelAttribution:
      'requested selector with runtime usage; provider response identity unknown',
    costAttribution: 'runtime model accounting estimate; billing cost unknown',
    findingCount: null,
    reviewCompleted: false,
    resultProof: null,
    reuseEligible: false,
    reuseReason: 'No verified complete Warden JSONL result for this invocation',
    identityComplete: !identityError,
  };
  const event = (stage, enteredAt, exitedAt, outcome, details = {}) => ({
    schema: 'jovie-stage-event/v1',
    entityType: 'local-review',
    entityId: id,
    stage,
    enteredAt,
    exitedAt,
    actor: 'warden-local-review',
    outcome,
    sourceReceipt: `stage-events.ndjson#${id}`,
    ...details,
  });
  const finish = (outcome, details = {}) => {
    Object.assign(observation, details, {
      outcome,
      finishedAt: new Date().toISOString(),
    });
    emit(
      dir,
      event(
        'finished',
        observation.finishedAt,
        observation.finishedAt,
        outcome === 'completed'
          ? 'completed'
          : ['skipped', 'superseded'].includes(outcome)
            ? 'abandoned'
            : 'failed',
        { observation }
      )
    );
    return observation;
  };
  let verdict;
  if (env.WARDEN_LOCAL_REVIEW === 'off')
    verdict = { review: false, reason: 'local review disabled' };
  else if (mode === 'branch' && env.WARDEN_PUSH_REVIEW !== 'on')
    verdict = { review: false, reason: 'branch review not opted in' };
  else if (env.WARDEN_TRIAGE === 'off')
    verdict = { review: true, reason: 'triage disabled' };
  else {
    try {
      verdict = readTriage(mode);
    } catch {
      verdict = {
        review: true,
        reason: 'triage unavailable; conservatively select review',
      };
    }
  }
  observation.route = verdict.review ? 'model' : 'deterministic';
  observation.reason = verdict.reason;
  emit(
    dir,
    event(
      'decision',
      startedAt,
      new Date().toISOString(),
      verdict.review ? 'advanced' : 'abandoned',
      {
        reviewOutcome: verdict.review ? 'selected' : 'skipped',
        inputDigest: identity.inputDigest ?? null,
        reason: verdict.reason,
      }
    )
  );
  if (!verdict.review) {
    if (env.WARDEN_LOCAL_REVIEW !== 'off')
      console.log(
        `[warden] free first pass: ${verdict.reason}; no model review needed.`
      );
    finish('skipped');
    return 0;
  }
  console.log(
    `[warden] free first pass: ${verdict.reason}; selected for local review.`
  );
  if (!env.WARDEN_ANTHROPIC_API_KEY) {
    console.error(
      '[warden] no WARDEN_ANTHROPIC_API_KEY; local review unavailable (advisory). Setup: docs/PR_FLOW.md'
    );
    finish('unavailable', { reason: 'missing credential' });
    return 0;
  }
  const skills = configuredSkills();
  const policy = reusePolicy(skills, env);
  if (!policy.allowed) observation.identityComplete = false;
  const prior =
    identityError || !policy.allowed
      ? null
      : priorResult(dir, identity, skills);
  if (prior) {
    console.log(
      `[warden] reusing completed JSONL review ${prior.id} for identical input/context/policy/model configuration.`
    );
    process.stdout.write(prior.resultProof.output);
    finish('skipped', {
      reason: 'exact-input completed review reused',
      reusedFrom: prior.id,
      findingCount: prior.findingCount,
      resultProof: prior.resultProof,
      reuseReason:
        'Exact full identity match; original structured result replayed',
      exitCode: prior.exitCode,
    });
    return env.WARDEN_LOCAL_REVIEW === 'strict' ? prior.exitCode || 0 : 0;
  }
  const cli = executable('warden');
  const npm = cli ? null : executable('npm');
  if (!cli && !npm) {
    console.error(
      `[warden] warden CLI not installed and npm not found; install with: npm install -g @sentry/warden@${version}`
    );
    finish('unavailable', { reason: 'missing executable' });
    return 0;
  }
  const seconds = Number(env.WARDEN_TIMEOUT_SECONDS ?? 180);
  if (!Number.isFinite(seconds) || seconds < 0) {
    console.error(
      '[warden] invalid WARDEN_TIMEOUT_SECONDS; local review unavailable (advisory).'
    );
    finish('unavailable', { reason: 'invalid timeout configuration' });
    return 0;
  }
  const agentDir = join(
    env.XDG_CACHE_HOME || join(homedir(), '.cache'),
    'jovie-warden/pi-agent'
  );
  const childEnv = { ...env };
  try {
    mkdirSync(agentDir, { recursive: true });
    copyFileSync(
      join(here, 'warden-pi-models.json'),
      join(agentDir, 'models.json')
    );
    childEnv.PI_CODING_AGENT_DIR = agentDir;
  } catch {
    console.error(
      '[warden] could not prepare isolated pi model configuration.'
    );
  }
  const reviewStartedAt = new Date().toISOString();
  const args = [
    ...(cli
      ? []
      : [
          'exec',
          '--yes',
          `--package=@sentry/warden@${version}`,
          '--',
          'warden',
        ]),
    ...(mode === 'staged' ? ['--staged'] : []),
    '--json',
  ];
  const result = await run(cli || npm, args, childEnv, seconds);
  const proof = result.output ? parseReviewResult(result.output, skills) : null;
  if (proof) {
    observation.findingCount = proof.findingCount;
    observation.reviewCompleted = proof.complete;
    observation.requestedModelsWithUsage = proof.requestedModelsWithUsage.length
      ? proof.requestedModelsWithUsage
      : null;
    observation.modelRequestAttempted = proof.requestedModelsWithUsage.length
      ? true
      : null;
    observation.runtimeReportedCostUsd = proof.runtimeReportedCostUsd;
    if (
      proof.complete &&
      [0, 1].includes(result.exitCode) &&
      !['timeout', 'interrupted', 'provider-error'].includes(result.outcome)
    ) {
      result.outcome = 'completed';
      observation.resultProof = {
        format: RESULT_FORMAT,
        output: result.output,
        digest: hash(result.output),
        runId: proof.runId,
      };
      observation.reuseEligible = policy.allowed;
      observation.reuseReason =
        policy.reason ||
        'Complete supported JSONL result bound to full input/context/policy/model configuration';
    }
  }
  delete result.output;
  if (!identityError) {
    try {
      if (inputIdentity(mode, env).inputDigest !== identity.inputDigest)
        result.outcome = 'superseded';
    } catch {
      result.outcome = 'superseded';
    }
  }
  const finalPolicy = reusePolicy(skills, env);
  if (!finalPolicy.allowed) {
    observation.identityComplete = false;
    observation.reuseEligible = false;
    observation.reuseReason = finalPolicy.reason;
    if (policy.allowed) result.outcome = 'superseded';
  }
  if (result.outcome !== 'completed' || identityError) {
    observation.reuseEligible = false;
    observation.reviewCompleted = false;
  }
  emit(
    dir,
    event(
      'review',
      reviewStartedAt,
      new Date().toISOString(),
      result.outcome === 'completed'
        ? 'completed'
        : result.outcome === 'superseded'
          ? 'abandoned'
          : 'failed',
      { reviewOutcome: result.outcome }
    )
  );
  finish(result.outcome, result);
  if (result.outcome === 'timeout')
    console.error(
      `[warden] review timed out after ${seconds}s; continuing (advisory).`
    );
  else if (result.outcome === 'interrupted')
    console.error('[warden] review interrupted; continuing (advisory).');
  else if (result.outcome === 'provider-error')
    console.error(
      '[warden] provider/model error; no findings conclusion. API may have rejected WARDEN_ANTHROPIC_API_KEY.'
    );
  if (!['completed', 'timeout', 'interrupted'].includes(result.outcome)) {
    console.error(
      `[warden] ${result.outcome} (exit ${result.exitCode}); no proven findings count. Commit/push is NOT blocked by default. Warden must never become a merge gate.`
    );
    if (env.WARDEN_LOCAL_REVIEW === 'strict') return result.exitCode || 1;
  }
  if (env.WARDEN_LOCAL_REVIEW === 'strict' && result.outcome === 'completed')
    return result.exitCode || 0;
  return 0;
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  try {
    process.exitCode = await main();
  } catch {
    console.error('[warden] local reviewer failed; continuing (advisory).');
    process.exitCode = process.env.WARDEN_LOCAL_REVIEW === 'strict' ? 1 : 0;
  }
}
