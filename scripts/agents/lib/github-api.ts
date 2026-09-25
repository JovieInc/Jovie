/**
 * Minimal GitHub REST helpers for outcome labeling (JOV-6508).
 * Token: GH_TOKEN → GITHUB_TOKEN → HUD_GITHUB_TOKEN. Repo: GH_REPO /
 * HUD_GITHUB_OWNER+HUD_GITHUB_REPO, default jovieinc/jovie.
 */

const API = 'https://api.github.com';

export function githubRepo(): { owner: string; repo: string } {
  const full =
    process.env.GH_REPO ??
    (process.env.HUD_GITHUB_OWNER && process.env.HUD_GITHUB_REPO
      ? `${process.env.HUD_GITHUB_OWNER}/${process.env.HUD_GITHUB_REPO}`
      : null) ??
    'jovieinc/jovie';
  const [owner, repo] = full.split('/');
  return { owner, repo };
}

function headers(): Record<string, string> {
  const token =
    process.env.GITHUB_TOKEN ??
    process.env.HUD_GITHUB_TOKEN ??
    process.env.GH_TOKEN;
  return {
    Accept: 'application/vnd.github+json',
    'X-GitHub-Api-Version': '2022-11-28',
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };
}

async function gh<T>(path: string): Promise<T> {
  const res = await fetch(`${API}${path}`, {
    headers: headers(),
    signal: AbortSignal.timeout(30_000),
  });
  if (res.status === 404) return null as T;
  if (!res.ok) throw new Error(`github ${path} HTTP ${res.status}`);
  return res.json() as Promise<T>;
}

export interface GhPr {
  number: number;
  state: 'open' | 'closed';
  merged_at: string | null;
  html_url: string;
  title: string;
  body: string | null;
  head: { sha: string; ref: string };
  merge_commit_sha: string | null;
}

export function getPr(
  owner: string,
  repo: string,
  number: number
): Promise<GhPr | null> {
  return gh<GhPr | null>(`/repos/${owner}/${repo}/pulls/${number}`);
}

export interface GhCheckRun {
  name: string;
  status: string;
  conclusion: string | null;
  id: number;
}

/** Check runs for a commit (CI result join for the PR head sha). */
export async function getCheckRuns(
  owner: string,
  repo: string,
  sha: string
): Promise<GhCheckRun[]> {
  const r = await gh<{ check_runs?: GhCheckRun[] } | null>(
    `/repos/${owner}/${repo}/commits/${sha}/check-runs?per_page=100`
  );
  return r?.check_runs ?? [];
}

export interface GhPrFile {
  filename: string;
  additions: number;
  deletions: number;
}

/** Diff stats for a PR (paginated, capped at 300 files). */
export async function getPrFiles(
  owner: string,
  repo: string,
  number: number
): Promise<GhPrFile[]> {
  const files: GhPrFile[] = [];
  for (let page = 1; page <= 3; page++) {
    const batch = await gh<GhPrFile[] | null>(
      `/repos/${owner}/${repo}/pulls/${number}/files?per_page=100&page=${page}`
    );
    if (!batch?.length) break;
    files.push(...batch);
    if (batch.length < 100) break;
  }
  return files;
}

/**
 * Candidate reverts of a PR: search merged PRs created after `sinceIso`
 * whose title/body mentions reverting. We fetch recent merged PRs and let
 * the pure isRevertOfPr/revertTargetPrNumber logic decide (keeps the API
 * surface cheap — no code search quota).
 */
export async function listRecentlyMergedPrs(
  owner: string,
  repo: string,
  sinceIso: string,
  maxPages = 3
): Promise<
  {
    number: number;
    title: string;
    body: string | null;
    merged_at: string | null;
    html_url: string;
    head: { ref: string };
  }[]
> {
  const out: Awaited<ReturnType<typeof listRecentlyMergedPrs>> = [];
  for (let page = 1; page <= maxPages; page++) {
    const batch = await gh<
      | {
          number: number;
          title: string;
          body: string | null;
          merged_at: string | null;
          html_url: string;
          head: { ref: string };
        }[]
      | null
    >(
      `/repos/${owner}/${repo}/pulls?state=closed&sort=updated&direction=desc&per_page=100&page=${page}`
    );
    if (!batch?.length) break;
    for (const pr of batch) {
      // updated-desc is not merge-desc. An older merge must not stop the page.
      if (!pr.merged_at || pr.merged_at < sinceIso) continue;
      out.push(pr);
    }
    if (batch.length < 100) break;
  }
  return out;
}
