// Bounded review context from git objects only. PR code is read as data with
// `git diff`, `git show` and `git grep`; nothing from the PR is executed.

import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

export const DEFAULT_CONTEXT_LIMITS = Object.freeze({
  maxBytes: 120_000,
  maxFiles: 40,
  maxImportersPerFile: 3,
  diffContextLines: 20,
});

const REVIEWABLE_RE = /\.(?:[cm]?[jt]sx?|json|ya?ml|sql|sh|py|swift|md)$/i;
const SKIP_RE =
  /(?:^|\/)(?:pnpm-lock\.yaml|package-lock\.json|.*\.snap|.*\.min\.js)$|(?:^|\/)(?:generated|__snapshots__)\//;
const IMPORTABLE_RE = /\.(?:[cm]?[jt]sx?)$/i;
const SHA_RE = /^[0-9a-f]{40}$/;

/** Default runner: `git` with a bounded output buffer. */
export async function runGit(args) {
  const { stdout } = await execFileAsync('git', args, {
    maxBuffer: 16 * 1024 * 1024,
  });
  return stdout;
}

function moduleStem(path) {
  const file = path.split('/').pop() ?? '';
  const stem = file.replace(/\.[^.]+$/, '');
  return stem === 'index' ? (path.split('/').at(-2) ?? '') : stem;
}

/**
 * Collect changed-file diffs and a few importers of each changed module.
 * Anything dropped for size is listed in `truncated` so the receipt can mark
 * it not-assessed instead of reporting it clean.
 */
export async function collectContext({
  baseSha,
  headSha,
  git = runGit,
  limits = DEFAULT_CONTEXT_LIMITS,
}) {
  if (!SHA_RE.test(baseSha ?? '') || !SHA_RE.test(headSha ?? '')) {
    throw new Error('baseSha and headSha must be 40-char lowercase hex');
  }
  const changed = (
    await git(['diff', '--name-only', '--diff-filter=AMR', baseSha, headSha])
  )
    .split('\n')
    .map(line => line.trim())
    .filter(Boolean);
  const reviewable = changed.filter(
    path => REVIEWABLE_RE.test(path) && !SKIP_RE.test(path)
  );
  const skipped = changed.filter(path => !reviewable.includes(path));

  const files = [];
  const importers = [];
  const truncated = [];
  let bytes = 0;

  for (const [index, path] of reviewable.entries()) {
    if (index >= limits.maxFiles) {
      truncated.push(path);
      continue;
    }
    const patch = await git([
      'diff',
      `--unified=${limits.diffContextLines}`,
      baseSha,
      headSha,
      '--',
      path,
    ]);
    const size = Buffer.byteLength(patch);
    if (bytes + size > limits.maxBytes) {
      truncated.push(path);
      continue;
    }
    bytes += size;
    files.push({ path, patch });
  }

  for (const { path } of files) {
    if (!IMPORTABLE_RE.test(path)) continue;
    const stem = moduleStem(path);
    if (stem.length < 3) continue;
    let hits = '';
    try {
      hits = await git([
        'grep',
        '-l',
        '-F',
        '-e',
        `/${stem}'`,
        '-e',
        `/${stem}"`,
        headSha,
        '--',
        '*.ts',
        '*.tsx',
        '*.mjs',
        '*.js',
      ]);
    } catch {
      // git grep exits 1 when nothing matches.
      continue;
    }
    const callers = hits
      .split('\n')
      .map(line => line.replace(`${headSha}:`, '').trim())
      .filter(caller => caller && caller !== path && !changed.includes(caller))
      .slice(0, limits.maxImportersPerFile);
    for (const caller of callers) {
      const source = await git(['show', `${headSha}:${caller}`]);
      const excerpt = source.slice(0, 4_000);
      const size = Buffer.byteLength(excerpt);
      if (bytes + size > limits.maxBytes) {
        truncated.push(`importers-of:${path}`);
        break;
      }
      bytes += size;
      importers.push({ path: caller, of: path, excerpt });
    }
  }

  return { baseSha, headSha, files, importers, skipped, truncated, bytes };
}

/** Plain-text rendering of the context for a specialist prompt. */
export function renderContext(context) {
  const parts = context.files.map(
    file => `### Diff: ${file.path}\n${file.patch}`
  );
  for (const importer of context.importers) {
    parts.push(
      `### Caller of ${importer.of}: ${importer.path} (first 4000 chars)\n${importer.excerpt}`
    );
  }
  return parts.join('\n\n');
}

/** Source excerpt around one finding location, for the verifier. */
export function excerptForFinding(context, finding, radius = 60) {
  const file = context.files.find(
    entry => entry.path === finding.location.path
  );
  if (!file) return '';
  const lines = file.patch.split('\n');
  const marker = lines.findIndex(line =>
    line.includes(finding.symbol ?? '\u0000')
  );
  const center = marker === -1 ? 0 : marker;
  return lines.slice(Math.max(0, center - radius), center + radius).join('\n');
}
