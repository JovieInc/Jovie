#!/usr/bin/env node
/**
 * Certify each served production build once (JOV-12639).
 *
 *   node scripts/golden-path-cert-reuse.mjs lookup --served-sha SHA
 *     [--force true] [--github-output FILE]
 *   node scripts/golden-path-cert-reuse.mjs adopt --served-sha SHA
 *     --source-run-id N --artifact-id N --out FILE
 *   node scripts/golden-path-cert-reuse.mjs stamp --receipts FILE
 *     --expected-sha SHA --out FILE [--github-output FILE]
 *
 * lookup looks for a certified stamp for the served SHA (exact-name artifact
 * prod-cert-certified-<sha>), checks the run that wrote it, downloads it and
 * applies decideCertReuse. It fails open: any GitHub error means certify
 * again, and it always exits 0.
 *
 * adopt re-reads that one artifact, judges it again and writes the source
 * receipts with a reuse block naming the source run to --out. It exits 1 when
 * the receipt no longer qualifies, so a reuse is never claimed without one.
 *
 * stamp writes the certified stamp beside a run's receipts only when every
 * surface passed on the expected SHA, so a later run can reuse them.
 */
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
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { parseArgs } from 'node:util';
import {
  certifiedArtifactName,
  certifiedStamp,
  decideCertReuse,
  producerDigest,
  REUSE_MAX_AGE_MS,
  reusedReceiptDocument,
} from './lib/golden-path-cert-reuse.mjs';
import { createGitHubTransport } from './postdeploy-probe-admission.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const WRAPPER = fileURLToPath(
  new URL('./lib/github-rate-limit.mjs', import.meta.url)
);
export const RECEIPTS_FILE = 'prod-cert-receipts.json';
export const STAMP_FILE = 'prod-cert-certified.json';
const MAX_ZIP_BYTES = 8 * 1024 * 1024;
const MAX_FILE_BYTES = 16 * 1024 * 1024;
const MAX_CANDIDATES = 3;

/**
 * Download one artifact zip and return its two JSON members.
 * @param {string} repository @param {number} artifactId
 * @param {{ execute?: typeof spawnSync, env?: NodeJS.ProcessEnv }} [deps]
 */
export function downloadCertifiedArtifact(
  repository,
  artifactId,
  { execute = spawnSync, env = process.env } = {}
) {
  const root = mkdtempSync(join(tmpdir(), 'prod-cert-reuse-'));
  chmodSync(root, 0o700);
  const archive = join(root, 'artifact.zip');
  try {
    const fd = openSync(archive, 'wx', 0o600);
    let result;
    try {
      result = execute(
        process.execPath,
        [
          WRAPPER,
          'run',
          '--max-wait-seconds',
          '2',
          '--attempts',
          '2',
          '--',
          'gh',
          'api',
          `repos/${repository}/actions/artifacts/${artifactId}/zip`,
        ],
        {
          env: { ...env, TMPDIR: root },
          stdio: ['ignore', fd, 'pipe'],
          timeout: 30_000,
        }
      );
    } finally {
      closeSync(fd);
    }
    if (result.error || result.status !== 0)
      throw new Error('artifact download failed');
    if (statSync(archive).size > MAX_ZIP_BYTES)
      throw new Error('artifact zip exceeds bound');
    const unzip = (/** @type {string[]} */ args) => {
      const out = execute('unzip', args, {
        encoding: 'utf8',
        timeout: 10_000,
        maxBuffer: MAX_FILE_BYTES + 1,
      });
      if (out.error || out.status !== 0) throw new Error('unzip failed');
      return String(out.stdout ?? '');
    };
    const members = unzip(['-Z1', archive]).trim().split('\n').sort();
    if (members.join(',') !== [RECEIPTS_FILE, STAMP_FILE].sort().join(','))
      throw new Error('artifact must hold only the receipts and the stamp');
    return {
      document: JSON.parse(unzip(['-p', archive, RECEIPTS_FILE])),
      stamp: JSON.parse(unzip(['-p', archive, STAMP_FILE])),
    };
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

/**
 * @typedef {{ getJson: (endpoint: string) => any }} Transport
 * @typedef {{ repository: string, servedSha: string, nowMs?: number, digest?: string, transport?: Transport, download?: typeof downloadCertifiedArtifact }} LookupBase
 */

/**
 * Judge one certified artifact row: its run, its stamp and its receipts.
 * @param {any} row @param {Required<LookupBase>} base
 */
function judgeRow(row, base) {
  const { repository, transport, download } = base;
  const run = transport.getJson(
    `repos/${repository}/actions/runs/${row.workflow_run.id}`
  );
  const files = download(repository, row.id);
  return decideCertReuse({
    servedSha: base.servedSha,
    repository,
    producerDigest: base.digest,
    nowMs: base.nowMs,
    candidates: [
      {
        runId: row.workflow_run.id,
        runUrl: typeof run?.html_url === 'string' ? run.html_url : undefined,
        artifactId: row.id,
        run,
        ...files,
      },
    ],
  });
}

/** @param {LookupBase} input @returns {Required<LookupBase>} */
function withDefaults({
  repository,
  servedSha,
  nowMs = Date.now(),
  digest = producerDigest(ROOT),
  transport = createGitHubTransport(),
  download = downloadCertifiedArtifact,
}) {
  return { repository, servedSha, nowMs, digest, transport, download };
}

const rowValid = (row, name) =>
  row?.name === name &&
  row.expired === false &&
  Number.isSafeInteger(row.id) &&
  Number.isSafeInteger(row.workflow_run?.id) &&
  row.size_in_bytes > 0 &&
  row.size_in_bytes <= MAX_ZIP_BYTES;

/**
 * @param {LookupBase & { runId: number, force: boolean }} input
 * @returns {import('./lib/golden-path-cert-reuse.mjs').ReuseDecision}
 */
export function lookupReuse({ runId, force, ...input }) {
  const base = withDefaults(input);
  const first = decideCertReuse({
    servedSha: base.servedSha,
    repository: base.repository,
    producerDigest: base.digest,
    nowMs: base.nowMs,
    force,
  });
  if (force || first.reason !== 'no fresh certified receipt for the served SHA')
    return first;
  const name = certifiedArtifactName(base.servedSha);
  const index = base.transport.getJson(
    `repos/${base.repository}/actions/artifacts?name=${encodeURIComponent(name)}&per_page=30`
  );
  const since = base.nowMs - REUSE_MAX_AGE_MS - 60 * 60 * 1000;
  const rows = (Array.isArray(index?.artifacts) ? index.artifacts : [])
    .filter(
      row =>
        rowValid(row, name) &&
        row.workflow_run.id !== runId &&
        Date.parse(row.created_at) >= since
    )
    .sort((a, b) => b.workflow_run.id - a.workflow_run.id)
    .slice(0, MAX_CANDIDATES);
  const rejected = [];
  for (const row of rows) {
    const decision = judgeRow(row, base);
    if (decision.reuse) return { ...decision, rejected };
    rejected.push(...decision.rejected);
  }
  return { ...first, rejected };
}

/**
 * Re-read the one artifact lookup chose and judge it again.
 * @param {LookupBase & { sourceRunId: number, artifactId: number }} input
 * @returns {import('./lib/golden-path-cert-reuse.mjs').ReuseDecision}
 */
export function adoptReuse({ sourceRunId, artifactId, ...input }) {
  const base = withDefaults(input);
  const row = base.transport.getJson(
    `repos/${base.repository}/actions/artifacts/${artifactId}`
  );
  if (
    !rowValid(row, certifiedArtifactName(base.servedSha)) ||
    row.id !== artifactId ||
    row.workflow_run.id !== sourceRunId
  )
    return { reuse: false, reason: 'chosen artifact changed', rejected: [] };
  return judgeRow(row, base);
}

function emit(path, lines) {
  if (path) appendFileSync(path, `${lines.join('\n')}\n`);
}

function main(argv = process.argv.slice(2), env = process.env) {
  const [command, ...rest] = argv;
  const { values } = parseArgs({
    args: rest,
    options: {
      'served-sha': { type: 'string' },
      'expected-sha': { type: 'string' },
      receipts: { type: 'string' },
      force: { type: 'string', default: 'false' },
      'source-run-id': { type: 'string' },
      'artifact-id': { type: 'string' },
      out: { type: 'string' },
      'github-output': { type: 'string' },
    },
  });
  const runId = Number(env.GITHUB_RUN_ID);
  const runUrl = env.GITHUB_RUN_ID
    ? `${env.GITHUB_SERVER_URL}/${env.GITHUB_REPOSITORY}/actions/runs/${env.GITHUB_RUN_ID}`
    : null;
  if (command === 'stamp') {
    const document = JSON.parse(readFileSync(String(values.receipts), 'utf8'));
    const stamp = certifiedStamp(document, {
      expectedSha: String(values['expected-sha']),
      runId,
      producerDigest: producerDigest(ROOT),
    });
    if (stamp)
      writeFileSync(String(values.out), `${JSON.stringify(stamp, null, 2)}\n`);
    emit(values['github-output'], [`stamped=${stamp !== null}`]);
    console.log(
      stamp
        ? `certified stamp written for ${stamp.servedSha}`
        : 'not certified: no stamp, nothing to reuse'
    );
    return 0;
  }
  if (command === 'adopt') {
    const decision = adoptReuse({
      repository: String(env.GITHUB_REPOSITORY),
      servedSha: String(values['served-sha']),
      sourceRunId: Number(values['source-run-id']),
      artifactId: Number(values['artifact-id']),
    });
    if (!decision.reuse) {
      const why = decision.rejected[0]?.why ?? decision.reason;
      console.log(
        `::error::The chosen receipt no longer qualifies for reuse (${why}); the next trigger certifies again.`
      );
      return 1;
    }
    const out = String(values.out);
    mkdirSync(dirname(out), { recursive: true });
    const document = reusedReceiptDocument(decision, { runId, runUrl });
    writeFileSync(out, `${JSON.stringify(document, null, 2)}\n`);
    const line = `Golden Path certification reused from run ${decision.source?.runId} (certified ${decision.source?.certifiedAt}); no new certification ran and nothing was posted again.`;
    console.log(line);
    if (env.GITHUB_STEP_SUMMARY)
      appendFileSync(env.GITHUB_STEP_SUMMARY, `${line}\n`);
    return 0;
  }
  if (command !== 'lookup') {
    process.stderr.write(
      'usage: golden-path-cert-reuse.mjs lookup|adopt|stamp ...\n'
    );
    return 64;
  }
  let decision;
  try {
    decision = lookupReuse({
      repository: String(env.GITHUB_REPOSITORY),
      servedSha: String(values['served-sha']),
      runId,
      force: values.force === 'true',
    });
  } catch (error) {
    // Fail open: a lookup that cannot finish certifies again.
    console.log(
      `::warning::Receipt reuse lookup failed (${error instanceof Error ? error.message : 'unknown'}); certifying again.`
    );
    decision = { reuse: false, reason: 'lookup failed', rejected: [] };
  }
  for (const r of decision.rejected)
    console.log(`not reused: run ${r.runId}: ${r.why}`);
  const line = decision.reuse
    ? `Golden Path certification will reuse run ${decision.source?.runId} (certified ${decision.source?.certifiedAt}).`
    : `Golden Path certification runs: ${decision.reason}.`;
  console.log(line);
  if (env.GITHUB_STEP_SUMMARY)
    appendFileSync(env.GITHUB_STEP_SUMMARY, `${line}\n`);
  emit(values['github-output'], [
    `reuse=${decision.reuse}`,
    `source_run_id=${decision.source?.runId ?? ''}`,
    `source_artifact_id=${decision.source?.artifactId ?? ''}`,
  ]);
  return 0;
}

if (
  process.argv[1] &&
  pathToFileURL(resolve(process.argv[1])).href === import.meta.url
) {
  try {
    process.exitCode = main();
  } catch (error) {
    process.stderr.write(`${error instanceof Error ? error.message : error}\n`);
    process.exitCode = 2;
  }
}
