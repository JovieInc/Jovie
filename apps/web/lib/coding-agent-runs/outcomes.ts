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

const REVERT_TITLE_RE = /\brevert\b/i;

function extractPrNumberFromRef(text: string): number | null {
  const m = text.match(/#(\d+)/);
  return m ? Number(m[1]) : null;
}

/**
 * Detect whether a candidate PR is a revert of `targetPrNumber`.
 * Matches GitHub's conventions: title starting with/containing "Revert",
 * or body lines like "Reverts org/repo#123" / "This reverts commit <sha>"
 * (the caller passes commits separately for the sha case).
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
    /\breverts?\b/i.test(body) ||
    /^revert[-/]/i.test(head)
  );
}

/** Extract a referenced PR number from a revert PR's title/body, if present. */
export function revertTargetPrNumber(candidate: {
  title?: string | null;
  body?: string | null;
}): number | null {
  const haystack = `${candidate.title ?? ''}\n${candidate.body ?? ''}`;
  const direct = haystack.match(
    /reverts?\s+(?:pull\s+(?:request\s+)?)?[\w.-]+\/[\w.-]+#(\d+)/i
  );
  if (direct) return Number(direct[1]);
  const hashRef = haystack.match(/revert[^\n]*#(\d+)/i);
  if (hashRef) return Number(hashRef[1]);
  return extractPrNumberFromRef(haystack);
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
    .replace(/\\/g, '/')
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
  const m = url.match(/github\.com\/([\w.-]+)\/([\w.-]+)\/pull\/(\d+)/i);
  if (!m) return null;
  return { owner: m[1], repo: m[2], number: Number(m[3]) };
}

/** sha256 hex digest — used for prompt_digest (never store prompt text). */
export async function sha256Hex(text: string): Promise<string> {
  const { createHash } = await import('node:crypto');
  return createHash('sha256').update(text, 'utf8').digest('hex');
}
