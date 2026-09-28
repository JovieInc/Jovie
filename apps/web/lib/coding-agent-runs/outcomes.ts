/**
 * Outcome labeling logic for external coding-agent runs (JOV-6508).
 *
 * Pure functions only — no @/ imports, no I/O — so both the app query layer
 * and scripts/agents/* can share them, and unit tests need no fixtures beyond
 * plain objects.
 *
 * Label contract (7-day post-merge window):
 *   PR merged, window open, no signals        → 'open' (never early-label)
 *   PR merged, window closed, no signals      → 'landed'
 *   PR merged, revert detected within window  → 'reverted'
 *   PR merged, Sentry incident on diff files  → 'failed'
 *   PR closed unmerged                        → 'abandoned'
 *   No linked PR after completion             → 'open'
 */

export type CodingAgentOutcome =
  | 'open'
  | 'landed'
  | 'reverted'
  | 'failed'
  | 'abandoned';

export const OUTCOME_WINDOW_DAYS = 7;
const OUTCOME_WINDOW_MS = OUTCOME_WINDOW_DAYS * 24 * 60 * 60 * 1000;

export interface DiffStats {
  /** Repo-relative file paths touched by the PR diff. */
  files: string[];
  fileCount: number;
  additions: number;
  deletions: number;
}

export interface CiCheckResult {
  name: string;
  status: string;
  conclusion: string | null;
  runId?: number | null;
}

export interface OutcomeInput {
  /** Whether a PR is linked to this run. */
  hasPr: boolean;
  /** GitHub PR state when known: 'open' | 'closed'. */
  prState?: 'open' | 'closed' | null;
  /** Whether the linked PR merged. */
  prMerged: boolean;
  /** Merge time in epoch ms, when merged. */
  mergeTimestampMs?: number | null;
  /** Revert signal: a revert PR/commit referencing this PR within window. */
  revertDetected: boolean;
  /** Sentry issue ids whose stack frames touch the diff's files. */
  incidentIds: string[];
  /** Evaluation time in epoch ms. */
  nowMs: number;
}

/**
 * Decide the outcome label. Ordering matters: a revert outranks a Sentry
 * incident, and both outrank a clean landing. Rows younger than the window
 * stay 'open' — callers must not label prematurely.
 */
export function decideOutcome(input: OutcomeInput): CodingAgentOutcome {
  if (!input.hasPr) return 'open';
  if (input.prState === 'closed' && !input.prMerged) return 'abandoned';
  if (!input.prMerged || input.mergeTimestampMs == null) return 'open';

  const windowEnd = input.mergeTimestampMs + OUTCOME_WINDOW_MS;
  if (input.revertDetected) return 'reverted';
  if (input.incidentIds.length > 0) return 'failed';
  if (input.nowMs >= windowEnd) return 'landed';
  return 'open';
}

/** True when the 7-day post-merge window has fully closed. */
export function outcomeWindowClosed(
  mergeTimestampMs: number,
  nowMs: number
): boolean {
  return nowMs - mergeTimestampMs >= OUTCOME_WINDOW_MS;
}

const REVERT_TITLE_RE = /^revert\b/i;
const REVERT_LINE_RE = /^reverts\s+\S+\/\S+#\d+/i;
const GITHUB_REVERT_COMMIT_RE = /^this reverts commit\b/i;
const REVERT_PR_RE =
  /reverts?\s+(?:pull\s+(?:request\s+)?)?[\w.-]+\/[\w.-]+#(\d+)/i;
const REVERT_LINE_NUMBER_RE = /^revert\b[^#]*#(\d+)/i;
const GITHUB_PR_URL_RE = /github\.com\/([\w.-]+)\/([\w.-]+)\/pull\/(\d+)/i;

function lineIsRevertBody(line: string): boolean {
  const trimmed = line.trim();
  return REVERT_LINE_RE.test(trimmed) || GITHUB_REVERT_COMMIT_RE.test(trimmed);
}

/**
 * Detect a GitHub revert PR. A later PR that merely mentions the word
 * "revert" (for example "Fix revert-button bug") is not a revert.
 */
export function isRevertOfPr(candidate: {
  title?: string | null;
  body?: string | null;
  headRefName?: string | null;
}): boolean {
  const title = candidate.title ?? '';
  const body = candidate.body ?? '';
  const head = candidate.headRefName ?? '';
  return (
    REVERT_TITLE_RE.test(title) ||
    body.split('\n').some(lineIsRevertBody) ||
    /^revert[-/]/i.test(head)
  );
}

/** Extract a referenced PR number from a revert PR's title/body, if present. */
export function revertTargetPrNumber(candidate: {
  title?: string | null;
  body?: string | null;
}): number | null {
  const haystack = `${candidate.title ?? ''}\n${candidate.body ?? ''}`;
  const direct = REVERT_PR_RE.exec(haystack);
  if (direct?.[1]) return Number(direct[1]);
  for (const line of haystack.split('\n')) {
    const titled = REVERT_LINE_NUMBER_RE.exec(line.trim());
    if (titled?.[1]) return Number(titled[1]);
  }
  return null;
}

/** True when a Sentry issue was first seen at or after the PR merged. */
export function incidentStartedAfterMerge(
  firstSeen: string | null | undefined,
  mergeIso: string
): boolean {
  return Boolean(firstSeen) && (firstSeen as string) >= mergeIso;
}

/** Watermark stays at the oldest unfinished thread so the next run retries it. */
export function ingestionWatermark(
  nowIso: string,
  incompleteIsos: readonly (string | null | undefined)[]
): string {
  const floors = incompleteIsos.filter(
    (value): value is string => typeof value === 'string' && value.length > 0
  );
  floors.sort((left, right) => left.localeCompare(right));
  return floors[0] ?? nowIso;
}

/** Accept `--backfill-days 30` and `--backfill-days=30`. Env wins when set. */
export function readBackfillDays(
  argv: readonly string[],
  envValue?: string
): number {
  const fromEnv = Number(envValue);
  if (Number.isFinite(fromEnv) && fromEnv > 0) return fromEnv;
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i] ?? '';
    if (arg === '--backfill-days') {
      const next = Number(argv[i + 1]);
      if (Number.isFinite(next) && next > 0) return next;
    }
    if (arg.startsWith('--backfill-days=')) {
      const next = Number(arg.slice('--backfill-days='.length));
      if (Number.isFinite(next) && next > 0) return next;
    }
  }
  return 30;
}

/**
 * Normalize a file path for cross-surface comparison:
 * strips leading ./, trailing whitespace, and Windows separators.
 * Sentry abs_path values are absolute — callers should strip to the
 * repo-relative suffix via `repoRelativePath`.
 */
export function normalizeRepoPath(p: string): string {
  return p
    .trim()
    .replaceAll('\\', '/')
    .replace(/^\.\/+/, '')
    .replace(/^\/+/, '');
}

/**
 * Best-effort repo-relative reduction of an absolute/Sentry path.
 * Matches on the longest suffix that also appears in `diffFiles`; falls back
 * to the normalized path itself.
 */
export function repoRelativePath(
  absPath: string,
  diffFiles: readonly string[]
): string {
  const norm = normalizeRepoPath(absPath);
  if (diffFiles.includes(norm)) return norm;
  for (const f of diffFiles) {
    if (norm === f || norm.endsWith(`/${f}`)) return f;
  }
  return norm;
}

/**
 * Match Sentry stack filenames against a PR's diff file list.
 * Returns the subset of diff files touched — nonempty means the incident
 * plausibly landed in this PR's blast radius.
 */
export function matchIncidentFiles(
  stackFilenames: readonly string[],
  diffFiles: readonly string[]
): string[] {
  const hits = new Set<string>();
  for (const raw of stackFilenames) {
    const rel = repoRelativePath(raw, diffFiles);
    if (diffFiles.includes(rel)) hits.add(rel);
  }
  return [...hits];
}

/** Parse a GitHub PR URL into {owner, repo, number}; null on non-PR URLs. */
export function parseGithubPrUrl(
  url: string | null | undefined
): { owner: string; repo: string; number: number } | null {
  if (!url) return null;
  const matched = GITHUB_PR_URL_RE.exec(url);
  if (!matched?.[1] || !matched[2] || !matched[3]) return null;
  return { owner: matched[1], repo: matched[2], number: Number(matched[3]) };
}

/** sha256 hex digest — used for prompt_digest (never store prompt text). */
export async function sha256Hex(text: string): Promise<string> {
  const { createHash } = await import('node:crypto');
  return createHash('sha256').update(text, 'utf8').digest('hex');
}
