import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import writer from '../.github/scripts/update-quarantine.js';
import {
  addLinearIssueComment,
  listLinearIssueComments,
  upsertLinearIssueByTitleFingerprint,
} from './lib/linear-issue-intake.mjs';

const REPO = 'JovieInc/Jovie';
const DAY = 86400000;
const RUN = /^https:\/\/github\.com\/JovieInc\/Jovie\/actions\/runs\/[1-9]\d*$/;
const LINEAR =
  /^https:\/\/linear\.app\/jovie\/issue\/JOV-\d+(?:\/[a-z0-9-]+)?$/;
function requireFact(ok, message) {
  if (!ok) throw new Error(message);
}

// The fast report can file positive retry evidence without collecting seven
// days of clean executions. It has no authority to change the ledger.
export async function fileReportedFlakeClusters({
  clusters,
  headSha,
  now,
  fileHash,
  lease,
  upsert = upsertLinearIssueByTitleFingerprint,
  list = listLinearIssueComments,
  comment = addLinearIssueComment,
}) {
  requireFact(
    clusters?.schemaVersion === 1 &&
      clusters.repository === REPO &&
      /^[a-f0-9]{40}$/.test(headSha) &&
      clusters.headSha === headSha &&
      Date.parse(clusters.generatedAt) <= now &&
      Date.parse(clusters.generatedAt) >= now - DAY &&
      Array.isArray(clusters.clusters) &&
      clusters.clusters.length <= 1000,
    'Unbound or stale failure clusters'
  );
  const plans = new Map();
  for (const cluster of clusters.clusters) {
    if (cluster?.quarantineCandidate !== true) continue;
    const mapped = writer.mapToLedgerPath(cluster.file);
    requireFact(mapped, 'Unsafe failure cluster path');
    const file =
      mapped.kind === 'unit' ? `apps/web/${mapped.path}` : mapped.path;
    const attempts = cluster.flakyAttempts24h;
    requireFact(
      /^[a-f0-9]{16}$/.test(cluster.signature) &&
        typeof cluster.testId === 'string' &&
        cluster.testId.length <= 2000 &&
        typeof cluster.errorExcerpt === 'string' &&
        cluster.errorExcerpt.length <= 300 &&
        Array.isArray(attempts) &&
        attempts.length >= 3 &&
        attempts.length <= 1000 &&
        attempts.every(
          row =>
            Number.isSafeInteger(row.runId) &&
            row.runId > 0 &&
            Number.isSafeInteger(row.runAttempt) &&
            row.runAttempt > 0 &&
            Date.parse(row.runAt) >= now - DAY &&
            Date.parse(row.runAt) <= now
        ) &&
        new Set(attempts.map(row => `${row.runId}:${row.runAttempt}`)).size ===
          attempts.length &&
        cluster.flakyRunAttempts24h === attempts.length &&
        Number.isFinite(Date.parse(cluster.firstSeenAt)),
      'Malformed successful retry evidence'
    );
    if (!fileHash(file)) continue; // Deleted files are not new incidents.
    const previous = plans.get(cluster.signature);
    requireFact(
      !previous || previous.file === file,
      'Ambiguous failure signature'
    );
    plans.set(cluster.signature, { file, cluster });
  }
  const issues = {};
  for (const [signature, { file, cluster }] of [...plans].sort(([a], [b]) =>
    a.localeCompare(b)
  )) {
    const attempts = [...cluster.flakyAttempts24h].sort(
      (a, b) =>
        Date.parse(a.runAt) - Date.parse(b.runAt) ||
        a.runId - b.runId ||
        a.runAttempt - b.runAttempt
    );
    const fingerprint = `deflake:signature:${signature}`;
    const owningArea = file
      .replace(/^apps\/web\/tests\/(?:unit\/|lib\/)?/, '')
      .split('/')[0];
    const description = [
      `Test: ${cluster.testId}`,
      `Signature: ${signature}`,
      `First seen: ${cluster.firstSeenAt}`,
      `Successful flaky run attempts in rolling 24h: ${attempts.length}`,
      `Owning area: ${owningArea}`,
      `Failure: ${cluster.errorExcerpt}`,
      ...[
        ...new Set(
          attempts.map(
            row => `https://github.com/${REPO}/actions/runs/${row.runId}`
          )
        ),
      ].slice(-10),
      'Quarantine candidacy is a filing signal. Ledger changes require verified execution history and normal source checks.',
      `Fingerprint: ${fingerprint}`,
    ].join('\n\n');
    await lease();
    const result = await upsert({
      fingerprint,
      title: `Flaky test incident (${fingerprint})`,
      description,
      priority: 2,
      createStateName: 'Todo',
      reopenTerminal: true,
    });
    requireFact(
      result.ok === true &&
        LINEAR.test(result.url) &&
        typeof result.id === 'string' &&
        result.id.length > 0,
      'Canonical Linear intake failed'
    );
    await lease();
    const latest = attempts.at(-1);
    const marker = `flake-recurrence:${signature}:${latest.runId}:${latest.runAttempt}`;
    const found = await list({ issueId: result.id });
    requireFact(
      found.ok === true &&
        Array.isArray(found.comments) &&
        found.comments.length < 100,
      'Incomplete flake recurrence comments'
    );
    if (!found.comments.some(row => String(row.body).includes(marker))) {
      await lease();
      const posted = await comment({
        issueId: result.id,
        body: `${description}\n\n<!-- ${marker} -->`,
      });
      requireFact(
        posted.ok === true &&
          typeof posted.id === 'string' &&
          posted.id.length > 0,
        'Flake recurrence comment failed'
      );
    }
    await lease();
    issues[signature] = result.url;
  }
  return issues;
}

/**
 * @param {object} input
 * @param {any} input.clusters
 * @param {any} input.report
 * @param {any} input.ledger
 * @param {string} input.headSha
 * @param {number} input.now
 * @param {(file:string) => string|null} input.fileHash
 * @param {() => void|Promise<void>} input.lease
 * @param {(plan:{fingerprint:string,title:string,description:string,priority:number,createStateName:string,reopenTerminal:boolean}) => Promise<{ok:boolean,url?:string,reason?:string}>} [input.upsert]
 */
export async function fileQuarantineClusters({
  clusters,
  report,
  ledger,
  headSha,
  now,
  fileHash,
  lease,
  upsert = upsertLinearIssueByTitleFingerprint,
}) {
  requireFact(
    clusters?.schemaVersion === 1 &&
      clusters.repository === REPO &&
      clusters.headSha === headSha &&
      Array.isArray(clusters.clusters) &&
      clusters.clusters.length <= 1000 &&
      Date.parse(clusters.generatedAt) <= now &&
      Date.parse(clusters.generatedAt) >= now - DAY,
    'Unbound or stale failure clusters'
  );
  // Use the same production validator as the writer before any external write.
  // Passing no issues validates receipts without authorizing new quarantines.
  writer.updateQuarantine(ledger, report, {}, { headSha, now, fileHash });
  const plans = new Map();
  for (const cluster of clusters.clusters) {
    const mapped = writer.mapToLedgerPath(cluster?.file);
    if (
      !mapped ||
      mapped.kind !== 'unit' ||
      cluster.quarantineCandidate !== true
    )
      continue;
    requireFact(
      /^[a-f0-9]{16}$/.test(cluster.signature) &&
        typeof cluster.testId === 'string' &&
        cluster.testId.length <= 2000 &&
        typeof cluster.errorExcerpt === 'string' &&
        cluster.errorExcerpt.length <= 300 &&
        Array.isArray(cluster.runUrls) &&
        cluster.runUrls.length > 0 &&
        cluster.runUrls.length <= 10 &&
        cluster.runUrls.every(url => RUN.test(url)),
      'Malformed failure cluster'
    );
    const file = `apps/web/${mapped.path}`;
    const hash = fileHash(file);
    const attempts = new Set(
      report.observations
        .filter(
          row =>
            row.file === file &&
            row.fileHash === hash &&
            row.outcome === 'flaky' &&
            Date.parse(row.runAt) >= now - DAY
        )
        .map(row => `${row.runId}:${row.runAttempt}`)
    );
    if (attempts.size < 3) continue;
    const existing = plans.get(cluster.signature);
    requireFact(
      !existing || existing.file === file,
      'Ambiguous failure signature'
    );
    plans.set(cluster.signature, { file, cluster });
  }
  const issues = {};
  for (const [signature, { file, cluster }] of [...plans].sort(([a], [b]) =>
    a.localeCompare(b)
  )) {
    await lease();
    const fingerprint = `deflake:signature:${signature}`;
    const result = await upsert({
      fingerprint,
      title: `Flaky test incident (${fingerprint})`,
      description: [
        `Verified successful retries for ${file} in at least three distinct run attempts within 24 hours.`,
        `Test: ${cluster.testId}`,
        `Failure: ${cluster.errorExcerpt}`,
        ...cluster.runUrls,
        'Quarantine release requires 50 verified clean executions after the last failure and seven stable days. Missing, skipped or stale evidence cannot release a test.',
        `Fingerprint: ${fingerprint}`,
      ].join('\n\n'),
      priority: 2,
      createStateName: 'Todo',
      reopenTerminal: true,
    });
    requireFact(
      result.ok === true && LINEAR.test(result.url),
      'Canonical Linear intake failed'
    );
    await lease();
    issues[file] ??= result.url;
  }
  return issues;
}

export async function main() {
  const head = () =>
    execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
  const headSha = head();
  const original = readFileSync('apps/web/tests/quarantine.json', 'utf8');
  const fileHash = file =>
    existsSync(file)
      ? createHash('sha256').update(readFileSync(file)).digest('hex')
      : null;
  const lease = () =>
    requireFact(
      head() === headSha &&
        readFileSync('apps/web/tests/quarantine.json', 'utf8') === original,
      'Quarantine source lease changed'
    );
  const reportOnly = process.argv.includes('--report-only');
  const fileClusters = reportOnly
    ? fileReportedFlakeClusters
    : fileQuarantineClusters;
  const issues = await fileClusters({
    clusters: JSON.parse(readFileSync('flakiness-clusters.json', 'utf8')),
    report: reportOnly
      ? undefined
      : JSON.parse(readFileSync('quarantine-evidence.json', 'utf8')),
    ledger: JSON.parse(original),
    headSha,
    now: Date.now(),
    fileHash,
    lease,
  });
  lease();
  writeFileSync('flake-issues.json', `${JSON.stringify(issues, null, 2)}\n`, {
    flag: 'wx',
  });
  console.log(JSON.stringify({ trackedFiles: Object.keys(issues).length }));
}
if (
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  main().catch(error => {
    console.error(error.message);
    process.exitCode = 1;
  });
}
