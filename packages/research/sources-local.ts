/** Tier 0: knowledge we already own. Free, and always tried first. */
import { execFile } from 'node:child_process';
import { existsSync } from 'node:fs';
import { readdir, readFile, stat } from 'node:fs/promises';
import { join } from 'node:path';
import { promisify } from 'node:util';

import type { GbrainClient, GbrainHit } from './gbrain.ts';
import { keywords } from './normalize.ts';
import type { Hit } from './types.ts';

const run = promisify(execFile);

export const REPO_DOC_PATHS = ['CLAUDE.md', 'canon', 'docs', '.claude/rules'];
/** Code is searched too: "how does X work" questions are answered by source. */
export const REPO_CODE_PATHS = [
  'scripts',
  'packages',
  'apps/web/lib',
  '.github/workflows',
];
const REPO_GLOBS = [
  '*.md',
  '*.ts',
  '*.mjs',
  '*.py',
  '*.yml',
  '!**/*.test.*',
  '!**/tests/**',
  '!**/node_modules/**',
];

const DECISION_TYPES = [
  'decision',
  'architecture-decision',
  'research-decision',
];

function hitsFromGbrain(rows: unknown, source: string): Hit[] {
  if (!Array.isArray(rows)) return [];
  return (rows as GbrainHit[]).map(row => ({
    source,
    title: row.title ?? row.slug,
    url: `gbrain:${row.slug}`,
    snippet: (row.chunk_text ?? '').replace(/\s+/g, ' ').slice(0, 400),
    publishedAt: row.effective_date,
  }));
}

export async function searchGbrain(
  gbrain: GbrainClient,
  query: string,
  limit = 6
): Promise<Hit[]> {
  // `search` (vector + keyword, no LLM expansion) answers in ~1-4s; `query`
  // adds expansion + rerank and regularly takes >20s on the shared daemon.
  const rows = await gbrain.call('search', {
    query: keywords(query) || query,
    limit,
    snippet_chars: 400,
  });
  return hitsFromGbrain(rows, 'gbrain');
}

/** Decisions that already cover this topic; surfaced so agents don't undo them. */
export async function priorDecisions(
  gbrain: GbrainClient,
  query: string
): Promise<{ slug: string; title: string }[]> {
  const rows = await gbrain.call<GbrainHit[]>('search', {
    query: keywords(query) || query,
    limit: 5,
    snippet_chars: 120,
    types: DECISION_TYPES,
  });
  return Array.isArray(rows)
    ? rows
        .filter(r => (r.score ?? 1) >= 0.5)
        .map(r => ({ slug: r.slug, title: r.title ?? r.slug }))
    : [];
}

/** Files under `paths` (relative to root) whose text matches `term`, case-insensitively. */
export type RepoGrep = (
  repoRoot: string,
  term: string,
  paths: readonly string[]
) => Promise<string[]>;

const CODE_EXT = /\.(?:md|ts|mjs|py|yml)$/;
const SKIP = /(?:\.test\.|(?:^|\/)(?:tests|node_modules|\.git)(?:\/|$))/;
const MAX_BYTES = 400 * 1024;

/** Pure-Node grep with ripgrep's globs; used when rg is not installed. */
export const nodeGrep: RepoGrep = async (repoRoot, term, paths) => {
  const needle = term.toLowerCase();
  const out: string[] = [];
  const visit = async (rel: string): Promise<void> => {
    if (SKIP.test(rel)) return;
    const info = await stat(join(repoRoot, rel)).catch(() => null);
    if (!info) return;
    if (info.isDirectory()) {
      const names = await readdir(join(repoRoot, rel)).catch(() => []);
      await Promise.all(names.map(name => visit(`${rel}/${name}`)));
      return;
    }
    if (!CODE_EXT.test(rel) || info.size > MAX_BYTES) return;
    const text = await readFile(join(repoRoot, rel), 'utf8').catch(() => '');
    if (text.toLowerCase().includes(needle)) out.push(rel);
  };
  await Promise.all(paths.map(visit));
  return out.sort();
};

let rgMissing = false;

/** ripgrep when available (fast on the real repo); nodeGrep when it is not. */
export const defaultGrep: RepoGrep = async (repoRoot, term, paths) => {
  if (!rgMissing) {
    try {
      const { stdout } = await run(
        'rg',
        [
          '-i',
          '-l',
          '--max-filesize',
          '400K',
          ...REPO_GLOBS.flatMap(g => ['-g', g]),
          escapeRegex(term),
          ...paths,
        ],
        { cwd: repoRoot, timeout: 10_000, maxBuffer: 8 * 1024 * 1024 }
      );
      return stdout.split('\n').filter(Boolean);
    } catch (error) {
      const err = error as NodeJS.ErrnoException & { code?: unknown };
      if (err.code !== 'ENOENT') return []; // exit 1 = no matches
      rgMissing = true;
    }
  }
  return nodeGrep(repoRoot, term, paths);
};

function escapeRegex(term: string): string {
  return term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** ripgrep over canon/docs/rules; files ranked by how many query terms they contain. */
export async function searchRepo(
  repoRoot: string,
  query: string,
  limit = 5,
  grep: RepoGrep = defaultGrep
): Promise<Hit[]> {
  const terms = keywords(query)
    .split(' ')
    .filter(t => t.length >= 3)
    .slice(0, 8);
  if (terms.length === 0) return [];
  // rg exits 2 when any search path is missing, which would hide real matches.
  const paths = [...REPO_DOC_PATHS, ...REPO_CODE_PATHS].filter(p =>
    existsSync(join(repoRoot, p))
  );
  if (paths.length === 0) return [];
  const perFile = new Map<string, number>();
  await Promise.all(
    terms.map(async term => {
      for (const file of await grep(repoRoot, term, paths)) {
        perFile.set(file, (perFile.get(file) ?? 0) + 1);
      }
    })
  );
  const need = Math.min(
    terms.length,
    Math.max(2, Math.ceil(terms.length * 0.6))
  );
  // A term in the file path (hyperagent_lane.py) is strong evidence of topicality.
  const rank = (file: string, n: number) =>
    n + 2 * terms.filter(t => file.toLowerCase().includes(t)).length;
  const ranked = [...perFile.entries()]
    .filter(([, n]) => n >= need)
    .map(([file, n]) => [file, rank(file, n)] as const)
    .sort((a, b) => b[1] - a[1] || a[0].length - b[0].length)
    .slice(0, limit);
  const pattern = new RegExp(terms.map(escapeRegex).join('|'), 'i');
  return Promise.all(
    ranked.map(async ([file]) => {
      const text = await readFile(join(repoRoot, file), 'utf8').catch(() => '');
      // The file's opening lines (title, docstring) say what it is for,
      // then up to three matching lines.
      const head = text.slice(0, 600).split('\n').slice(0, 6).join(' ');
      const stdout = text
        .split('\n')
        .filter(line => pattern.test(line))
        .slice(0, 3)
        .join('\n');
      return {
        source: 'repo',
        title: file,
        url: `repo:${file}`,
        snippet: `${head} … ${stdout}`.replace(/\s+/g, ' ').slice(0, 500),
      };
    })
  );
}
