const LINEAR_GRAPHQL_URL = 'https://api.linear.app/graphql';
const GITHUB_GRAPHQL_URL = 'https://api.github.com/graphql';

const WINDOW_DAYS = 7;
const HUMAN_AUTHOR_LOGINS = new Set(['itstimwhite', 'timwhite']);

export type MetricAvailability =
  | 'available'
  | 'not_configured'
  | 'not_instrumented'
  | 'error';

export interface FactoryHealthMetric {
  readonly id: string;
  readonly label: string;
  readonly value: string;
  readonly subtitle: string;
  readonly availability: MetricAvailability;
  /** Seven daily values, oldest day first — for sparkline rendering. */
  readonly trend7d: readonly number[];
}

export interface FactoryHealthSnapshot {
  readonly metrics: readonly FactoryHealthMetric[];
  readonly computedAt: string;
}

export interface FactoryHealthEnv {
  readonly linearApiKey?: string;
  readonly githubToken?: string;
  readonly githubOwner?: string;
  readonly githubRepo?: string;
}

interface MergedPullRequest {
  readonly number: number;
  readonly mergedAt: string;
  readonly headRefName: string;
  readonly issueIdentifier: string | null;
}

interface LinearIssueTiming {
  readonly identifier: string;
  readonly createdAt: string;
}

function isBotLogin(login: string): boolean {
  return (
    login.endsWith('[bot]') ||
    login.startsWith('app/') ||
    /coderabbitai|greptile-apps|sentry|sonarqubecloud|github-actions|dependabot/i.test(
      login
    )
  );
}

function isHumanCommitAuthor(login: string | null | undefined): boolean {
  if (!login) return false;
  if (isBotLogin(login)) return false;
  return HUMAN_AUTHOR_LOGINS.has(login.toLowerCase());
}

function isAgentBranch(branch: string): boolean {
  return (
    /^(codex|claude|codegen-bot|linear)\//.test(branch) ||
    /(^|\/)jov-[0-9]+/i.test(branch)
  );
}

function extractIssueIdentifier(branch: string): string | null {
  const match = branch.match(/jov-([0-9]+)/i);
  if (!match) return null;
  return `JOV-${match[1]}`;
}

function median(values: readonly number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 0) {
    return (sorted[mid - 1]! + sorted[mid]!) / 2;
  }
  return sorted[mid]!;
}

function dayKeys(windowDays: number, now = new Date()): string[] {
  const keys: string[] = [];
  for (let offset = windowDays - 1; offset >= 0; offset -= 1) {
    const day = new Date(now);
    day.setUTCDate(day.getUTCDate() - offset);
    keys.push(day.toISOString().slice(0, 10));
  }
  return keys;
}

function formatDurationHours(hours: number): string {
  if (!Number.isFinite(hours) || hours < 0) return '—';
  if (hours < 48) return `${hours.toFixed(1)}h`;
  return `${(hours / 24).toFixed(1)}d`;
}

function formatPercent(ratio: number | null): string {
  if (ratio === null || !Number.isFinite(ratio)) return '—';
  return `${(ratio * 100).toFixed(0)}%`;
}

function notInstrumentedMetric(
  id: string,
  label: string,
  reason: string
): FactoryHealthMetric {
  return {
    id,
    label,
    value: '—',
    subtitle: reason,
    availability: 'not_instrumented',
    trend7d: Array.from({ length: WINDOW_DAYS }, () => 0),
  };
}

function unavailableMetric(
  id: string,
  label: string,
  reason: string,
  availability: MetricAvailability
): FactoryHealthMetric {
  return {
    id,
    label,
    value: '—',
    subtitle: reason,
    availability,
    trend7d: Array.from({ length: WINDOW_DAYS }, () => 0),
  };
}

async function fetchMergedPullRequests(input: {
  readonly token: string;
  readonly owner: string;
  readonly repo: string;
  readonly sinceIso: string;
}): Promise<MergedPullRequest[]> {
  const merged: MergedPullRequest[] = [];
  let cursor: string | null = null;

  while (merged.length < 200) {
    const afterClause = cursor ? `, after: "${cursor}"` : '';
    const query = `query {
      repository(owner: "${input.owner}", name: "${input.repo}") {
        pullRequests(
          states: MERGED
          first: 50
          orderBy: { field: UPDATED_AT, direction: DESC }
          ${afterClause}
        ) {
          nodes {
            number
            mergedAt
            headRefName
          }
          pageInfo { hasNextPage endCursor }
        }
      }
    }`;

    const response = await fetch(GITHUB_GRAPHQL_URL, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${input.token}`,
        'Content-Type': 'application/json',
        'User-Agent': 'Jovie-Console/1.0',
      },
      body: JSON.stringify({ query }),
      signal: AbortSignal.timeout(15_000),
    });

    if (!response.ok) {
      throw new Error(`GitHub GraphQL responded ${response.status}`);
    }

    const payload = (await response.json()) as {
      data?: {
        repository?: {
          pullRequests?: {
            nodes: Array<{
              number: number;
              mergedAt: string | null;
              headRefName: string;
            }>;
            pageInfo: { hasNextPage: boolean; endCursor: string | null };
          };
        };
      };
      errors?: Array<{ message: string }>;
    };

    if (payload.errors?.length) {
      throw new Error(payload.errors[0]?.message ?? 'GitHub GraphQL error');
    }

    const nodes = payload.data?.repository?.pullRequests?.nodes ?? [];
    let reachedWindow = false;

    for (const node of nodes) {
      if (!node.mergedAt) continue;
      if (node.mergedAt < input.sinceIso) {
        reachedWindow = true;
        break;
      }

      merged.push({
        number: node.number,
        mergedAt: node.mergedAt,
        headRefName: node.headRefName,
        issueIdentifier: extractIssueIdentifier(node.headRefName),
      });
    }

    const pageInfo = payload.data?.repository?.pullRequests?.pageInfo;
    if (reachedWindow || !pageInfo?.hasNextPage || !pageInfo.endCursor) {
      break;
    }
    cursor = pageInfo.endCursor;
  }

  return merged;
}

async function fetchLinearIssueTimings(
  apiKey: string,
  identifiers: readonly string[]
): Promise<Map<string, LinearIssueTiming>> {
  if (identifiers.length === 0) return new Map();

  const unique = [...new Set(identifiers)];
  const filterList = unique.map(id => `"${id}"`).join(', ');
  const query = `
    query FactoryHealthLinearTimings {
      issues(filter: { identifier: { in: [${filterList}] } }, first: 100) {
        nodes { identifier createdAt }
      }
    }
  `;

  const response = await fetch(LINEAR_GRAPHQL_URL, {
    method: 'POST',
    headers: {
      Authorization: apiKey,
      'Content-Type': 'application/json',
      'User-Agent': 'Jovie-Console/1.0',
    },
    body: JSON.stringify({ query }),
    signal: AbortSignal.timeout(10_000),
  });

  if (!response.ok) {
    throw new Error(`Linear API responded ${response.status}`);
  }

  const payload = (await response.json()) as {
    data?: { issues?: { nodes: LinearIssueTiming[] } };
    errors?: Array<{ message: string }>;
  };

  if (payload.errors?.length) {
    throw new Error(payload.errors[0]?.message ?? 'Linear GraphQL error');
  }

  const map = new Map<string, LinearIssueTiming>();
  for (const node of payload.data?.issues?.nodes ?? []) {
    map.set(node.identifier.toUpperCase(), node);
  }
  return map;
}

async function pullHasHumanCommits(input: {
  readonly token: string;
  readonly owner: string;
  readonly repo: string;
  readonly number: number;
}): Promise<boolean> {
  const response = await fetch(
    `https://api.github.com/repos/${encodeURIComponent(input.owner)}/${encodeURIComponent(input.repo)}/pulls/${input.number}/commits?per_page=100`,
    {
      headers: {
        Accept: 'application/vnd.github+json',
        Authorization: `Bearer ${input.token}`,
        'X-GitHub-Api-Version': '2022-11-28',
        'User-Agent': 'Jovie-Console/1.0',
      },
      signal: AbortSignal.timeout(10_000),
    }
  );

  if (!response.ok) {
    throw new Error(`GitHub commits API responded ${response.status}`);
  }

  const commits = (await response.json()) as Array<{
    author?: { login?: string | null } | null;
    commit?: { author?: { name?: string | null } | null };
  }>;

  return commits.some(commit => {
    const login = commit.author?.login ?? null;
    return isHumanCommitAuthor(login);
  });
}

function buildCycleTimeMetric(input: {
  readonly mergedPrs: readonly MergedPullRequest[];
  readonly linearTimings: ReadonlyMap<string, LinearIssueTiming>;
  readonly days: readonly string[];
}): FactoryHealthMetric {
  const cycleHoursByDay = new Map<string, number[]>();
  for (const day of input.days) {
    cycleHoursByDay.set(day, []);
  }

  const allCycleHours: number[] = [];

  for (const pr of input.mergedPrs) {
    if (!pr.issueIdentifier) continue;
    const timing = input.linearTimings.get(pr.issueIdentifier.toUpperCase());
    if (!timing) continue;

    const createdMs = Date.parse(timing.createdAt);
    const mergedMs = Date.parse(pr.mergedAt);
    if (!Number.isFinite(createdMs) || !Number.isFinite(mergedMs)) continue;
    if (mergedMs < createdMs) continue;

    const hours = (mergedMs - createdMs) / (1000 * 60 * 60);
    allCycleHours.push(hours);
    const day = pr.mergedAt.slice(0, 10);
    cycleHoursByDay.get(day)?.push(hours);
  }

  if (allCycleHours.length === 0) {
    return unavailableMetric(
      'cycle-time',
      'Cycle time',
      'No matched Linear issues for merged PRs in the last 7 days',
      'available'
    );
  }

  const trend7d = input.days.map(
    day => median(cycleHoursByDay.get(day) ?? []) ?? 0
  );
  const medianHours = median(allCycleHours);

  return {
    id: 'cycle-time',
    label: 'Cycle time',
    value: medianHours === null ? '—' : formatDurationHours(medianHours),
    subtitle: 'Median signal to production (7d)',
    availability: 'available',
    trend7d,
  };
}

async function buildAutonomyMetric(input: {
  readonly token: string;
  readonly owner: string;
  readonly repo: string;
  readonly mergedPrs: readonly MergedPullRequest[];
  readonly days: readonly string[];
}): Promise<FactoryHealthMetric> {
  const agentPrs = input.mergedPrs.filter(pr => isAgentBranch(pr.headRefName));
  if (agentPrs.length === 0) {
    return unavailableMetric(
      'autonomy-ratio',
      'Autonomy ratio',
      'No merged agent PRs in the last 7 days',
      'available'
    );
  }

  const autonomousByDay = new Map<
    string,
    { total: number; autonomous: number }
  >();
  for (const day of input.days) {
    autonomousByDay.set(day, { total: 0, autonomous: 0 });
  }

  let autonomousCount = 0;

  for (const pr of agentPrs) {
    const day = pr.mergedAt.slice(0, 10);
    const bucket = autonomousByDay.get(day);
    if (bucket) bucket.total += 1;

    const hasHuman = await pullHasHumanCommits({
      token: input.token,
      owner: input.owner,
      repo: input.repo,
      number: pr.number,
    });

    if (!hasHuman) {
      autonomousCount += 1;
      if (bucket) bucket.autonomous += 1;
    }
  }

  const trend7d = input.days.map(day => {
    const bucket = autonomousByDay.get(day);
    if (!bucket || bucket.total === 0) return 0;
    return bucket.autonomous / bucket.total;
  });

  return {
    id: 'autonomy-ratio',
    label: 'Autonomy ratio',
    value: formatPercent(autonomousCount / agentPrs.length),
    subtitle: 'Merged agent PRs with zero human commits (7d)',
    availability: 'available',
    trend7d,
  };
}

export async function fetchFactoryHealthMetrics(
  env: FactoryHealthEnv
): Promise<FactoryHealthSnapshot> {
  const computedAt = new Date().toISOString();
  const days = dayKeys(WINDOW_DAYS);
  const since = new Date();
  since.setUTCDate(since.getUTCDate() - WINDOW_DAYS);
  const sinceIso = since.toISOString();

  const token = env.githubToken?.trim();
  const owner = env.githubOwner?.trim() || 'JovieInc';
  const repo = env.githubRepo?.trim() || 'Jovie';
  const linearApiKey = env.linearApiKey?.trim();

  const staticMetrics: FactoryHealthMetric[] = [
    notInstrumentedMetric(
      'incident-mttr',
      'Incident MTTR',
      'Not instrumented — observability pipeline (#10936)'
    ),
    notInstrumentedMetric(
      'code-shelf-life',
      'Code shelf life',
      'Not instrumented — git churn telemetry pending'
    ),
    notInstrumentedMetric(
      'cost-per-pr',
      'Cost / merged PR',
      'Not instrumented — model + CI spend ledger pending'
    ),
  ];

  if (!token) {
    return {
      computedAt,
      metrics: [
        unavailableMetric(
          'cycle-time',
          'Cycle time',
          'Set HUD_GITHUB_TOKEN or GITHUB_TOKEN',
          'not_configured'
        ),
        unavailableMetric(
          'autonomy-ratio',
          'Autonomy ratio',
          'Set HUD_GITHUB_TOKEN or GITHUB_TOKEN',
          'not_configured'
        ),
        ...staticMetrics,
      ],
    };
  }

  try {
    const mergedPrs = await fetchMergedPullRequests({
      token,
      owner,
      repo,
      sinceIso,
    });

    const identifiers = mergedPrs
      .map(pr => pr.issueIdentifier)
      .filter((id): id is string => id !== null);

    const linearTimings =
      linearApiKey && identifiers.length > 0
        ? await fetchLinearIssueTimings(linearApiKey, identifiers)
        : new Map<string, LinearIssueTiming>();

    const cycleMetric =
      linearApiKey && identifiers.length > 0
        ? buildCycleTimeMetric({ mergedPrs, linearTimings, days })
        : unavailableMetric(
            'cycle-time',
            'Cycle time',
            linearApiKey
              ? 'No JOV-linked merged PRs in the last 7 days'
              : 'Set LINEAR_API_KEY for cycle-time grounding',
            linearApiKey ? 'available' : 'not_configured'
          );

    const autonomyMetric = await buildAutonomyMetric({
      token,
      owner,
      repo,
      mergedPrs,
      days,
    });

    return {
      computedAt,
      metrics: [cycleMetric, autonomyMetric, ...staticMetrics],
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    return {
      computedAt,
      metrics: [
        unavailableMetric('cycle-time', 'Cycle time', message, 'error'),
        unavailableMetric('autonomy-ratio', 'Autonomy ratio', message, 'error'),
        ...staticMetrics,
      ],
    };
  }
}

export function renderSparklineSvg(
  points: readonly number[],
  options?: { readonly width?: number; readonly height?: number }
): string {
  const width = options?.width ?? 72;
  const height = options?.height ?? 24;

  if (points.length < 2) {
    return `<svg viewBox="0 0 ${width} ${height}" width="${width}" height="${height}" aria-hidden="true"><line x1="0" y1="${height / 2}" x2="${width}" y2="${height / 2}" stroke="#52535a" stroke-width="1" /></svg>`;
  }

  const max = Math.max(...points, 1);
  const min = Math.min(...points, 0);
  const range = max - min || 1;
  const xFor = (index: number) =>
    points.length <= 1 ? width / 2 : (index / (points.length - 1)) * width;
  const yFor = (value: number) =>
    height - ((value - min) / range) * (height - 4) - 2;

  const path = points
    .map(
      (value, index) =>
        `${index === 0 ? 'M' : 'L'} ${xFor(index).toFixed(1)} ${yFor(value).toFixed(1)}`
    )
    .join(' ');

  return `<svg viewBox="0 0 ${width} ${height}" width="${width}" height="${height}" aria-hidden="true"><path d="${path}" fill="none" stroke="#4d7dff" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" /></svg>`;
}

function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
}

export function renderFactoryHealthStrip(
  snapshot: FactoryHealthSnapshot
): string {
  const cards = snapshot.metrics
    .map(metric => {
      const valueColor =
        metric.availability === 'available'
          ? 'var(--text-primary)'
          : 'var(--text-muted)';
      const sparkline = renderSparklineSvg(metric.trend7d);

      return `<div style="flex:1 1 120px;min-width:120px;background:var(--bg-card);border:1px solid var(--border);border-radius:var(--radius-md);padding:10px 12px;display:flex;flex-direction:column;gap:6px;">
  <div style="display:flex;align-items:flex-start;justify-content:space-between;gap:8px;">
    <span style="font-size:10px;font-weight:600;letter-spacing:0.06em;text-transform:uppercase;color:var(--text-muted);">${escapeHtml(metric.label)}</span>
    ${sparkline}
  </div>
  <p style="font-size:18px;font-weight:600;font-variant-numeric:tabular-nums;color:${valueColor};line-height:1.1;">${escapeHtml(metric.value)}</p>
  <p style="font-size:10px;color:var(--text-secondary);line-height:1.4;">${escapeHtml(metric.subtitle)}</p>
</div>`;
    })
    .join('');

  return `<section data-testid="factory-health-strip" style="margin-bottom:24px;">
  <div style="display:flex;align-items:baseline;justify-content:space-between;gap:12px;margin-bottom:10px;">
    <h2 style="font-size:11px;font-weight:600;text-transform:uppercase;letter-spacing:0.08em;color:var(--text-muted);">Factory health</h2>
    <span style="font-size:10px;color:var(--text-muted);">7d trend · ${new Date(snapshot.computedAt).toLocaleString()}</span>
  </div>
  <div style="display:flex;flex-wrap:wrap;gap:8px;">${cards}</div>
</section>`;
}
