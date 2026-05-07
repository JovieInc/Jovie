import { execFileSync } from 'node:child_process';

export const DEFAULT_PR_LIMIT = 100;
export const DEFAULT_SINCE_DAYS = 7;

const SUMMARY_NOISE_RE =
  /auto-generated comment: summarize|Greptile Summary|CI Summary|Quality Gate (?:passed|failed)|All tests passed|Reviews paused|release notes by coderabbit/i;

const ADDRESSED_REPLY_RE =
  /^(?:`?@[\w-]+`?,?\s*)?(?:confirmed|thanks for|understood|happy to defer)\b|^(?:fixed|addressed|already addressed|acknowledged|declining|not applying|pr description was)\b|^\*?Resolved in\b|<review_comment_addressed>/i;

const BOT_ACTIONABLE_INLINE_RE =
  /Potential issue|\*\*Bug:\*\*|BUG_PREDICTION|P[0-3]|Risk\b|Missing\b|incorrect|falls back|silently|always ignores|can outlive|escapes?|unsupported|hardcoded|does not|fails?|wrong|unbounded|race|security|requested changes/i;

const HUMAN_ACTIONABLE_RE =
  /\b(fix|wrong|broken|missing|should|must|needs|regression|block|failing|failed|do not|don't|not ok)\b/i;

const NITPICK_RE = /(?:nitpick|trivial)/i;

export const CATEGORY_DEFINITIONS = [
  {
    id: 'workflow-scheduling',
    title: 'Workflow timeout, capacity, and cron collisions',
    patterns: [
      /timeout|MAX_WAIT|capacity|concurrent|runner|cron slot|schedule|timezone|concurrency|queue|burn|agent PR|open PR/i,
    ],
    hardening:
      'Add explicit timeout math, capacity filters, and stagger checks to workflow docs/tests before changing scheduled automation.',
  },
  {
    id: 'generated-docs-drift',
    title: 'Generated skill/docs drift',
    patterns: [
      /SKILL|generated|template|markdownlint|actionlint|JSDoc|stale (?:pattern|comment|doc)|parity test|docs? drift/i,
    ],
    hardening:
      'Update the source template or generator first, regenerate derived files, and add freshness/parity tests for claimed behavior.',
  },
  {
    id: 'path-scope',
    title: 'Path, sandbox, and scope gaps',
    patterns: [
      /cwd|path|directory traversal|traversal|escape|allowlist|protected|scope|fallback parsing|grep -oP|repo key|startsWith|file pattern|allowed-tools|Write tool|blocked-profile|no_agent/i,
    ],
    hardening:
      'Reject path traversal and unsupported keys explicitly; keep guard patterns aligned with actual repo paths.',
  },
  {
    id: 'silent-reporting',
    title: 'Silent or misleading reporting',
    patterns: [
      /silently|omit|report|summary|delta|score|total|mutation|executed|NoCoverage|artifact|green|informational|break: 0|notified|false positive|wrong-but-plausible/i,
    ],
    hardening:
      'Make reports balance, fail loudly on persistence-critical omissions, and avoid user-facing claims that are not backed by telemetry.',
  },
  {
    id: 'malformed-state',
    title: 'Null, empty, and malformed state handling',
    patterns: [
      /null|undefined|empty|malformed|missing|expectedSignal|EISDIR|no \.json|optional|href|checked=\{false\}|empty object/i,
    ],
    hardening:
      'Add malformed fixture coverage and explicit empty/null branches at the boundary where external or generated data enters.',
  },
  {
    id: 'auth-identity',
    title: 'Auth, identity, and subscription boundaries',
    patterns: [
      /auth|Clerk|OAuth|session|identity|entitlement|subscription|unsubscribe|OTP|cooldown|SMS|phone|consent/i,
    ],
    hardening:
      'Treat identity and subscription changes as high-risk: require focused tests, human review when ambiguous, and fail-closed behavior.',
  },
  {
    id: 'ui-accessibility-flow',
    title: 'UI accessibility and broken flow states',
    patterns: [
      /a11y|accessib|heading|screen reader|modal|drawer|button|toggle|profile tab|does nothing|support|link|surface|aria/i,
    ],
    hardening:
      'Add behavior-level UI assertions for visible controls, accessible names, and close/open flows rather than only render smoke tests.',
  },
  {
    id: 'db-migration-query',
    title: 'Database, migration, and query edge cases',
    patterns: [
      /drizzle|migration|database|db\.|query|transaction|schema|row|SQL|cache|update|unique index|ON CONFLICT/i,
    ],
    hardening:
      'Exercise database edge cases with focused tests and verify Drizzle conflict/update behavior against actual migration constraints.',
  },
];

export function normalizePr(pr = {}) {
  return {
    number: pr.number,
    title: pr.title ?? '',
    head:
      typeof pr.head === 'string'
        ? pr.head
        : (pr.head?.ref ?? pr.headRefName ?? ''),
    author:
      typeof pr.author === 'string'
        ? pr.author
        : (pr.user?.login ?? pr.author?.login ?? 'unknown'),
    labels: normalizeLabels(pr.labels),
    url: pr.url ?? pr.html_url ?? '',
    createdAt: pr.created_at ?? pr.createdAt ?? '',
    updatedAt: pr.updated_at ?? pr.updatedAt ?? '',
    mergedAt: pr.merged_at ?? pr.mergedAt ?? null,
    closedAt: pr.closed_at ?? pr.closedAt ?? null,
  };
}

export function normalizeLabels(labels = []) {
  if (!Array.isArray(labels)) return [];
  return labels
    .map(label => (typeof label === 'string' ? label : (label?.name ?? '')))
    .filter(Boolean);
}

export function getCommentAuthor(comment = {}) {
  return (
    comment.user?.login ?? comment.author?.login ?? comment.author ?? 'unknown'
  );
}

export function stripMarkup(body = '') {
  return body
    .replace(/<details>[\s\S]*?<\/details>/gi, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function isBotLogin(login = '') {
  return (
    login.endsWith('[bot]') ||
    login.startsWith('app/') ||
    /coderabbitai|greptile-apps|sentry|sonarqubecloud|github-actions/i.test(
      login
    )
  );
}

export function isExplicitAgentPr(pr = {}) {
  const normalized = normalizePr(pr);
  return (
    /^(codex|linear|claude|codegen-bot)\//.test(normalized.head) ||
    /(^|\/)jov-[0-9]+/i.test(normalized.head) ||
    normalized.labels.includes('agent-remediation-requested') ||
    /jovie-bot|codex|claude/i.test(normalized.author)
  );
}

export function isSummaryNoise(comment = {}) {
  return SUMMARY_NOISE_RE.test(comment.body ?? '');
}

export function isAddressedReply(comment = {}) {
  const body = stripMarkup(comment.body ?? '');
  if (ADDRESSED_REPLY_RE.test(body)) return true;
  if (BOT_ACTIONABLE_INLINE_RE.test(body) && !body.startsWith('@'))
    return false;
  return false;
}

export function isOutdatedInlineComment(comment = {}) {
  return comment.position === null;
}

export function isActionableInlineComment(comment = {}) {
  if (isOutdatedInlineComment(comment)) return false;
  if (comment.in_reply_to_id != null) return false;
  if (isSummaryNoise(comment) || isAddressedReply(comment)) return false;
  if (NITPICK_RE.test(comment.body ?? '')) return false;

  const author = getCommentAuthor(comment);
  const body = comment.body ?? '';
  const stripped = stripMarkup(body);

  if (isBotLogin(author)) return BOT_ACTIONABLE_INLINE_RE.test(body);
  return HUMAN_ACTIONABLE_RE.test(stripped);
}

export function classifyComment(comment = {}) {
  const haystack = `${comment.path ?? ''}\n${stripMarkup(comment.body ?? '')}`;
  const match = CATEGORY_DEFINITIONS.find(category =>
    category.patterns.some(pattern => pattern.test(haystack))
  );
  return match?.id ?? 'other';
}

export function flattenComments(data = {}) {
  const rows = [];
  for (const item of data.pulls ?? []) {
    const pr = normalizePr(item.pr ?? item);

    for (const comment of item.issueComments ?? []) {
      rows.push({ kind: 'issue', pr, comment });
    }
    for (const comment of item.reviewComments ?? []) {
      rows.push({ kind: 'inline', pr, comment });
    }
    for (const review of item.reviews ?? []) {
      rows.push({ kind: 'review', pr, comment: review });
    }
  }
  return rows;
}

export function analyzePrCommentData(data = {}) {
  const rows = flattenComments(data);
  const actionable = [];
  const rawCounts = { issue: 0, inline: 0, review: 0 };

  for (const row of rows) {
    rawCounts[row.kind] += 1;
    if (row.kind !== 'inline') continue;
    if (!isActionableInlineComment(row.comment)) continue;

    const category = classifyComment(row.comment);
    actionable.push({
      pr: row.pr,
      category,
      author: getCommentAuthor(row.comment),
      path: row.comment.path ?? '',
      line: row.comment.line ?? row.comment.original_line ?? null,
      body: row.comment.body ?? '',
      snippet: stripMarkup(row.comment.body ?? '').slice(0, 260),
      url: row.comment.html_url ?? row.comment.url ?? '',
    });
  }

  const categories = summarizeCategories(actionable);
  const offenderPrs = summarizeOffenderPrs(actionable);
  const agentOffenderPrs = offenderPrs.filter(item =>
    isExplicitAgentPr(item.pr)
  );

  return {
    repo: data.repo ?? '',
    since: data.since ?? '',
    fetchedAt: data.fetched_at ?? data.fetchedAt ?? new Date().toISOString(),
    pullCount: data.pull_count ?? data.pulls?.length ?? 0,
    rawCounts,
    actionableInlineCount: actionable.length,
    categories,
    offenderPrs,
    agentOffenderPrs,
    actionable,
  };
}

export function summarizeCategories(actionable = []) {
  const byId = new Map(
    CATEGORY_DEFINITIONS.map(category => [
      category.id,
      { ...category, count: 0, examples: [] },
    ])
  );
  byId.set('other', {
    id: 'other',
    title: 'Other actionable review findings',
    hardening:
      'Review manually and convert repeated patterns into a rule or test.',
    count: 0,
    examples: [],
  });

  for (const finding of actionable) {
    const summary = byId.get(finding.category) ?? byId.get('other');
    summary.count += 1;
    if (summary.examples.length < 5) {
      summary.examples.push(toFindingExample(finding));
    }
  }

  return [...byId.values()]
    .filter(category => category.count > 0)
    .sort((a, b) => b.count - a.count);
}

export function summarizeOffenderPrs(actionable = []) {
  const byPr = new Map();

  for (const finding of actionable) {
    const key = String(finding.pr.number);
    if (!byPr.has(key)) {
      byPr.set(key, {
        pr: finding.pr,
        count: 0,
        categories: {},
        authors: {},
        examples: [],
      });
    }

    const row = byPr.get(key);
    row.count += 1;
    row.categories[finding.category] =
      (row.categories[finding.category] ?? 0) + 1;
    row.authors[finding.author] = (row.authors[finding.author] ?? 0) + 1;
    if (row.examples.length < 5) {
      row.examples.push(toFindingExample(finding));
    }
  }

  return [...byPr.values()].sort((a, b) => b.count - a.count);
}

export function toFindingExample(finding) {
  return {
    pr: finding.pr.number,
    title: finding.pr.title,
    author: finding.author,
    path: finding.path,
    line: finding.line,
    snippet: finding.snippet,
    url: finding.url,
  };
}

export function renderMarkdownReport(analysis) {
  const lines = [
    '# PR Comment Hardening Retro',
    '',
    `Repository: ${analysis.repo || 'unknown'}`,
    `Window start: ${analysis.since || 'unknown'}`,
    `Fetched: ${analysis.fetchedAt}`,
    '',
    '## Summary',
    '',
    `- Pull requests scanned: ${analysis.pullCount}`,
    `- Discussion comments: ${analysis.rawCounts.issue}`,
    `- Inline review comments: ${analysis.rawCounts.inline}`,
    `- Review submissions: ${analysis.rawCounts.review}`,
    `- Actionable inline findings: ${analysis.actionableInlineCount}`,
    '',
    '## Recurring Mistakes',
    '',
  ];

  for (const category of analysis.categories) {
    lines.push(
      `- ${category.title}: ${category.count} finding(s). ${category.hardening}`
    );
  }

  lines.push('', '## Worst Offender PRs', '');
  lines.push('| PR | Branch | Findings | Top Categories |');
  lines.push('| --- | --- | ---: | --- |');
  for (const offender of analysis.offenderPrs.slice(0, 10)) {
    lines.push(formatOffenderRow(offender));
  }

  lines.push('', '## Worst Explicit Agent PRs', '');
  if (analysis.agentOffenderPrs.length === 0) {
    lines.push('- No explicit agent PRs had actionable inline findings.');
  } else {
    lines.push('| PR | Branch | Findings | Top Categories |');
    lines.push('| --- | --- | ---: | --- |');
    for (const offender of analysis.agentOffenderPrs.slice(0, 10)) {
      lines.push(formatOffenderRow(offender));
    }
  }

  lines.push('', '## Durable Hardening Queue', '');
  for (const category of analysis.categories.slice(0, 6)) {
    lines.push(`- ${category.title}: ${category.hardening}`);
  }

  lines.push(
    '',
    'Automation policy: open draft PRs only for bounded docs, tests, and skill hardening. Never auto-merge, and escalate high-risk product, auth, billing, migration, or cron-schedule changes for human review.'
  );

  return `${lines.join('\n')}\n`;
}

function formatOffenderRow(offender) {
  const prLink = offender.pr.url
    ? `[#${offender.pr.number}](${offender.pr.url})`
    : `#${offender.pr.number}`;
  const topCategories = Object.entries(offender.categories)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .map(([category, count]) => `${category} (${count})`)
    .join(', ');
  return `| ${prLink} ${escapeTable(offender.pr.title)} | ${escapeTable(
    offender.pr.head
  )} | ${offender.count} | ${escapeTable(topCategories)} |`;
}

function escapeTable(value = '') {
  return String(value).replaceAll('|', '\\|');
}

export function detectGithubRepo() {
  return execFileSync(
    'gh',
    ['repo', 'view', '--json', 'nameWithOwner', '--jq', '.nameWithOwner'],
    { encoding: 'utf8' }
  ).trim();
}

export function fetchRecentPrCommentData({
  repo = detectGithubRepo(),
  sinceDays = DEFAULT_SINCE_DAYS,
  limit = DEFAULT_PR_LIMIT,
} = {}) {
  const since = new Date(Date.now() - sinceDays * 24 * 60 * 60 * 1000);
  const pulls = runGhJsonArray(
    `/repos/${repo}/pulls?state=all&sort=updated&direction=desc&per_page=${limit}`
  )
    .filter(pr => new Date(pr.updated_at) >= since)
    .slice(0, limit)
    .map(pr => ({
      number: pr.number,
      title: pr.title,
      state: pr.state,
      created_at: pr.created_at,
      updated_at: pr.updated_at,
      merged_at: pr.merged_at,
      closed_at: pr.closed_at,
      author: pr.user?.login,
      head: pr.head?.ref,
      labels: normalizeLabels(pr.labels),
      url: pr.html_url,
    }));

  return {
    repo,
    since: since.toISOString(),
    fetched_at: new Date().toISOString(),
    pull_count: pulls.length,
    pulls: pulls.map(pr => ({
      pr,
      issueComments: runGhJsonLines(
        `/repos/${repo}/issues/${pr.number}/comments?per_page=100`
      ),
      reviewComments: runGhJsonLines(
        `/repos/${repo}/pulls/${pr.number}/comments?per_page=100`
      ),
      reviews: runGhJsonLines(
        `/repos/${repo}/pulls/${pr.number}/reviews?per_page=100`
      ),
    })),
  };
}

function runGhJsonArray(path) {
  const output = execFileSync('gh', ['api', path], {
    encoding: 'utf8',
    maxBuffer: 50 * 1024 * 1024,
  });
  return JSON.parse(output);
}

function runGhJsonLines(path) {
  const output = execFileSync(
    'gh',
    ['api', '--paginate', path, '--jq', '.[] | @json'],
    {
      encoding: 'utf8',
      maxBuffer: 50 * 1024 * 1024,
    }
  ).trim();

  if (!output) return [];
  return output.split('\n').map(line => JSON.parse(line));
}
