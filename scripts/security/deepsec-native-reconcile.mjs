import { createHash } from 'node:crypto';
import {
  fingerprint,
  redact,
  SEVERITY_ORDER,
  validateSuppressions,
} from './deepsec-loop.mjs';
import { SECURITY_TARGETS } from './deepsec-policy.mjs';
import { DEEPSEC_SUBSCRIPTION_VERSION } from './deepsec-subscription.mjs';

const LINEAR =
  /^https:\/\/linear\.app\/jovie\/issue\/JOV-\d+(?:\/[a-z0-9-]+)?$/;
const RUN = /^[A-Za-z0-9_-]{1,100}$/;
export const NATIVE_COMMENT_MARKER = '<!-- jovie-deepsec-native/v1 -->';
function fact(ok, message) {
  if (!ok) throw new Error(message);
}
export function emptyNativeLedger() {
  return {
    schemaVersion: 1,
    route: 'native-subscription',
    runs: [],
    entries: [],
  };
}
export function validateNativeLedger(ledger) {
  fact(
    ledger?.schemaVersion === 1 &&
      ledger.route === 'native-subscription' &&
      Array.isArray(ledger.runs) &&
      ledger.runs.length <= 200 &&
      ledger.runs.every(id => RUN.test(id)) &&
      new Set(ledger.runs).size === ledger.runs.length &&
      Array.isArray(ledger.entries) &&
      ledger.entries.length <= 1000,
    'Invalid native ledger'
  );
  const keys = new Set();
  for (const entry of ledger.entries) {
    fact(
      SECURITY_TARGETS.includes(entry?.path) &&
        typeof entry.slug === 'string' &&
        entry.slug.length > 0 &&
        entry.slug.length <= 200 &&
        entry.fp === fingerprint(entry.path, entry.slug) &&
        LINEAR.test(entry.issueUrl) &&
        Array.isArray(entry.cleanRuns) &&
        entry.cleanRuns.length <= 2 &&
        entry.cleanRuns.every(id => RUN.test(id)) &&
        new Set(entry.cleanRuns).size === entry.cleanRuns.length &&
        typeof entry.closed === 'boolean' &&
        typeof entry.observedOnMain === 'boolean' &&
        !keys.has(entry.fp),
      'Invalid native ledger entry'
    );
    keys.add(entry.fp);
  }
  return ledger;
}

/** Native findings remain advisory. Only complete, distinct main scans may close issues.
 * @param {object} input
 * @param {any} input.receipt
 * @param {any[]} input.findings
 * @param {string[]} input.files
 * @param {any} [input.suppressionDoc]
 * @param {any} input.ledger
 * @param {string} input.scope
 * @param {() => void|Promise<void>} input.lease
 * @param {(plan:any) => Promise<{ok:boolean,url?:string}>} input.upsert
 * @param {(plan:any) => Promise<{ok:boolean}>} input.close
 * @param {(body:string) => Promise<void>} [input.writeComment]
 */
export async function reconcileNativeScan({
  receipt,
  findings,
  files,
  ledger,
  suppressionDoc = { schemaVersion: 1, suppressions: [] },
  scope,
  lease,
  upsert,
  close,
  writeComment,
}) {
  validateNativeLedger(ledger);
  const suppressions = validateSuppressions(suppressionDoc);
  fact(scope === 'main' || scope === 'pr', 'Unknown native scan scope');
  fact(
    Array.isArray(files) &&
      files.length > 0 &&
      files.length <= 9 &&
      new Set(files).size === files.length &&
      files.every(file => SECURITY_TARGETS.includes(file)),
    'Invalid native scan roster'
  );
  const scanFingerprint = createHash('sha256')
    .update(
      JSON.stringify({ headSha: receipt?.headSha, files: [...files].sort() })
    )
    .digest('hex');
  fact(
    receipt?.schemaVersion === 1 &&
      receipt.route === 'native-subscription' &&
      receipt.scannerVersion === DEEPSEC_SUBSCRIPTION_VERSION &&
      /^[a-f0-9]{40}$/.test(receipt.headSha) &&
      RUN.test(receipt.nativeRunId) &&
      receipt.fingerprint === scanFingerprint &&
      receipt.filesScanned === files.length &&
      Number.isInteger(receipt.analyses) &&
      receipt.analyses >= 0 &&
      receipt.analyses <= files.length &&
      Array.isArray(findings) &&
      findings.length <= 100 &&
      receipt.findings === findings.length &&
      receipt.status ===
        (findings.length
          ? 'findings'
          : receipt.analyses
            ? 'clean'
            : 'no-candidates'),
    'Invalid native scan receipt'
  );
  // Replay is a no-op before external writes, including advisory comments.
  if (ledger.runs.includes(receipt.nativeRunId))
    return { ledger, replay: true };
  const groups = new Map();
  for (const finding of findings) {
    const metadata = finding?.metadata;
    fact(
      metadata?.projectId === 'jovie' &&
        files.includes(metadata.filePath) &&
        typeof metadata.vulnSlug === 'string' &&
        metadata.vulnSlug.length > 0 &&
        metadata.vulnSlug.length <= 200 &&
        SEVERITY_ORDER.includes(finding.severity) &&
        typeof finding.title === 'string' &&
        finding.title.length > 0 &&
        typeof finding.description === 'string' &&
        Array.isArray(metadata.lineNumbers) &&
        metadata.lineNumbers.length > 0 &&
        metadata.lineNumbers.every(
          line => Number.isSafeInteger(line) && line > 0
        ),
      'Malformed native finding'
    );
    const fp = fingerprint(metadata.filePath, metadata.vulnSlug);
    const group = groups.get(fp) ?? {
      fp,
      path: metadata.filePath,
      slug: metadata.vulnSlug,
      findings: [],
    };
    group.findings.push(finding);
    groups.set(fp, group);
  }
  const next = structuredClone(ledger);
  for (const [fp, group] of groups) {
    if (
      suppressions.some(
        entry => entry.fingerprint === fp && entry.path === group.path
      )
    )
      groups.delete(fp);
  }
  for (const group of groups.values()) {
    const lead = [...group.findings].sort(
      (a, b) =>
        SEVERITY_ORDER.indexOf(a.severity) - SEVERITY_ORDER.indexOf(b.severity)
    )[0];
    await lease();
    const result = await upsert({
      fingerprint: group.fp,
      title: `[security][${lead.severity}] ${redact(lead.title).slice(0, 90)} (${group.fp})`,
      description: redact(
        [
          `Native subscription scan ${receipt.nativeRunId}, source ${receipt.headSha}.`,
          `${group.path} (${group.slug})`,
          ...group.findings.map(
            f =>
              `Lines ${f.metadata.lineNumbers.join(', ')}: ${f.description.slice(0, 10000)}`
          ),
          'Two distinct complete native main scans must verify absence before automatic closure.',
        ].join('\n\n')
      ),
      priority:
        lead.severity === 'CRITICAL' ? 1 : lead.severity === 'HIGH' ? 2 : 3,
      createStateName: 'Todo',
      reopenTerminal: true,
    });
    fact(
      result.ok === true && LINEAR.test(result.url),
      'Canonical native Linear intake failed'
    );
    await lease();
    const entry = {
      fp: group.fp,
      path: group.path,
      slug: group.slug,
      issueUrl: result.url,
      cleanRuns: [],
      closed: false,
      observedOnMain: scope === 'main',
    };
    const index = next.entries.findIndex(row => row.fp === group.fp);
    if (index >= 0) next.entries[index] = entry;
    else next.entries.push(entry);
  }
  const completeClean =
    scope === 'main' &&
    receipt.status === 'clean' &&
    receipt.analyses === files.length;
  if (completeClean) {
    for (const entry of next.entries) {
      if (entry.closed || !entry.observedOnMain || !files.includes(entry.path))
        continue;
      if (!entry.cleanRuns.includes(receipt.nativeRunId))
        entry.cleanRuns.push(receipt.nativeRunId);
      if (entry.cleanRuns.length < 2) continue;
      await lease();
      const result = await close({
        fingerprint: entry.fp,
        runId: receipt.nativeRunId,
        comment: `Verified absent in complete native subscription scans ${entry.cleanRuns.join(', ')}; latest main ${receipt.headSha}.`,
      });
      fact(result.ok === true, 'Native Linear closure failed');
      await lease();
      entry.closed = true;
    }
  } else if (scope === 'main') {
    // Incomplete evidence interrupts consecutive-clean verification.
    for (const entry of next.entries) if (!entry.closed) entry.cleanRuns = [];
  }
  if (scope === 'pr' && writeComment) {
    await lease();
    const rows = [...groups.keys()].map(fp =>
      next.entries.find(entry => entry.fp === fp)
    );
    const status = rows.length
      ? rows.map(entry => `- ${entry.path}: ${entry.issueUrl}`).join('\n')
      : receipt.analyses === files.length
        ? 'No findings in this complete native scan.'
        : 'No exported findings; incomplete analysis cannot verify resolution.';
    await writeComment(
      `${NATIVE_COMMENT_MARKER}\nNative security advisory for ${receipt.headSha}.\n\n${status}`
    );
    await lease();
  }
  next.runs = [...next.runs, receipt.nativeRunId].slice(-200);
  validateNativeLedger(next);
  return { ledger: next, replay: false };
}
