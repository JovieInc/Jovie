import { createHash } from 'node:crypto';
import { isAbsolute, resolve } from 'node:path';
import { SECURITY_TARGETS } from './deepsec-policy.mjs';

export const DEEPSEC_SUBSCRIPTION_VERSION = '2.3.10';
const ALLOWED_ENV = new Set([
  'PATH',
  'HOME',
  'USER',
  'LOGNAME',
  'SHELL',
  'TERM',
  'TZ',
  'LANG',
  'CODEX_HOME',
  'TMPDIR',
  // Preserve the managed runtime's transport and TLS trust; API keys and
  // provider overrides remain excluded from native subscription execution.
  'HTTP_PROXY',
  'HTTPS_PROXY',
  'ALL_PROXY',
  'NO_PROXY',
  'http_proxy',
  'https_proxy',
  'all_proxy',
  'no_proxy',
  'NODE_EXTRA_CA_CERTS',
  'CODEX_PROXY_CERT',
  'SSL_CERT_FILE',
  'SSL_CERT_DIR',
  'REQUESTS_CA_BUNDLE',
  'CURL_CA_BUNDLE',
  'CODEX_EXEC_SERVER_PROXY_PRIVATE_IPS_VIA_UPSTREAM',
]);

export function subscriptionEnvironment(environment) {
  return Object.fromEntries(
    Object.entries(environment).filter(
      ([key, value]) =>
        typeof value === 'string' &&
        (ALLOWED_ENV.has(key) || /^LC_[A-Z_]+$/.test(key))
    )
  );
}

export function subscriptionPlan({
  sourceRoot,
  workspace,
  headSha,
  files,
  repository,
  headRepository,
}) {
  if (repository !== 'JovieInc/Jovie' || headRepository !== repository)
    throw new Error('same-repository source required');
  if (!/^[a-f0-9]{40}$/.test(headSha ?? ''))
    throw new Error('exact source revision required');
  if (
    !isAbsolute(sourceRoot ?? '') ||
    !isAbsolute(workspace ?? '') ||
    resolve(sourceRoot) !== sourceRoot ||
    resolve(workspace) !== workspace ||
    workspace === sourceRoot ||
    workspace.startsWith(`${sourceRoot}/`)
  )
    throw new Error('trusted scanner workspace must be outside source');
  if (
    !Array.isArray(files) ||
    !files.length ||
    files.length > SECURITY_TARGETS.length ||
    new Set(files).size !== files.length ||
    files.some(file => !SECURITY_TARGETS.includes(file))
  )
    throw new Error('bounded security-target roster required');
  const ordered = [...files].sort();
  const fingerprint = createHash('sha256')
    .update(JSON.stringify({ headSha, files: ordered }))
    .digest('hex');
  return {
    headSha,
    files: ordered,
    fingerprint,
    config: {
      ai: { mode: 'local', provider: 'local' },
      defaultAgent: 'codex',
      dataDir: `${workspace}/data`,
      projects: [{ id: 'jovie', root: sourceRoot, priorityPaths: ordered }],
    },
    admission: [
      ['deepsec', '--version'],
      ['codex', 'login', 'status'],
    ],
    command: [
      'deepsec',
      'process',
      '--project-id',
      'jovie',
      '--agent',
      'codex',
      '--model',
      'gpt-6',
      '--root',
      sourceRoot,
      '--files-from',
      `${workspace}/files.txt`,
      '--limit',
      String(ordered.length),
      '--concurrency',
      '1',
      '--batch-size',
      '1',
      '--max-turns',
      '4',
      '--comment-out',
      `${workspace}/findings.md`,
    ],
    exportCommand: [
      'deepsec',
      'export',
      '--project-id',
      'jovie',
      '--format',
      'json',
      '--out',
      `${workspace}/findings.json`,
    ],
  };
}

export function admitSubscription({ version, login }) {
  if (
    version.status !== 0 ||
    (version.stdout ?? '').trim() !== DEEPSEC_SUBSCRIPTION_VERSION
  )
    throw new Error('pinned DeepSec version required');
  // Read-only CLI status distinguishes ChatGPT login from an API-key login.
  // Do not return or print the provider's credential-bearing status output.
  if (
    login.status !== 0 ||
    !/^Logged in using ChatGPT\s*$/i.test(
      `${login.stdout ?? ''}${login.stderr ?? ''}`.trim()
    )
  )
    throw new Error('native ChatGPT subscription login required');
  return true;
}

export function subscriptionReceipt({
  plan,
  result,
  findings,
  observedHead,
  sourceChanged,
}) {
  if (observedHead !== plan.headSha || sourceChanged !== false)
    throw new Error('source changed during scan');
  const output = (result.stdout ?? '').replace(/\u001b\[[0-9;]*m/g, '');
  const scanned = [...output.matchAll(/^Scanning (\d+) file\(s\)…$/gm)];
  const analyses = [...output.matchAll(/^  Analyses: (\d+)$/gm)];
  const counts = [...output.matchAll(/^  Findings: (\d+)$/gm)];
  if (
    scanned.length !== 1 ||
    Number(scanned[0][1]) !== plan.files.length ||
    analyses.length !== 1 ||
    counts.length !== 1 ||
    Number(analyses[0][1]) > plan.files.length ||
    !/^Processing complete\. Run: \S+$/m.test(output)
  )
    throw new Error('complete native scan summary required');
  const count = Number(counts[0][1]);
  const terminal =
    count === 0
      ? /(?:^|\n)No findings\.\s*$/
      : new RegExp(`(?:^|\\n)${count} new finding\\(s\\) — exiting 1\\s*$`);
  if (
    result.error ||
    result.signal ||
    result.status !== (count ? 1 : 0) ||
    !terminal.test(output) ||
    /Errored batches:|quota exhausted|usage limit|agent failure/i.test(output)
  )
    throw new Error('incomplete or failed native scan');
  if (
    !Array.isArray(findings) ||
    findings.length !== count ||
    findings.some(
      finding =>
        !finding ||
        typeof finding !== 'object' ||
        finding.metadata?.projectId !== 'jovie' ||
        !plan.files.includes(finding.metadata?.filePath) ||
        typeof finding.metadata?.vulnSlug !== 'string' ||
        !finding.metadata.vulnSlug ||
        !Array.isArray(finding.metadata?.lineNumbers) ||
        !finding.metadata.lineNumbers.length ||
        finding.metadata.lineNumbers.some(
          line => !Number.isInteger(line) || line < 1
        )
    )
  )
    throw new Error('findings must bind to the scanned target roster');
  const keys = findings.map(finding =>
    JSON.stringify([
      finding.metadata.filePath,
      finding.metadata.vulnSlug,
      [...finding.metadata.lineNumbers].sort((a, b) => a - b),
    ])
  );
  if (new Set(keys).size !== keys.length)
    throw new Error('ambiguous duplicate findings');
  return {
    schemaVersion: 1,
    route: 'native-subscription',
    scannerVersion: DEEPSEC_SUBSCRIPTION_VERSION,
    headSha: plan.headSha,
    fingerprint: plan.fingerprint,
    filesScanned: plan.files.length,
    analyses: Number(analyses[0][1]),
    findings: count,
    status: count
      ? 'findings'
      : Number(analyses[0][1])
        ? 'clean'
        : 'no-candidates',
  };
}
