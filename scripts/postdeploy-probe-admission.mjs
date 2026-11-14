#!/usr/bin/env node
/** Bounded GitHub transport for the postdeploy probe admission ledger. */
import { spawnSync } from 'node:child_process';
import {
  appendFileSync,
  chmodSync,
  closeSync,
  mkdirSync,
  mkdtempSync,
  openSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import {
  admissionArtifactName,
  evaluateProbeAdmission,
  probeTargetKey,
  recordProbeAttempt,
  reserveProbeAttempt,
  validateProbeReservation,
} from './lib/postdeploy-probe-admission.mjs';

export const MAX_JSON_BYTES = 1024 * 1024;
export const MAX_API_CALLS = 40;
const MAX_ZIP_BYTES = MAX_JSON_BYTES * 2;
const WRAPPER = fileURLToPath(
  new URL('./lib/github-rate-limit.mjs', import.meta.url)
);

class TransportFailure extends Error {
  constructor(reason, quotaDeferred = false) {
    super(reason);
    this.quotaDeferred = quotaDeferred;
  }
}

function positiveId(value) {
  return Number.isSafeInteger(value) && value > 0;
}

/** Injection replaces only process execution; ZIP validation remains real.
 * @param {{execute?: (command: string, args: string[], options: import('node:child_process').SpawnSyncOptions) => {status: number|null, stdout?: string|Buffer, stderr?: string|Buffer, error?: Error}, env?: NodeJS.ProcessEnv, temporaryRoot?: string}} [options]
 */
export function createGitHubTransport({
  execute = spawnSync,
  env = process.env,
  temporaryRoot = tmpdir(),
} = {}) {
  let calls = 0;
  function invoke(endpoint, binaryFile, privateRoot) {
    if (++calls > MAX_API_CALLS)
      throw new TransportFailure('API call budget exhausted');
    const args = [
      WRAPPER,
      'run',
      '--max-wait-seconds',
      '2',
      '--attempts',
      '2',
      '--',
      'gh',
      'api',
      endpoint,
    ];
    const fd = binaryFile ? openSync(binaryFile, 'wx', 0o600) : null;
    let result;
    try {
      result = execute(process.execPath, args, {
        env: { ...env, ...(privateRoot ? { TMPDIR: privateRoot } : {}) },
        stdio:
          fd === null ? ['ignore', 'pipe', 'pipe'] : ['ignore', fd, 'pipe'],
        timeout: 15_000,
        maxBuffer: MAX_JSON_BYTES + 1,
        encoding: fd === null ? 'utf8' : undefined,
      });
    } finally {
      if (fd !== null) closeSync(fd);
    }
    if (result.status === 75)
      throw new TransportFailure('GitHub quota deferred', true);
    if (result.error || result.status !== 0)
      throw new TransportFailure('GitHub transport unavailable');
    return result.stdout;
  }
  return {
    getJson(endpoint) {
      const output = invoke(endpoint);
      if (Buffer.byteLength(output ?? '') > MAX_JSON_BYTES)
        throw new TransportFailure('JSON exceeds bound');
      try {
        return JSON.parse(String(output));
      } catch {
        throw new TransportFailure('Malformed GitHub JSON');
      }
    },
    getLedger(repository, artifactId) {
      const root = mkdtempSync(join(temporaryRoot, 'postdeploy-probe-ledger-'));
      chmodSync(root, 0o700);
      const archive = join(root, 'artifact.zip');
      try {
        invoke(
          `repos/${repository}/actions/artifacts/${artifactId}/zip`,
          archive,
          root
        );
        if (statSync(archive).size > MAX_ZIP_BYTES)
          throw new TransportFailure('ZIP exceeds bound');
        const listing = execute('unzip', ['-Z1', archive], {
          encoding: 'utf8',
          timeout: 5_000,
          maxBuffer: 16_384,
        });
        if (
          listing.error ||
          listing.status !== 0 ||
          String(listing.stdout ?? '').trim() !== 'ledger.json'
        )
          throw new TransportFailure('Artifact must contain only ledger.json');
        const extracted = execute('unzip', ['-p', archive, 'ledger.json'], {
          encoding: 'utf8',
          timeout: 5_000,
          maxBuffer: MAX_JSON_BYTES + 1,
        });
        if (
          extracted.error ||
          extracted.status !== 0 ||
          Buffer.byteLength(extracted.stdout ?? '') > MAX_JSON_BYTES
        )
          throw new TransportFailure(
            'Ledger extraction exceeds bound or failed'
          );
        try {
          return JSON.parse(String(extracted.stdout));
        } catch {
          throw new TransportFailure('Malformed ledger JSON');
        }
      } finally {
        rmSync(root, { recursive: true, force: true });
      }
    },
  };
}

/** Discover immutable per-run capsules from a complete exact-name namespace. */
export function collectProbeHistory(
  context,
  transport = createGitHubTransport()
) {
  try {
    if (evaluateProbeAdmission(context, null).reason === 'context-malformed')
      throw new TransportFailure('Invalid canonical admission context');
    const name = admissionArtifactName(context.target);
    const complete = payload => {
      if (
        !Array.isArray(payload?.artifacts) ||
        !Number.isSafeInteger(payload.total_count) ||
        payload.total_count < 0 ||
        payload.total_count > 100 ||
        payload.total_count !== payload.artifacts.length ||
        new Set(payload.artifacts.map(row => row.id)).size !==
          payload.artifacts.length
      )
        throw new TransportFailure('Incomplete artifact index');
      return payload.artifacts;
    };
    const metadataValid = artifact =>
      positiveId(artifact.id) &&
      artifact.expired === false &&
      positiveId(artifact.workflow_run?.id) &&
      Number.isSafeInteger(artifact.size_in_bytes) &&
      artifact.size_in_bytes > 0 &&
      artifact.size_in_bytes <= MAX_ZIP_BYTES;
    const index = complete(
      transport.getJson(
        `repos/${context.repository}/actions/artifacts?name=${encodeURIComponent(name)}&per_page=100`
      )
    );
    if (
      index.some(
        artifact => artifact.name !== name || !metadataValid(artifact)
      ) ||
      new Set(index.map(row => row.workflow_run.id)).size !== index.length
    )
      throw new TransportFailure('Invalid namespace metadata');
    const runIds = new Set([
      ...index.map(row => row.workflow_run.id),
      context.runId,
    ]);
    const capsules = [];
    for (const runId of runIds) {
      const rows = complete(
        transport.getJson(
          `repos/${context.repository}/actions/runs/${runId}/artifacts?per_page=100`
        )
      );
      const selected = rows.filter(
        row =>
          row.name === name ||
          new RegExp(`^${name}-attempt-[1-9][0-9]*$`, 'u').test(row.name)
      );
      if (
        selected.some(
          row => !metadataValid(row) || row.workflow_run.id !== runId
        ) ||
        (selected.length &&
          selected.filter(row => row.name === name).length !== 1) ||
        index.some(
          row =>
            row.workflow_run.id === runId &&
            !selected.some(
              candidate =>
                candidate.id === row.id && candidate.name === row.name
            )
        )
      )
        throw new TransportFailure('Incomplete immutable run capsules');
      capsules.push(...selected);
    }
    const artifacts = [];
    for (const artifact of capsules) {
      const ledger = transport.getLedger(context.repository, artifact.id);
      if (
        ledger?.runId !== artifact.workflow_run.id ||
        !Array.isArray(ledger.attempts) ||
        ledger.attempts.length !== 1 ||
        !positiveId(ledger.attempts[0].runAttempt) ||
        ledger.attempts[0].status !== 'pending' ||
        (artifact.name !== name &&
          artifact.name !== `${name}-attempt-${ledger.attempts[0].runAttempt}`)
      )
        throw new TransportFailure('Invalid immutable capsule');
      const endpoint = `repos/${context.repository}/actions/runs/${ledger.runId}/attempts/${ledger.attempts[0].runAttempt}`;
      const run = transport.getJson(endpoint);
      const jobs = transport.getJson(`${endpoint}/jobs?per_page=100`);
      artifacts.push({
        ...artifact,
        ledger,
        proofs: [{ complete: true, run, jobs }],
      });
    }
    return { complete: true, total_count: artifacts.length, artifacts };
  } catch (error) {
    return {
      complete: false,
      artifacts: [],
      quotaDeferred: error instanceof TransportFailure && error.quotaDeferred,
      reason:
        error instanceof Error ? error.message : 'Unknown transport failure',
    };
  }
}

function readBoundedJson(path) {
  if (statSync(path).size > MAX_JSON_BYTES)
    throw new Error('Context JSON exceeds bound');
  return JSON.parse(readFileSync(path, 'utf8'));
}

/** Admission writes only a new immutable pending capsule; record writes no capsule. */
export function executeProbeAdmission(
  mode,
  context,
  outDir,
  transport = createGitHubTransport()
) {
  mkdirSync(outDir, { recursive: true, mode: 0o700 });
  chmodSync(outDir, 0o700);
  const ledgerPath = join(outDir, 'ledger.json');
  rmSync(ledgerPath, { force: true });
  const history =
    context.mode === 'clock'
      ? { complete: false, artifacts: [], quotaDeferred: false }
      : collectProbeHistory(context, transport);
  writeFileSync(join(outDir, 'context.json'), `${JSON.stringify(context)}\n`, {
    mode: 0o600,
  });
  writeFileSync(join(outDir, 'history.json'), `${JSON.stringify(history)}\n`, {
    mode: 0o600,
  });
  const stableName = admissionArtifactName(context.target);
  const own = history.artifacts.filter(
    artifact => artifact.ledger.runId === context.runId
  );
  const current = own.filter(
    artifact => artifact.ledger.attempts[0].runAttempt === context.runAttempt
  );
  let result;
  let capsule;
  let artifactName = stableName;
  let reservationNeeded = false;
  let outcome;
  try {
    if (history.quotaDeferred)
      result = { decision: 'quota-deferred', admitted: false, failureCount: 0 };
    else {
      if (
        current.length > 1 ||
        (current.length && !validateProbeReservation(context, current[0]))
      )
        throw new Error('Invalid current capsule');
      if (mode === 'admit') {
        const prior = history.artifacts.filter(
          artifact => !current.includes(artifact)
        );
        result = evaluateProbeAdmission(context, {
          ...history,
          total_count: prior.length,
          artifacts: prior,
        });
        if (result.admitted) {
          if (!history.complete)
            throw new Error('Immutable namespace unavailable');
          artifactName =
            current[0]?.name ??
            (own.length
              ? `${stableName}-attempt-${context.runAttempt}`
              : stableName);
          if (!current.length) {
            capsule = reserveProbeAttempt(context);
            reservationNeeded = true;
          }
        }
      } else if (mode === 'record') {
        if (!history.complete || current.length !== 1)
          throw new Error('Current immutable reservation missing');
        artifactName = current[0].name;
        const final = recordProbeAttempt(context, current[0].proofs[0].jobs);
        outcome = final.attempts[0].status;
        result = { decision: 'recorded', admitted: false, failureCount: 0 };
      } else throw new Error('Unknown mode');
    }
  } catch (error) {
    result = {
      decision:
        error instanceof TransportFailure && error.quotaDeferred
          ? 'quota-deferred'
          : 'defer-unknown',
      admitted: false,
      failureCount: 0,
    };
  }
  if (capsule)
    writeFileSync(ledgerPath, `${JSON.stringify(capsule)}\n`, { mode: 0o600 });
  const output = {
    ...result,
    quotaDeferred: result.decision === 'quota-deferred',
    notifyAllowed:
      context.mode === 'automatic' &&
      result.admitted === true &&
      result.failureCount === 0,
    outcome: mode === 'record' ? (outcome ?? 'incomplete') : undefined,
    artifactName,
    reservationNeeded,
    ledgerPath: capsule ? ledgerPath : null,
  };
  writeFileSync(join(outDir, 'result.json'), `${JSON.stringify(output)}\n`, {
    mode: 0o600,
  });
  return output;
}

export function main(
  argv = process.argv.slice(2),
  env = process.env,
  transport = createGitHubTransport({ env })
) {
  const [mode, ...args] = argv;
  if (!['admit', 'record'].includes(mode))
    throw new Error('Expected admit or record');
  const options = new Map();
  for (let i = 0; i < args.length; i += 2) {
    if (
      !['--context-file', '--out-dir', '--github-output'].includes(args[i]) ||
      !args[i + 1] ||
      options.has(args[i])
    )
      throw new Error('Invalid driver arguments');
    options.set(args[i], args[i + 1]);
  }
  const contextFile =
    options.get('--context-file') || env.POSTDEPLOY_PROBE_CONTEXT;
  const outDir = options.get('--out-dir') || env.POSTDEPLOY_PROBE_OUT_DIR;
  if (!contextFile || !outDir)
    throw new Error('Context file and output directory are required');
  const context = readBoundedJson(contextFile);
  const result = executeProbeAdmission(
    mode,
    context,
    resolve(outDir),
    transport
  );
  const githubOutput = options.get('--github-output') || env.GITHUB_OUTPUT;
  if (githubOutput)
    appendFileSync(
      githubOutput,
      `admitted=${result.admitted === true}\ndecision=${result.decision}\nquota_deferred=${result.quotaDeferred === true}\nnotify_allowed=${result.notifyAllowed === true}\nreservation_needed=${result.reservationNeeded === true}\noutcome=${result.outcome || ''}\nartifact_name=${result.artifactName}\nledger_path=${result.ledgerPath || ''}\n`
    );
  if (env.GITHUB_STEP_SUMMARY) {
    const failures =
      mode === 'admit' &&
      !['defer-unknown', 'quota-deferred'].includes(result.decision)
        ? result.failureCount
        : 'unknown';
    const health =
      result.outcome === 'passed'
        ? 'Actual selected probe jobs passed for this target.'
        : result.decision === 'reuse-passed'
          ? 'A verified prior pass was reused. No fresh health check ran in this invocation.'
          : 'No actual probe pass is established by this invocation. Admission, skipped probes, incomplete evidence and quota deferral are not health certification.';
    appendFileSync(
      env.GITHUB_STEP_SUMMARY,
      `**Postdeploy probe ${mode}**\n\nDecision: ${result.decision}; admitted: ${result.admitted === true}; automatic admission failure count: ${failures}.\n\nTarget key: ${probeTargetKey(context.target)}\n\nSHA: ${context.target.sha}; deployment: ${context.target.deploymentId}.\n\n${health}\n\n`
    );
  }
  process.stdout.write(`${JSON.stringify(result)}\n`);
  return result.quotaDeferred ? 75 : 0;
}

if (
  process.argv[1] &&
  pathToFileURL(resolve(process.argv[1])).href === import.meta.url
) {
  try {
    process.exitCode = main();
  } catch {
    process.stderr.write(
      'Postdeploy admission context or arguments are invalid.\n'
    );
    process.exitCode = 2;
  }
}
