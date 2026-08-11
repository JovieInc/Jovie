#!/usr/bin/env node

import { execFileSync, spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { dirname, extname, join, normalize } from 'node:path/posix';
import { pathToFileURL } from 'node:url';
import ts from 'typescript';

export const ISOLATED_UI_DOCS_SCHEMA = 'jovie-isolated-ui-docs/v1';
export const REQUIRED_ISOLATED_CHECKS = Object.freeze([
  'PR Ready',
  'Migration Guard',
  'Fork PR Gate',
  'PR Size Guard',
]);

const SHA_RE = /^[0-9a-f]{40}$/;
const MAX_CHANGED_FILES = 12;
const MAX_CHANGED_LINES = 500;
const EXECUTABLE_RE = /\.(?:[cm]?[jt]sx?)$/;
const SEMANTIC_TEXT_RE = /\.(?:[cm]?[jt]sx?|css)$/;
const DOC_RE = /^(?:docs\/.*\.(?:md|png|jpe?g|webp|gif|svg)|DESIGN\.md)$/;
const ASSET_RE = /^apps\/web\/public\/.*\.(?:png|jpe?g|webp|gif)$/;
const STYLE_RE = /^(?:apps\/web\/(?:components|styles)|packages\/ui)\/.*\.css$/;
const ATOM_RE =
  /^(?:apps\/web\/components\/atoms|packages\/ui\/atoms)\/.*\.(?:[cm]?[jt]sx?)$/;
const ATOM_TEST_RE =
  /^(?:apps\/web\/tests\/(?:components|unit)\/atoms|apps\/web\/components\/atoms|packages\/ui\/atoms)\/.*\.(?:test|spec)\.(?:[cm]?[jt]sx?)$/;

const DENIED_PATHS = [
  {
    reason: 'auth or identity',
    pattern: /(^|\/)(?:auth|clerk|session|identity)(\/|\.|-|$)/i,
  },
  {
    reason: 'data, database, or persistence',
    pattern:
      /(^|\/)(?:api|data|db|drizzle|supabase|upstash|persistence|repository)(\/|\.|-|$)/i,
  },
  {
    reason: 'billing or entitlements',
    pattern:
      /(^|\/)(?:billing|stripe|payment|checkout|entitlements|permissions)(\/|\.|-|$)/i,
  },
  {
    reason: 'runtime, routing, or configuration',
    pattern:
      /(^|\/)(?:runtime|config|env|route|router|middleware|proxy|server|actions?)(\/|\.|-|$)/i,
  },
  {
    reason: 'dependency or control plane',
    pattern:
      /(^|\/)(?:package\.json|pnpm-lock\.yaml|pnpm-workspace\.yaml|\.github|scripts|infra)(\/|$)/i,
  },
];

const DENIED_SOURCE_PATTERNS = [
  { reason: 'server directive', pattern: /['"]use server['"]/ },
  {
    reason: 'environment access',
    pattern: /\b(?:process|import\.meta)\.env\b/,
  },
  {
    reason: 'network or server access',
    pattern: /\b(?:fetch|WebSocket|EventSource|XMLHttpRequest)\s*\(/,
  },
  {
    reason: 'server runtime API',
    pattern:
      /\b(?:cookies|headers|redirect|notFound|revalidatePath|revalidateTag)\s*\(/,
  },
  {
    reason: 'data mutation/query hook',
    pattern: /\b(?:useQuery|useMutation|useSWR|mutateAsync|serverAction)\b/,
  },
  {
    reason: 'storage or cookie access',
    pattern: /\b(?:localStorage|sessionStorage|document\.cookie|indexedDB)\b/,
  },
  {
    reason: 'async runtime behavior',
    pattern: /\b(?:async\s+function|async\s*\(|await\s+)/,
  },
  {
    reason: 'navigation or browser mutation',
    pattern:
      /\b(?:window\.open|history\.(?:pushState|replaceState)|location\.(?:assign|replace))\s*\(/,
  },
  {
    reason: 'non-literal dynamic import',
    pattern: /\b(?:import|require)\s*\(\s*(?!['"])/,
  },
];

const DENIED_STYLE_PATTERNS = [
  {
    reason: 'remote or executable CSS import',
    pattern: /@import\b|url\(\s*['"]?(?:https?:|data:|javascript:|\/\/)/i,
  },
  {
    reason: 'legacy executable CSS',
    pattern: /\b(?:expression|behavior|-moz-binding)\s*:/i,
  },
];

const PRESENTATION_IMPORT_RE =
  /^(?:react(?:\/.*)?|next\/(?:image|link)|lucide-react|motion\/react|dompurify|class-variance-authority|clsx|tailwind-merge|@jovie\/ui(?:\/atoms(?:\/.*)?|\/lib\/utils)?|@radix-ui\/.*|@base-ui-components\/.*)$/;
const TEST_IMPORT_RE =
  /^(?:vitest|node:(?:fs|path)|@testing-library\/.*|@storybook\/.*)$/;
const LOCAL_IMPORT_EXTENSIONS = Object.freeze([
  '.js',
  '.jsx',
  '.mjs',
  '.cjs',
  '.ts',
  '.tsx',
  '.mts',
  '.cts',
  '.css',
]);

const SCREENSHOT_RE =
  /!\[[^\]]*]\([^)]+\)|<img\b|https?:\/\/\S+\.(?:png|jpe?g|gif|webp)/i;

function normalizePath(value = '') {
  return String(value).replace(/^\.\//, '');
}

function normalizeStatus(value = '') {
  return String(value).toUpperCase();
}

function stableJson(value) {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.keys(value)
      .sort()
      .map(key => `${JSON.stringify(key)}:${stableJson(value[key])}`)
      .join(',')}}`;
  }
  return JSON.stringify(value);
}

function sha256(value) {
  return createHash('sha256').update(value).digest('hex');
}

function evidenceSection(body = '') {
  const lines = String(body).split('\n');
  const start = lines.findIndex(line =>
    /^##\s+Isolated UI\/docs evidence\s*$/i.test(line.trim())
  );
  if (start < 0) return '';
  const section = [];
  for (const line of lines.slice(start + 1)) {
    if (/^##\s+/.test(line.trim())) break;
    section.push(line.trim());
  }
  return section
    .filter(Boolean)
    .filter(line => !/\b(?:not run|missing|skipped|without|none)\b/i.test(line))
    .join('\n');
}

function classifyEvidence(body, { docsOnly }) {
  const section = evidenceSection(body);
  const lines = section.split('\n').filter(Boolean);
  const has = pattern => lines.some(line => pattern.test(line));
  const screenshots = lines.filter(line => SCREENSHOT_RE.test(line));
  return {
    sectionPresent: section.length > 0,
    beforeScreenshot: screenshots.some(line => /\bbefore\b/i.test(line)),
    afterScreenshot: screenshots.some(line => /\bafter\b/i.test(line)),
    typecheck: has(/\btypecheck\b/i),
    lint: has(/\b(?:biome|lint)\b/i),
    focusedTest: has(/\b(?:vitest|focused test|affected test)\b/i),
    docsProof: has(/\bdocs? proof\b|\brendered docs?\b/i),
    mode: docsOnly ? 'docs' : 'ui',
  };
}

function classifyRequiredChecks(checks = []) {
  const blockers = [];
  const terminalFailure = new Set([
    'FAILURE',
    'ERROR',
    'TIMED_OUT',
    'ACTION_REQUIRED',
    'STARTUP_FAILURE',
  ]);
  for (const required of REQUIRED_ISOLATED_CHECKS) {
    const matches = checks.filter(check => {
      const name = String(check.name || '').replace(/^CI \/ /, '');
      return name === required;
    });
    if (matches.length === 0) {
      blockers.push(`${required} (missing)`);
      continue;
    }
    const hasTerminalFailure = matches.some(
      check =>
        terminalFailure.has(normalizeStatus(check.state || check.conclusion)) ||
        String(check.bucket || '').toLowerCase() === 'fail'
    );
    const hasSuccess = matches.some(
      check =>
        normalizeStatus(check.state || check.conclusion) === 'SUCCESS' ||
        String(check.bucket || '').toLowerCase() === 'pass'
    );
    if (hasTerminalFailure || !hasSuccess) {
      blockers.push(`${required} (not successful)`);
    }
  }
  return { ok: blockers.length === 0, blockers };
}

function removedPatchLines(patch = '') {
  return String(patch)
    .split('\n')
    .filter(line => line.startsWith('-') && !line.startsWith('---'));
}

function resolvesToPinnedPresentationFile(source, file, files) {
  if (!source.startsWith('.')) return false;
  const resolved = normalize(join(dirname(file.filename), source));
  if (
    resolved === '..' ||
    resolved.startsWith('../') ||
    resolved.startsWith('/')
  ) {
    return false;
  }

  const candidates = new Set([resolved]);
  if (!extname(resolved)) {
    for (const extension of LOCAL_IMPORT_EXTENSIONS) {
      candidates.add(`${resolved}${extension}`);
      candidates.add(join(resolved, `index${extension}`));
    }
  }

  return files.some(input => {
    const filename = normalizePath(input.filename);
    return (
      candidates.has(filename) &&
      (ATOM_RE.test(filename) ||
        ATOM_TEST_RE.test(filename) ||
        STYLE_RE.test(filename))
    );
  });
}

function containsPathTraversal(source) {
  return source.split('/').some(segment => segment === '.' || segment === '..');
}

function allowedImportSource(source, file, files) {
  if (source.startsWith('.')) {
    return resolvesToPinnedPresentationFile(source, file, files);
  }
  if (containsPathTraversal(source)) return false;
  if (PRESENTATION_IMPORT_RE.test(source)) return true;
  if (file.kind === 'test' && TEST_IMPORT_RE.test(source)) return true;
  if (/^@\/components\/atoms(?:\/|$)/.test(source)) return true;
  if (source === '@/lib/utils') return true;
  if (
    file.filename.startsWith('packages/ui/atoms/') &&
    /^\.\.\/lib\/(?:utils|dropdown-styles)$/.test(source)
  ) {
    return true;
  }
  return false;
}

function executableImportSources(content, filename) {
  const sourceFile = ts.createSourceFile(
    filename,
    content,
    ts.ScriptTarget.Latest,
    true
  );
  const parseDiagnostics = Reflect.get(sourceFile, 'parseDiagnostics');
  if (!Array.isArray(parseDiagnostics) || parseDiagnostics.length > 0)
    return null;
  const sources = [];
  let complete = true;
  const visit = node => {
    let specifier;
    if (
      (ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) &&
      node.moduleSpecifier
    ) {
      specifier = node.moduleSpecifier;
    } else if (
      ts.isCallExpression(node) &&
      (node.expression.kind === ts.SyntaxKind.ImportKeyword ||
        (ts.isIdentifier(node.expression) &&
          node.expression.text === 'require'))
    ) {
      [specifier] = node.arguments;
    }
    if (specifier) {
      if (ts.isStringLiteralLike(specifier)) sources.push(specifier.text);
      else complete = false;
    }
    ts.forEachChild(node, visit);
  };
  visit(sourceFile);
  return complete ? sources : null;
}

function semanticBlockers(file, files) {
  const blockers = [];
  const content = String(file.content || '');
  if (!content.trim()) {
    blockers.push(`${file.filename}: exact source content is unavailable`);
    return blockers;
  }
  const imports = EXECUTABLE_RE.test(file.filename)
    ? executableImportSources(content, file.filename)
    : [...content.matchAll(/@import\s+['"]([^'"]+)['"]/g)].map(
        match => match[1]
      );
  if (imports === null) {
    blockers.push(`${file.filename}: module syntax cannot be inspected safely`);
    return blockers;
  }

  for (const source of imports) {
    const denied = DENIED_PATHS.find(entry => entry.pattern.test(source));
    if (denied)
      blockers.push(
        `${file.filename}: import ${source} reaches ${denied.reason}`
      );
    if (!allowedImportSource(source, file, files)) {
      blockers.push(
        `${file.filename}: import ${source} is not presentation-only`
      );
    }
  }
  for (const entry of DENIED_SOURCE_PATTERNS) {
    if (entry.pattern.test(content)) {
      blockers.push(`${file.filename}: contains ${entry.reason}`);
    }
  }
  return blockers;
}

function styleBlockers(file) {
  const content = String(file.content || '');
  if (!content.trim())
    return [`${file.filename}: exact stylesheet content is unavailable`];
  return DENIED_STYLE_PATTERNS.filter(entry => entry.pattern.test(content)).map(
    entry => `${file.filename}: contains ${entry.reason}`
  );
}

/**
 * @typedef {object} IsolatedUiDocsDeltaOptions
 * @property {number} [prNumber]
 * @property {string} [baseSha]
 * @property {string} [headSha]
 * @property {string} [body]
 * @property {Array<any>} [files]
 * @property {Array<any>} [checks]
 * @property {any} [fleetGate]
 */

/**
 * @param {IsolatedUiDocsDeltaOptions} [options]
 */
export function evaluateIsolatedUiDocsDelta({
  prNumber,
  baseSha,
  headSha,
  body = '',
  files = [],
  checks = [],
  fleetGate,
} = {}) {
  const blockers = [];
  const normalizedBase = String(baseSha || '').toLowerCase();
  const normalizedHead = String(headSha || '').toLowerCase();

  if (!Number.isInteger(prNumber) || prNumber <= 0)
    blockers.push('invalid PR number');
  if (!SHA_RE.test(normalizedBase)) blockers.push('invalid exact base SHA');
  if (!SHA_RE.test(normalizedHead)) blockers.push('invalid exact head SHA');
  if (normalizedBase === normalizedHead)
    blockers.push('base and head must differ');
  if (fleetGate?.schema !== 'jovie-fleet-gate/v1')
    blockers.push('fleet gate schema is missing or invalid');
  if (fleetGate?.isolatedPromotionAdmission?.allowed !== true)
    blockers.push('fleet gate does not authorize isolated promotion');
  if (fleetGate?.signals?.main?.sha !== normalizedBase)
    blockers.push('fleet gate main SHA does not match exact PR base');
  if (fleetGate?.signals?.main?.status !== 'green')
    blockers.push('main is not explicitly green');
  if (fleetGate?.signals?.production?.status !== 'red')
    blockers.push('production is not explicitly red');
  if (!['clear', 'resolved'].includes(fleetGate?.signals?.integrity?.status))
    blockers.push('integrity is not explicitly clear');

  if (!Array.isArray(files) || files.length === 0)
    blockers.push('changed files are required');
  if (files.length > MAX_CHANGED_FILES)
    blockers.push(`changed file count exceeds ${MAX_CHANGED_FILES}`);
  const totalChanges = files.reduce(
    (sum, file) => sum + Number(file.changes || 0),
    0
  );
  if (totalChanges > MAX_CHANGED_LINES)
    blockers.push(`changed line count exceeds ${MAX_CHANGED_LINES}`);

  const classified = [];
  for (const input of files) {
    const file = {
      ...input,
      filename: normalizePath(input.filename),
      status: String(input.status || '').toLowerCase(),
    };
    const denied = DENIED_PATHS.find(entry =>
      entry.pattern.test(file.filename)
    );
    if (denied) blockers.push(`${file.filename}: ${denied.reason}`);
    if (!['added', 'modified'].includes(file.status))
      blockers.push(
        `${file.filename}: status ${file.status || 'unknown'} is not additive`
      );
    if (!SHA_RE.test(String(file.sha || '').toLowerCase()))
      blockers.push(`${file.filename}: exact blob SHA is missing or invalid`);

    const kind = DOC_RE.test(file.filename)
      ? 'docs'
      : ASSET_RE.test(file.filename)
        ? 'asset'
        : STYLE_RE.test(file.filename)
          ? 'style'
          : ATOM_TEST_RE.test(file.filename)
            ? 'test'
            : ATOM_RE.test(file.filename)
              ? 'atom'
              : 'blocked';
    if (kind === 'blocked')
      blockers.push(`${file.filename}: not in the isolated UI/docs allowlist`);
    if (
      kind === 'test' &&
      file.status === 'modified' &&
      (!file.patch || removedPatchLines(file.patch).length > 0)
    ) {
      blockers.push(
        `${file.filename}: test changes must be additive with no removed lines`
      );
    }
    const classifiedFile = { ...file, kind };
    if (EXECUTABLE_RE.test(file.filename))
      blockers.push(...semanticBlockers(classifiedFile, files));
    if (kind === 'style') blockers.push(...styleBlockers(classifiedFile));
    classified.push(classifiedFile);
  }

  const docsOnly = classified.every(file =>
    ['docs', 'asset'].includes(file.kind)
  );
  const evidence = classifyEvidence(body, { docsOnly });
  if (!evidence.sectionPresent)
    blockers.push('missing Isolated UI/docs evidence section');
  if (docsOnly) {
    if (!evidence.docsProof) blockers.push('missing rendered docs proof');
  } else {
    if (!evidence.beforeScreenshot || !evidence.afterScreenshot)
      blockers.push('missing before/after visual evidence');
    if (!evidence.typecheck)
      blockers.push('missing exact-head typecheck evidence');
    if (!evidence.lint) blockers.push('missing exact-head lint/Biome evidence');
    if (!evidence.focusedTest) blockers.push('missing focused test evidence');
    if (!classified.some(file => file.kind === 'test'))
      blockers.push('UI changes require an additive focused test delta');
  }

  const requiredChecks = classifyRequiredChecks(checks);
  blockers.push(...requiredChecks.blockers);

  const manifest = classified
    .map(file => ({
      filename: file.filename,
      status: file.status,
      blobSha: file.sha || null,
      additions: Number(file.additions || 0),
      deletions: Number(file.deletions || 0),
      changes: Number(file.changes || 0),
      patchSha256: file.patch ? sha256(file.patch) : null,
    }))
    .sort((left, right) => left.filename.localeCompare(right.filename));
  const diffSha256 = sha256(
    stableJson({
      baseSha: normalizedBase,
      headSha: normalizedHead,
      files: manifest,
    })
  );

  return {
    schema: ISOLATED_UI_DOCS_SCHEMA,
    allowed: blockers.length === 0,
    blockers: [...new Set(blockers)].sort(),
    pinned: {
      prNumber,
      baseSha: normalizedBase,
      headSha: normalizedHead,
      diffSha256,
    },
    limits: {
      maxChangedFiles: MAX_CHANGED_FILES,
      maxChangedLines: MAX_CHANGED_LINES,
    },
    files: manifest,
    evidence,
    requiredChecks,
    authority: {
      labelsUsed: false,
      controller: 'merge-queue-autoenroll',
      transport: 'github-native-merge-queue',
      deploymentAllowed: false,
    },
  };
}

function ghJson(args) {
  return JSON.parse(
    execFileSync('gh', args, { encoding: 'utf8', maxBuffer: 30 * 1024 * 1024 })
  );
}

function ghChecks(repo, prNumber) {
  const result = spawnSync(
    'gh',
    [
      'pr',
      'checks',
      String(prNumber),
      '-R',
      repo,
      '--json',
      'name,bucket,state,workflow,startedAt,completedAt',
    ],
    { encoding: 'utf8', maxBuffer: 30 * 1024 * 1024 }
  );
  if (![0, 8].includes(result.status) || !result.stdout.trim()) {
    throw new Error(
      result.stderr.trim() || 'required check status unavailable'
    );
  }
  return JSON.parse(result.stdout);
}

function decodeFleetGate(value) {
  const decoded = Buffer.from(String(value || ''), 'base64').toString('utf8');
  return JSON.parse(decoded);
}

function loadLiveDelta({ repo, prNumber, expectedHead }) {
  const pr = ghJson(['api', `repos/${repo}/pulls/${prNumber}`]);
  if (Number(pr.changed_files) > MAX_CHANGED_FILES)
    throw new Error(`changed file count exceeds ${MAX_CHANGED_FILES}`);
  if (Number(pr.additions) + Number(pr.deletions) > MAX_CHANGED_LINES)
    throw new Error(`changed line count exceeds ${MAX_CHANGED_LINES}`);
  const currentMain = ghJson(['api', `repos/${repo}/git/ref/heads/main`]).object
    ?.sha;
  const files = ghJson([
    'api',
    '--paginate',
    `repos/${repo}/pulls/${prNumber}/files?per_page=100`,
    '--slurp',
  ]).flat();
  if (files.length !== pr.changed_files)
    throw new Error('GitHub changed-file pagination was incomplete');
  const enriched = files.map(file => {
    let content = '';
    if (SEMANTIC_TEXT_RE.test(file.filename) && file.status !== 'removed') {
      const blob = ghJson(['api', `repos/${repo}/git/blobs/${file.sha}`]);
      if (blob.encoding !== 'base64')
        throw new Error(`${file.filename}: blob encoding is not base64`);
      content = Buffer.from(blob.content, 'base64').toString('utf8');
    }
    return { ...file, content };
  });
  return {
    pr,
    currentMain: String(currentMain || '').toLowerCase(),
    files: enriched,
    checks: ghChecks(repo, prNumber),
    expectedHead: String(expectedHead || '').toLowerCase(),
  };
}

export function validateFleetGateFreshness(
  fleetGate,
  { now = new Date().toISOString() } = {}
) {
  const observed = Date.parse(fleetGate?.observedAt || '');
  const nowMs = Date.parse(now);
  return (
    Number.isFinite(observed) &&
    Number.isFinite(nowMs) &&
    observed <= nowMs + 60_000 &&
    nowMs - observed <= 10 * 60 * 1000
  );
}

async function main() {
  if (process.argv[2] !== 'evaluate-live') {
    throw new Error(
      'Usage: isolated-ui-docs-policy.mjs evaluate-live --repo owner/repo --pr N --head SHA --fleet-gate-b64 BASE64'
    );
  }
  const value = flag =>
    process.argv
      .find(arg => arg.startsWith(`${flag}=`))
      ?.slice(flag.length + 1);
  const repo = value('--repo');
  const prNumber = Number(value('--pr'));
  const expectedHead = value('--head');
  const fleetGate = decodeFleetGate(value('--fleet-gate-b64'));
  if (!validateFleetGateFreshness(fleetGate))
    throw new Error('fleet gate receipt is missing, stale, or future-dated');
  const live = loadLiveDelta({ repo, prNumber, expectedHead });
  const liveHead = String(live.pr.head?.sha || '').toLowerCase();
  const liveBase = String(live.pr.base?.sha || '').toLowerCase();
  if (live.pr.state !== 'open' || live.pr.base?.ref !== 'main')
    throw new Error('PR is not an open main-targeting change');
  if (!SHA_RE.test(live.expectedHead) || liveHead !== live.expectedHead)
    throw new Error('event head no longer matches live PR head');
  if (liveBase !== live.currentMain)
    throw new Error('PR base is not exact current main');
  const receipt = evaluateIsolatedUiDocsDelta({
    prNumber,
    baseSha: liveBase,
    headSha: liveHead,
    body: live.pr.body || '',
    files: live.files,
    checks: live.checks,
    fleetGate,
  });
  console.log(JSON.stringify(receipt));
  process.exitCode = receipt.allowed ? 0 : 2;
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  main().catch(error => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 2;
  });
}
