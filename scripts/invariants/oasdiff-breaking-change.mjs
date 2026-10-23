#!/usr/bin/env node
/**
 * Blocking gate: breaking changes to the public OpenAPI contract. The public
 * artist API (`ARTIST_OPENAPI_DOCUMENT`, served at /api/v1/openapi.json and
 * /openapi.json) is rendered at the PR head and the merge base, diffed with a
 * pinned oasdiff binary, and breaking changes fail closed unless the PR body
 * carries an auditable marker line: `api-breaking: <reason>`. Additions pass;
 * approved breaks stay visible as warnings. Selected via SOURCE_GUARDS once
 * on the trusted base (prOnly: the marker lives in the pull_request body).
 * Guard-file edits trigger a HEAD self-check of the full pipeline.
 */

import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import {
  chmodSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

export const OASDIFF_SCHEMA = 'jovie.oasdiff-breaking-change/v1';

/** Pinned release. The tarball sha256 is verified before the binary runs. */
export const OASDIFF_VERSION = 'v1.34.1';
export const OASDIFF_TARBALL_URL = `https://github.com/oasdiff/oasdiff/releases/download/${OASDIFF_VERSION}/oasdiff_1.34.1_linux_amd64.tar.gz`;
export const OASDIFF_TARBALL_SHA256 =
  '75775f65b0adebd26a8e013af51a799342dfdc6262d89efa9e3b7bdf89657d90';

/** The rendered public contract and every source that can change it. */
export const SPEC_RENDERER = 'apps/web/scripts/render-public-openapi.ts';
export const SPEC_SOURCE_RE =
  /^(?:apps\/web\/(?:lib\/api\/v1\/|lib\/api\/public-agent-openapi\.ts$|lib\/music-resolver\/public-schemas\.ts$|app\/api\/v1\/openapi\.json\/route\.ts$|app\/openapi\.json\/route\.ts$|scripts\/render-public-openapi\.ts$)|scripts\/invariants\/oasdiff-breaking-change(?:\.test)?\.mjs$|scripts\/ci-fast-lanes\.mjs$)/u;

/** Exact, auditable PR-body marker. A reason is required on the same line. */
export const API_BREAKING_MARKER_RE =
  /^[ \t]*api-breaking:[ \t]+(\S[^\r\n]*)$/m;

export function readApiBreakingMarker(body) {
  if (typeof body !== 'string') return null;
  const match = body.match(API_BREAKING_MARKER_RE);
  return match ? match[1].trim() : null;
}

export function specSourcesChanged(changed) {
  return (changed ?? []).some(file => SPEC_SOURCE_RE.test(file));
}

export function guardFilesChanged(changed) {
  return (changed ?? []).some(file =>
    /^scripts\/invariants\/oasdiff-breaking-change(?:\.test)?\.mjs$/.test(file)
  );
}

/** Rewrite oasdiff's temp-file paths to the canonical spec source. */
export function annotationFor(line) {
  return line.replaceAll(
    /file=[^\s:]+::/gu,
    'file=apps/web/lib/api/v1/openapi.ts::'
  );
}

function git(repoRoot, args) {
  const result = spawnSync('git', args, { cwd: repoRoot, encoding: 'utf8' });
  return {
    code: result.status,
    output: (result.stdout ?? '') + (result.stderr ?? ''),
  };
}

export function changedFilesSince(repoRoot, baseRef) {
  const result = git(repoRoot, [
    'diff',
    '--name-only',
    '--diff-filter=ACDMRT',
    `${baseRef}...HEAD`,
  ]);
  if (result.code !== 0) return null;
  return result.output
    .split('\n')
    .map(line => line.trim())
    .filter(Boolean);
}

function tsxBinary(repoRoot) {
  return join(repoRoot, 'apps/web/node_modules/.bin/tsx');
}

/** Render the public OpenAPI document from a checkout via the repo tsx. */
export function renderSpecAt(repoRoot, treeRoot) {
  const tsx = tsxBinary(repoRoot);
  if (!existsSync(tsx)) {
    return {
      code: 1,
      error: `${SPEC_RENDERER} needs apps/web/node_modules (pnpm install) at ${repoRoot}`,
    };
  }
  const result = spawnSync(tsx, ['scripts/render-public-openapi.ts'], {
    cwd: join(treeRoot, 'apps/web'),
    encoding: 'utf8',
    maxBuffer: 32 * 1024 * 1024,
  });
  if (result.status !== 0) {
    return {
      code: 1,
      error: `spec render failed in ${treeRoot}: ${(result.stderr ?? result.stdout ?? '').slice(0, 500)}`,
    };
  }
  return { code: 0, document: result.stdout };
}

/**
 * Render the base document in a detached worktree at the merge base. The
 * base tree shares the head's installed node_modules through a symlink.
 */
export function renderBaseSpec(repoRoot, baseRef) {
  const base = git(repoRoot, ['merge-base', baseRef, 'HEAD']);
  if (base.code !== 0)
    return { code: 1, error: `no merge base with ${baseRef}` };
  const worktree = mkdtempSync(join(tmpdir(), 'jovie-oasdiff-base-'));
  try {
    const added = git(repoRoot, [
      'worktree',
      'add',
      '--detach',
      worktree,
      base.output.trim(),
    ]);
    if (added.code !== 0)
      return {
        code: 1,
        error: `git worktree add failed: ${added.output.slice(0, 300)}`,
      };
    const modules = join(worktree, 'apps/web/node_modules');
    if (!existsSync(modules)) {
      symlinkSync(join(repoRoot, 'apps/web/node_modules'), modules);
    }
    return renderSpecAt(repoRoot, worktree);
  } finally {
    git(repoRoot, ['worktree', 'remove', '--force', worktree]);
    rmSync(worktree, { recursive: true, force: true });
  }
}

/** Download the pinned tarball, verify its sha256, and expose the binary. */
export function ensureOasdiffBinary(options = {}) {
  if (process.env.OASDIFF_BIN && existsSync(process.env.OASDIFF_BIN)) {
    return { code: 0, binary: process.env.OASDIFF_BIN };
  }
  const cacheDir =
    options.cacheDir ??
    process.env.OASDIFF_CACHE_DIR ??
    join(tmpdir(), 'jovie-oasdiff');
  const binary = join(cacheDir, `oasdiff-${OASDIFF_VERSION}`);
  if (existsSync(binary)) return { code: 0, binary };
  const fetcher = options.fetchTarball ?? defaultFetchTarball;
  const fetched = fetcher(OASDIFF_TARBALL_URL);
  if (!fetched.ok)
    return {
      code: 1,
      error: `oasdiff ${OASDIFF_VERSION} download failed: ${fetched.error}`,
    };
  const digest = createHash('sha256').update(fetched.bytes).digest('hex');
  if (digest !== OASDIFF_TARBALL_SHA256) {
    return {
      code: 1,
      error: `oasdiff tarball sha256 ${digest} does not match the pinned ${OASDIFF_TARBALL_SHA256}`,
    };
  }
  mkdirSync(cacheDir, { recursive: true });
  const archive = join(cacheDir, `oasdiff-${OASDIFF_VERSION}.tar.gz`);
  writeFileSync(archive, fetched.bytes);
  const extracted = spawnSync(
    'tar',
    ['-xzf', archive, '-C', cacheDir, 'oasdiff'],
    { encoding: 'utf8' }
  );
  if (extracted.status !== 0) {
    return {
      code: 1,
      error: `oasdiff extract failed: ${(extracted.stderr ?? '').slice(0, 300)}`,
    };
  }
  chmodSync(join(cacheDir, 'oasdiff'), 0o755);
  const result = spawnSync('mv', [join(cacheDir, 'oasdiff'), binary], {
    encoding: 'utf8',
  });
  if (result.status !== 0)
    return { code: 1, error: 'oasdiff binary staging failed' };
  return { code: 0, binary };
}

function defaultFetchTarball(url) {
  const result = spawnSync(
    'curl',
    ['-sSL', '--retry', '3', '--max-time', '120', url],
    { maxBuffer: 128 * 1024 * 1024 }
  );
  if (result.status !== 0 || !result.stdout || result.stdout.length === 0) {
    return { ok: false, error: `curl exit ${result.status}` };
  }
  return { ok: true, bytes: result.stdout };
}

/**
 * oasdiff breaking base revision, githubactions format, fail on ERR.
 * v1.34.1 rejects `--color` unless the format is text or singleline
 * (exit 100), so this invocation does not pass it.
 */
export function runOasdiff(binary, basePath, revisionPath) {
  const result = spawnSync(
    binary,
    [
      'breaking',
      basePath,
      revisionPath,
      '-f',
      'githubactions',
      '--fail-on',
      'ERR',
    ],
    { encoding: 'utf8', maxBuffer: 32 * 1024 * 1024 }
  );
  return {
    code: result.status ?? 1,
    stdout: result.stdout ?? '',
    stderr: result.stderr ?? '',
  };
}

function writeSpec(tmp, name, document) {
  const path = join(tmp, name);
  writeFileSync(path, document);
  return path;
}

/**
 * @param {{
 *   repoRoot?: string,
 *   eventName?: string,
 *   body?: string | null,
 *   baseRef?: string,
 *   changed?: string[] | null,
 *   renderHead?: () => { code: number, document?: string, error?: string },
 *   renderBase?: (baseRef: string) => { code: number, document?: string, error?: string },
 *   ensureBinary?: () => { code: number, binary?: string, error?: string },
 *   diff?: (basePath: string, revisionPath: string) => { code: number, stdout: string, stderr: string },
 *   emit?: (line: string) => void,
 * }} [options]
 * @returns {{ code: number, reason: string }}
 */
export function checkOasdiffBreakingChange(options = {}) {
  const emit = options.emit ?? (line => process.stdout.write(`${line}\n`));
  const eventName = options.eventName ?? process.env.GITHUB_EVENT_NAME ?? '';
  if (eventName !== 'pull_request' && eventName !== '') {
    return {
      code: 0,
      reason: `oasdiff-breaking-change: ${eventName} is not a pull_request; nothing to check`,
    };
  }
  const changed =
    options.changed ??
    changedFilesSince(options.repoRoot ?? process.cwd(), options.baseRef);
  if (changed === null) {
    return {
      code: 1,
      reason:
        'oasdiff-breaking-change: could not read the changed-file diff; failing closed',
    };
  }
  if (!specSourcesChanged(changed)) {
    return {
      code: 0,
      reason: 'oasdiff-breaking-change: no public OpenAPI spec source changed',
    };
  }
  const renderHead =
    options.renderHead ??
    (() =>
      renderSpecAt(
        options.repoRoot ?? process.cwd(),
        options.repoRoot ?? process.cwd()
      ));
  const head = renderHead();
  if (head.code !== 0)
    return { code: 1, reason: `oasdiff-breaking-change: ${head.error}` };

  const selfCheck = guardFilesChanged(changed);
  const baseRef = selfCheck ? 'HEAD' : options.baseRef;
  if (selfCheck) {
    emit(
      `::notice::oasdiff-breaking-change self-check: guard files changed; running the full pipeline with the base at HEAD`
    );
  }
  const renderBase =
    options.renderBase ??
    (ref => renderBaseSpec(options.repoRoot ?? process.cwd(), ref));
  const base = renderBase(baseRef);
  if (base.code !== 0)
    return { code: 1, reason: `oasdiff-breaking-change: ${base.error}` };

  const ensureBinary = options.ensureBinary ?? ensureOasdiffBinary;
  const binary = ensureBinary();
  if (binary.code !== 0)
    return { code: 1, reason: `oasdiff-breaking-change: ${binary.error}` };

  const tmp = mkdtempSync(join(tmpdir(), 'jovie-oasdiff-run-'));
  try {
    const basePath = writeSpec(tmp, 'base-openapi.json', base.document);
    const revisionPath = writeSpec(tmp, 'revision-openapi.json', head.document);
    const diff = options.diff
      ? options.diff(basePath, revisionPath)
      : runOasdiff(binary.binary, basePath, revisionPath);
    if (diff.code !== 0 && diff.code !== 1) {
      return {
        code: 1,
        reason: `oasdiff-breaking-change: oasdiff failed (exit ${diff.code}): ${diff.stderr.slice(0, 300)}`,
      };
    }
    const annotations = diff.stdout
      .split('\n')
      .filter(line => line.startsWith('::error'));
    if (diff.code === 0 || annotations.length === 0) {
      emit(
        `::notice::oasdiff-breaking-change: no breaking changes to the public OpenAPI contract (additions pass)`
      );
      return { code: 0, reason: 'no breaking changes' };
    }
    const reason = readApiBreakingMarker(options.body);
    for (const line of annotations) emit(annotationFor(line));
    if (reason) {
      emit(`::warning::api-breaking marker accepted: ${reason}`);
      return {
        code: 0,
        reason: `breaking changes accepted by marker: ${reason}`,
      };
    }
    emit(
      `::error file=apps/web/lib/api/v1/openapi.ts::breaking changes to the public OpenAPI contract need an auditable PR-body marker: add a line "api-breaking: <reason>" describing the migration`
    );
    return {
      code: 1,
      reason: 'breaking changes without an api-breaking marker',
    };
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
}

function readEvent() {
  const path = process.env.GITHUB_EVENT_PATH;
  if (!path || !existsSync(path)) return {};
  try {
    return JSON.parse(readFileSync(path, 'utf8'));
  } catch {
    return {};
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const event = readEvent();
  const pull = event.pull_request ?? {};
  const baseBranch = process.env.GITHUB_BASE_REF ?? pull.base?.ref ?? 'main';
  const result = checkOasdiffBreakingChange({
    repoRoot: process.cwd(),
    eventName: process.env.GITHUB_EVENT_NAME,
    body: pull.body,
    baseRef: `origin/${baseBranch}`,
  });
  process.stdout.write(`${result.reason}\n`);
  process.exitCode = result.code;
}
