import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { classifySourceDocs } from '../../scripts/lib/source-docs-scope.mjs';
import {
  assertInertSourceProse,
  MAX_PROSE_FILE_BYTES,
  MAX_PROSE_FILES,
  MAX_PROSE_TOTAL_BYTES,
  readSourceProseEntries,
} from '../../scripts/lib/source-prose.mjs';

const REPO = 'JovieInc/Jovie';
const SHA = /^[a-f0-9]{40}$/;
const HASH = /^[a-f0-9]{64}$/;
const positive = n => Number.isSafeInteger(n) && n > 0;
const repoRoot = fileURLToPath(new URL('../..', import.meta.url));
const DOCS_SCOPE_SCHEMA = 'jovie-source-docs-scope/v1';
const DOCS_SCOPE_FIELDS = [
  'schema',
  'schemaVersion',
  'repository',
  'headSha',
  'baseSha',
  'prNumber',
  'runId',
  'runAttempt',
  'event',
  'generatedAt',
  'paths',
  'pathsDigest',
].sort();
const pathsDigest = paths =>
  createHash('sha256').update(JSON.stringify(paths)).digest('hex');
function fact(ok, message) {
  if (!ok) throw new Error(message);
}
function receiptPath(name, environment = process.env) {
  const directory = resolve(environment.DEPENDENCY_PARITY_RECEIPT_DIR || '.');
  mkdirSync(directory, { recursive: true });
  return join(directory, name);
}
export function validateSourceDocsScopeIdentity(scope) {
  fact(
    scope &&
      typeof scope === 'object' &&
      !Array.isArray(scope) &&
      JSON.stringify(Object.keys(scope).sort()) ===
        JSON.stringify(DOCS_SCOPE_FIELDS) &&
      scope.schema === DOCS_SCOPE_SCHEMA &&
      scope.schemaVersion === 1 &&
      scope.repository === REPO &&
      SHA.test(scope.headSha) &&
      SHA.test(scope.baseSha) &&
      scope.headSha !== scope.baseSha &&
      positive(scope.prNumber) &&
      positive(scope.runId) &&
      positive(scope.runAttempt) &&
      scope.event === 'pull_request' &&
      Number.isFinite(Date.parse(scope.generatedAt)) &&
      Array.isArray(scope.paths) &&
      scope.paths.length > 0 &&
      scope.paths.length < 300 &&
      scope.paths.every(
        path => typeof path === 'string' && path.length <= 1024
      ) &&
      new Set(scope.paths).size === scope.paths.length &&
      JSON.stringify(scope.paths) === JSON.stringify([...scope.paths].sort()) &&
      HASH.test(scope.pathsDigest) &&
      scope.pathsDigest === pathsDigest(scope.paths),
    'Invalid source docs scope identity or paths'
  );
  return scope;
}
export function validateSourceDocsScope(
  scope,
  { root = repoRoot, readProseEntries = readSourceProseEntries } = {}
) {
  validateSourceDocsScopeIdentity(scope);
  assertInertSourceProse(
    scope.paths,
    readProseEntries({
      root,
      headSha: scope.headSha,
      baseSha: scope.baseSha,
      paths: scope.paths,
    })
  );
  const classification = classifySourceDocs(scope.paths, { root });
  fact(
    classification.eligible &&
      JSON.stringify(classification.paths) === JSON.stringify(scope.paths),
    `Ineligible source docs scope: ${classification.reasons.join(', ')}`
  );
  return scope;
}

/** Independent fallback when the combined checkout lacks constituent objects. */
export function readServerSourceProseEntries({
  headSha,
  paths,
  comparison,
  api,
}) {
  fact(
    Array.isArray(paths) && paths.length > 0 && paths.length <= MAX_PROSE_FILES,
    'Source prose file count exceeds its bound'
  );
  const head = comparison?.commits?.at(-1);
  const treeSha = head?.commit?.tree?.sha;
  fact(
    head?.sha === headSha && SHA.test(treeSha),
    'Unbound source prose head tree'
  );
  const tree = api(`repos/${REPO}/git/trees/${treeSha}?recursive=1`);
  fact(
    tree?.sha === treeSha &&
      tree.truncated === false &&
      Array.isArray(tree.tree),
    'Incomplete source prose head tree'
  );
  let total = 0;
  const selected = paths.map(path => {
    const matches = tree.tree.filter(entry => entry.path === path);
    fact(matches.length === 1, 'Missing or ambiguous source prose tree entry');
    const entry = matches[0];
    total += entry.size;
    fact(
      entry.mode === '100644' &&
        entry.type === 'blob' &&
        SHA.test(entry.sha) &&
        Number.isSafeInteger(entry.size) &&
        entry.size >= 0 &&
        entry.size <= MAX_PROSE_FILE_BYTES &&
        total <= MAX_PROSE_TOTAL_BYTES,
      'Source prose mode or byte bound is ineligible'
    );
    return entry;
  });
  const blobs = new Map();
  return selected.map(entry => {
    if (!blobs.has(entry.sha)) {
      const blob = api(`repos/${REPO}/git/blobs/${entry.sha}`);
      fact(
        blob?.sha === entry.sha &&
          blob.encoding === 'base64' &&
          blob.size === entry.size &&
          typeof blob.content === 'string' &&
          blob.content.length <= 2 * MAX_PROSE_FILE_BYTES + 1024,
        'Unbound or oversized source prose blob'
      );
      const encoded = blob.content.replace(/[\t\r\n ]/gu, '');
      const bytes = Buffer.from(encoded, 'base64');
      fact(
        bytes.length === entry.size && bytes.toString('base64') === encoded,
        'Malformed source prose blob encoding'
      );
      blobs.set(entry.sha, bytes);
    }
    return { ...entry, bytes: blobs.get(entry.sha) };
  });
}
export function writeSourceDocsScope(
  environment = process.env,
  execute = execFileSync
) {
  fact(
    environment.GITHUB_REPOSITORY === REPO,
    'Source docs repository mismatch'
  );
  fact(
    environment.GITHUB_EVENT_NAME === 'pull_request',
    'Source docs event mismatch'
  );
  const event = JSON.parse(readFileSync(environment.GITHUB_EVENT_PATH, 'utf8'));
  const pr = event.pull_request;
  const root = resolve(environment.GITHUB_WORKSPACE || process.cwd());
  fact(
    event.repository?.full_name === REPO &&
      positive(pr?.number) &&
      pr.number === event.number &&
      pr.head?.repo?.full_name === REPO &&
      pr.head.repo.fork === false &&
      pr.base?.repo?.full_name === REPO &&
      pr.base.ref === 'main' &&
      SHA.test(pr.head.sha) &&
      SHA.test(pr.base.sha),
    'Unbound source docs pull request'
  );
  /** @type {import('node:child_process').ExecFileSyncOptionsWithStringEncoding} */
  const options = {
    cwd: root,
    encoding: 'utf8',
    timeout: 30000,
    maxBuffer: 1024 * 1024,
    env: { ...process.env, ...environment },
  };
  // Hooks export repository routing; native checks must inspect this checkout.
  for (const name of execute('git', ['rev-parse', '--local-env-vars'], options)
    .trim()
    .split('\n')) {
    if (name) delete options.env[name];
  }
  const headSha = execute('git', ['rev-parse', 'HEAD'], options).trim();
  fact(headSha === pr.head.sha, 'Source docs source mismatch');
  fact(
    execute('git', ['diff', '--name-only', 'HEAD'], options).trim() === '',
    'Source docs checkout is modified'
  );
  fact(
    execute('git', ['merge-base', pr.base.sha, headSha], options).trim() ===
      pr.base.sha,
    'Source docs base is not an ancestor of the source head'
  );
  const commits = Number(
    execute(
      'git',
      ['rev-list', '--count', `${pr.base.sha}..${headSha}`],
      options
    ).trim()
  );
  fact(
    positive(commits) && commits <= 250,
    'Source docs range exceeds the complete compare bound'
  );
  fact(
    execute(
      'git',
      [
        'diff',
        '--diff-filter=D',
        '--no-renames',
        '--name-only',
        '-z',
        `${pr.base.sha}...${headSha}`,
        '--',
      ],
      options
    ) === '',
    'Source docs deletion or rename requires full validation'
  );
  // Disabling rename detection retains both the removed original and new path.
  const diff = execute(
    'git',
    [
      'diff',
      '--no-renames',
      '--name-only',
      '-z',
      `${pr.base.sha}...${headSha}`,
      '--',
    ],
    options
  );
  fact(diff.endsWith('\0'), 'Incomplete source docs native diff');
  const paths = [...new Set(diff.slice(0, -1).split('\0'))].sort();
  const scope = validateSourceDocsScope(
    {
      schema: DOCS_SCOPE_SCHEMA,
      schemaVersion: 1,
      repository: REPO,
      headSha,
      baseSha: pr.base.sha,
      prNumber: pr.number,
      runId: Number(environment.GITHUB_RUN_ID),
      runAttempt: Number(environment.GITHUB_RUN_ATTEMPT),
      event: environment.GITHUB_EVENT_NAME,
      generatedAt: new Date().toISOString(),
      paths,
      pathsDigest: pathsDigest(paths),
    },
    { root }
  );
  writeFileSync(
    receiptPath('source-docs-scope.json', environment),
    `${JSON.stringify(scope, null, 2)}\n`,
    { flag: 'wx' }
  );
  return scope;
}
export function verifySourceDocsComparison(scope, pr, comparison, root) {
  fact(
    scope.prNumber === pr.number && scope.headSha === pr.head.sha,
    'Unbound source docs base or pull request'
  );
  fact(
    comparison?.status === 'ahead' &&
      comparison.behind_by === 0 &&
      comparison.base_commit?.sha === scope.baseSha &&
      comparison.merge_base_commit?.sha === scope.baseSha &&
      Array.isArray(comparison.commits) &&
      comparison.commits.length > 0 &&
      comparison.commits.length <= 250 &&
      comparison.total_commits === comparison.commits.length &&
      comparison.ahead_by === comparison.commits.length &&
      comparison.commits.at(-1)?.sha === scope.headSha,
    'Source docs compare did not return the exact source base and head'
  );
  const files = comparison.files;
  fact(
    positive(pr.changed_files) &&
      pr.changed_files < 300 &&
      Array.isArray(files) &&
      files.length === pr.changed_files &&
      files.length < 300 &&
      new Set(files.map(file => file?.filename)).size === files.length,
    'Incomplete or truncated source docs file comparison'
  );
  const paths = [];
  for (const file of files) {
    fact(
      typeof file?.filename === 'string' &&
        ['added', 'modified'].includes(file.status) &&
        file.previous_filename === undefined,
      'Malformed source docs comparison file'
    );
    paths.push(file.filename);
  }
  const canonical = [...new Set(paths)].sort();
  const classification = classifySourceDocs(canonical, { root });
  fact(
    classification.eligible &&
      JSON.stringify(classification.paths) === JSON.stringify(canonical) &&
      JSON.stringify(scope.paths) === JSON.stringify(canonical) &&
      scope.pathsDigest === pathsDigest(canonical),
    'Source docs scope differs from the trusted complete source diff'
  );
}
export function verifySourceDocsMainAncestry(scope, pr, baseSnapshot, api) {
  fact(
    pr.base?.ref === 'main' &&
      pr.base.repo?.full_name === REPO &&
      SHA.test(baseSnapshot),
    'Unbound source docs main base snapshot'
  );
  if (scope.baseSha === baseSnapshot) return;
  // The exact request head is the server-backed main snapshot. Main ancestry
  // may span more than compare's commit page; only the source diff is capped.
  const ancestry = api(
    `repos/${REPO}/compare/${scope.baseSha}...${baseSnapshot}`
  );
  fact(
    ancestry?.status === 'ahead' &&
      ancestry.behind_by === 0 &&
      positive(ancestry.ahead_by) &&
      ancestry.base_commit?.sha === scope.baseSha &&
      ancestry.merge_base_commit?.sha === scope.baseSha,
    'Source docs proof base is not an ancestor of the trusted main snapshot'
  );
}
