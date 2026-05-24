#!/usr/bin/env node
/**
 * PR Comment Hardening Retro
 *
 * Goal: Pull recent PR review feedback (humans + bots) and summarize repeated
 * actionable findings so we can harden docs/templates/tests.
 *
 * This script intentionally does NOT write to GitHub (read-only).
 */

import { execFileSync } from 'node:child_process';
import process from 'node:process';

function parseArgs(argv) {
  const args = {
    sinceDays: 7,
    limit: 100,
    dryRun: false,
  };

  for (let i = 2; i < argv.length; i++) {
    const token = argv[i];
    if (token === '--dry-run') {
      args.dryRun = true;
      continue;
    }
    if (token === '--since-days') {
      const value = argv[i + 1];
      i++;
      args.sinceDays = Number(value);
      continue;
    }
    if (token === '--limit') {
      const value = argv[i + 1];
      i++;
      args.limit = Number(value);
      continue;
    }
  }

  if (!Number.isFinite(args.sinceDays) || args.sinceDays <= 0) {
    throw new Error(`Invalid --since-days: ${args.sinceDays}`);
  }
  if (!Number.isFinite(args.limit) || args.limit <= 0 || args.limit > 500) {
    throw new Error(`Invalid --limit: ${args.limit} (must be 1..500)`);
  }

  return args;
}

function sh(cmd, cmdArgs, { timeoutMs = 20_000, allowFailure = false } = {}) {
  try {
    return execFileSync(cmd, cmdArgs, {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
      timeout: timeoutMs,
    }).trim();
  } catch (error) {
    if (allowFailure) {
      const stderr = error?.stderr ? String(error.stderr) : '';
      const stdout = error?.stdout ? String(error.stdout) : '';
      return [stdout.trim(), stderr.trim()].filter(Boolean).join('\n');
    }
    throw error;
  }
}

function getRepoSlugFromGitRemote() {
  const raw = sh('git', ['remote', 'get-url', 'origin'], {
    allowFailure: true,
  });
  if (!raw) return null;

  // Supports:
  // - git@github.com:owner/repo.git
  // - https://github.com/owner/repo.git
  // - https://github.com/owner/repo
  const sshMatch = raw.match(
    /github\.com:(?<owner>[^/]+)\/(?<repo>[^.\n]+)(?:\.git)?$/
  );
  if (sshMatch?.groups?.owner && sshMatch.groups.repo) {
    return `${sshMatch.groups.owner}/${sshMatch.groups.repo}`;
  }
  const httpsMatch = raw.match(
    /github\.com\/(?<owner>[^/]+)\/(?<repo>[^.\n/]+)(?:\.git)?$/
  );
  if (httpsMatch?.groups?.owner && httpsMatch.groups.repo) {
    return `${httpsMatch.groups.owner}/${httpsMatch.groups.repo}`;
  }

  return null;
}

function isoDateDaysAgo(days) {
  const now = new Date();
  const cutoff = new Date(now.getTime() - days * 24 * 60 * 60 * 1000);
  return cutoff.toISOString().slice(0, 10);
}

function normalizeText(text) {
  return String(text ?? '')
    .replace(/\r\n/g, '\n')
    .replace(/[ \t]+/g, ' ')
    .trim();
}

function classifyFinding(body) {
  const text = body.toLowerCase();
  const rules = [
    [
      'missing_tests',
      /\b(add|needs?)\b.*\b(test|tests|coverage)\b|\bno tests\b/,
    ],
    ['type_safety', /\b(types?|type safety|any\b|unknown\b|as any\b)\b/],
    ['dead_code', /\b(unused|dead code|remove this|redundant)\b/],
    [
      'error_handling',
      /\b(error handling|handle (errors?|failure)|try\/catch|fail (closed|open)|timeout|retry)\b/,
    ],
    [
      'security',
      /\b(security|xss|csrf|ssrf|injection|authz|authorization|permissions?|secrets?)\b/,
    ],
    ['performance', /\b(perf|performance|slow|n\+1|bundle|memo|cache)\b/],
    ['style_lint', /\b(format|lint|biome|eslint|prettier)\b/],
    ['naming_docs', /\b(docs?|readme|comment|naming|rename)\b/],
  ];

  for (const [label, re] of rules) {
    if (re.test(text)) return label;
  }
  return 'uncategorized';
}

function extractActionableLines(body) {
  const lines = normalizeText(body)
    .split('\n')
    .map(l => l.trim())
    .filter(Boolean);

  // Keep short, directive-y lines; avoid code blocks.
  const picked = [];
  let inCodeFence = false;
  for (const line of lines) {
    if (line.startsWith('```')) {
      inCodeFence = !inCodeFence;
      continue;
    }
    if (inCodeFence) continue;
    if (line.includes('"checkboxId"') || line.includes('"radioGroupId"'))
      continue;
    if (line.length < 8) continue;
    if (
      /^[-*•]\s+/.test(line) ||
      /^\d+\.\s+/.test(line) ||
      /^(nit|suggestion|minor):/i.test(line) ||
      /^(please|consider|should|avoid|remove|add|prefer|use|do not|don't)\b/i.test(
        line
      )
    ) {
      picked.push(line.replace(/^[-*•]\s+/, '').trim());
    }
    if (picked.length >= 10) break;
  }

  if (picked.length > 0) return picked;

  // Fallback: pick "actionable" sentences from paragraph-ish lines (common in bot reviews).
  const text = normalizeText(body)
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  const sentences = text
    .split(/(?<=[.!?])\s+/)
    .map(s => s.trim())
    .filter(Boolean);
  const sentencePicked = [];
  for (const sentence of sentences) {
    if (sentence.length < 25 || sentence.length > 240) continue;
    if (
      sentence.includes('"checkboxId"') ||
      sentence.includes('"radioGroupId"')
    )
      continue;
    if (/^\s*(summary|details)\s*[:：]/i.test(sentence)) continue;
    if (
      /\b(should|avoid|prefer|must|risk|security|timeout|retry|tests?|type|nullable|undefined)\b/i.test(
        sentence
      )
    ) {
      sentencePicked.push(sentence);
    }
    if (sentencePicked.length >= 8) break;
  }
  return sentencePicked;
}

function normalizeLineForCounting(line) {
  const raw = String(line);
  const normalized = raw
    .toLowerCase()
    .replace(/`([^`]+)`/g, (_m, inner) => {
      const text = String(inner);
      if (text.length <= 40) return `\`${text.toLowerCase()}\``;
      return '`…`';
    })
    .replace(/https?:\/\/\S+/g, 'URL')
    .replace(/\b\d+\b/g, 'N')
    .replace(/\s+/g, ' ')
    .trim();
  if (!normalized) return '';
  if (normalized === '`…`') return '';
  if (normalized.startsWith('[ ] <!--')) return '';
  if (normalized.includes('checkboxid') || normalized.includes('radiogroupid'))
    return '';
  return normalized;
}

function printReportHeader({ repo, sinceDays, limit, dryRun, cutoffDate }) {
  console.log('# PR Comment Hardening Retro (dry run)');
  console.log('');
  console.log(`- repo: ${repo ?? '(unknown)'}`);
  console.log(`- sinceDays: ${sinceDays}`);
  console.log(`- cutoffDate (UTC): ${cutoffDate}`);
  console.log(`- limit: ${limit}`);
  console.log(`- dryRun: ${dryRun}`);
  console.log('');
}

function printBlocked(reason, details) {
  console.log('## Blocked');
  console.log(`- reason: ${reason}`);
  if (details) {
    console.log('- details:');
    const text = normalizeText(details);
    for (const line of text.split('\n').slice(0, 20)) {
      console.log(`  - ${line}`);
    }
  }
  console.log('');
}

function tryGhAuthStatus() {
  return sh('gh', ['auth', 'status', '-h', 'github.com'], {
    allowFailure: true,
    timeoutMs: 10_000,
  });
}

function fetchRecentPullRequests({ repo, cutoffDate, limit }) {
  // Use GraphQL instead of REST search. Some orgs/tokens disable REST search endpoints.
  const [owner, name] = repo.split('/');
  if (!owner || !name) throw new Error(`Invalid repo slug: ${repo}`);

  const cutoffIso = new Date(`${cutoffDate}T00:00:00.000Z`).toISOString();

  const query = `
    query($owner: String!, $name: String!, $cursor: String) {
      repository(owner: $owner, name: $name) {
        pullRequests(first: 50, after: $cursor, orderBy: {field: UPDATED_AT, direction: DESC}) {
          nodes { number title url updatedAt }
          pageInfo { hasNextPage endCursor }
        }
      }
    }
  `;

  const results = [];
  let cursor = null;
  let keepGoing = true;

  while (keepGoing && results.length < limit) {
    const responseJson = sh(
      'gh',
      [
        'api',
        'graphql',
        '-f',
        `query=${query}`,
        '-f',
        `owner=${owner}`,
        '-f',
        `name=${name}`,
        '-f',
        `cursor=${cursor ?? ''}`,
      ],
      { timeoutMs: 30_000 }
    );

    const parsed = JSON.parse(responseJson);
    const prConn = parsed?.data?.repository?.pullRequests;
    const nodes = Array.isArray(prConn?.nodes) ? prConn.nodes : [];
    const pageInfo = prConn?.pageInfo ?? {};

    for (const pr of nodes) {
      const updatedAt = String(pr?.updatedAt ?? '');
      if (!updatedAt) continue;
      if (updatedAt < cutoffIso) {
        keepGoing = false;
        break;
      }
      results.push({
        number: pr.number,
        title: pr.title,
        url: pr.url,
        updatedAt,
      });
      if (results.length >= limit) break;
    }

    if (!keepGoing) break;
    if (!pageInfo?.hasNextPage) break;
    cursor = pageInfo.endCursor;
  }

  return results.filter(it => typeof it.number === 'number');
}

function fetchPrReviewsAndComments({ repo, prNumber }) {
  const reviewsJson = sh(
    'gh',
    ['api', `repos/${repo}/pulls/${prNumber}/reviews`],
    { timeoutMs: 30_000 }
  );
  const reviews = JSON.parse(reviewsJson);

  const reviewCommentsJson = sh(
    'gh',
    ['api', `repos/${repo}/pulls/${prNumber}/comments`],
    { timeoutMs: 30_000 }
  );
  const reviewComments = JSON.parse(reviewCommentsJson);

  const issueCommentsJson = sh(
    'gh',
    ['api', `repos/${repo}/issues/${prNumber}/comments`],
    { timeoutMs: 30_000 }
  );
  const issueComments = JSON.parse(issueCommentsJson);

  return { reviews, reviewComments, issueComments };
}

function isInterestingAuthor(login) {
  const author = String(login ?? '');
  if (!author) return false;
  if (author === 'coderabbitai[bot]') return true;
  if (author === 'greptile-apps[bot]') return true;
  if (author === 'sentry[bot]') return true;
  // Humans (non-bot accounts)
  if (!author.endsWith('[bot]')) return true;
  return false;
}

function summarizeFindings(findings) {
  const byCategory = new Map();
  const byAuthor = new Map();
  const actionableLineCounts = new Map();
  const keywordCountsByCategory = new Map();
  const examples = [];

  const stopwords = new Set([
    'about',
    'above',
    'after',
    'again',
    'also',
    'before',
    'being',
    'below',
    'could',
    'first',
    'github',
    'their',
    'there',
    'these',
    'those',
    'through',
    'using',
    'would',
    'should',
    'please',
    'consider',
    'comment',
    'review',
    'summary',
    'details',
    'passed',
    'generated',
    'configuration',
    'reference',
    'addressed',
    'severity',
    'expected',
    'suggestion',
    'minor',
  ]);

  for (const f of findings) {
    byCategory.set(f.category, (byCategory.get(f.category) ?? 0) + 1);
    byAuthor.set(f.author, (byAuthor.get(f.author) ?? 0) + 1);
    for (const line of extractActionableLines(f.body)) {
      const normalized = normalizeLineForCounting(line);
      if (!normalized) continue;
      actionableLineCounts.set(
        normalized,
        (actionableLineCounts.get(normalized) ?? 0) + 1
      );
    }

    // Very lightweight keyword extraction to surface repeated themes per category.
    if (!keywordCountsByCategory.has(f.category))
      keywordCountsByCategory.set(f.category, new Map());
    const bucket = keywordCountsByCategory.get(f.category);
    const tokens = normalizeText(f.body)
      .toLowerCase()
      .replace(/`[^`]+`/g, ' ')
      .replace(/https?:\/\/\S+/g, ' ')
      .replace(/[^a-z0-9_]+/g, ' ')
      .split(' ')
      .map(t => t.trim())
      .filter(Boolean)
      .filter(t => t.length >= 6)
      .filter(t => !stopwords.has(t))
      .slice(0, 250);
    for (const tok of tokens) {
      bucket.set(tok, (bucket.get(tok) ?? 0) + 1);
    }

    if (examples.length < 8) {
      const lines = extractActionableLines(f.body);
      examples.push({ ...f, lines });
    }
  }

  const sortedCategories = [...byCategory.entries()].sort(
    (a, b) => b[1] - a[1]
  );
  const sortedAuthors = [...byAuthor.entries()].sort((a, b) => b[1] - a[1]);

  const sortedActionableLines = [...actionableLineCounts.entries()]
    .filter(([, count]) => count >= 3)
    .sort((a, b) => b[1] - a[1]);

  const topKeywordsByCategory = [...keywordCountsByCategory.entries()].map(
    ([category, counts]) => {
      const top = [...counts.entries()]
        .sort((a, b) => b[1] - a[1])
        .slice(0, 10);
      return { category, top };
    }
  );

  return {
    sortedCategories,
    sortedAuthors,
    sortedActionableLines,
    topKeywordsByCategory,
    examples,
  };
}

async function main() {
  const { sinceDays, limit, dryRun } = parseArgs(process.argv);
  const cutoffDate = isoDateDaysAgo(sinceDays);
  const repo = getRepoSlugFromGitRemote();

  printReportHeader({ repo, sinceDays, limit, dryRun, cutoffDate });

  const authStatus = tryGhAuthStatus();
  if (
    authStatus.includes('Failed to log in') ||
    authStatus.includes('not logged') ||
    authStatus.includes('invalid')
  ) {
    printBlocked(
      'GitHub CLI is not authenticated (or token invalid), cannot fetch PR comments.',
      authStatus || 'Run `gh auth login -h github.com` and retry.'
    );
    console.log('## Next steps');
    console.log('- Re-authenticate GitHub CLI: `gh auth login -h github.com`');
    console.log(
      `- Re-run: node scripts/pr-comment-retro.mjs --since-days ${sinceDays} --limit ${limit} --dry-run`
    );
    console.log('');
    process.exitCode = 0;
    return;
  }

  if (!repo) {
    printBlocked(
      'Could not infer repo slug from `git remote get-url origin`.',
      sh('git', ['remote', '-v'], { allowFailure: true })
    );
    process.exitCode = 0;
    return;
  }

  let prs = [];
  try {
    prs = fetchRecentPullRequests({ repo, cutoffDate, limit });
  } catch (error) {
    printBlocked(
      'Failed to query GitHub search API via `gh api`.',
      error?.stderr ? String(error.stderr) : String(error)
    );
    process.exitCode = 0;
    return;
  }

  console.log('## PRs scanned');
  console.log(`- count: ${prs.length}`);
  console.log('');

  const findings = [];
  const prLimit = Math.min(prs.length, limit);

  for (let i = 0; i < prLimit; i++) {
    const pr = prs[i];
    let bundle;
    try {
      bundle = fetchPrReviewsAndComments({ repo, prNumber: pr.number });
    } catch (_error) {
      // Keep going; one failing PR shouldn't block the report.
      continue;
    }

    const addFinding = (authorLogin, body, source) => {
      if (!isInterestingAuthor(authorLogin)) return;
      const text = normalizeText(body);
      if (!text) return;
      findings.push({
        prNumber: pr.number,
        prUrl: pr.url,
        author: String(authorLogin ?? '(unknown)'),
        source,
        category: classifyFinding(text),
        body: text,
      });
    };

    for (const r of Array.isArray(bundle.reviews) ? bundle.reviews : []) {
      addFinding(r?.user?.login, r?.body, 'review');
    }
    for (const c of Array.isArray(bundle.reviewComments)
      ? bundle.reviewComments
      : []) {
      addFinding(c?.user?.login, c?.body, 'review_comment');
    }
    for (const c of Array.isArray(bundle.issueComments)
      ? bundle.issueComments
      : []) {
      addFinding(c?.user?.login, c?.body, 'issue_comment');
    }
  }

  console.log('## Findings');
  console.log(`- comments_analyzed: ${findings.length}`);
  console.log('');

  const {
    sortedCategories,
    sortedAuthors,
    sortedActionableLines,
    topKeywordsByCategory,
    examples,
  } = summarizeFindings(findings);

  console.log('### Top categories');
  if (sortedCategories.length === 0) {
    console.log('- (none)');
  } else {
    for (const [cat, count] of sortedCategories.slice(0, 12)) {
      console.log(`- ${cat}: ${count}`);
    }
  }
  console.log('');

  console.log('### Top authors');
  if (sortedAuthors.length === 0) {
    console.log('- (none)');
  } else {
    for (const [author, count] of sortedAuthors.slice(0, 12)) {
      console.log(`- ${author}: ${count}`);
    }
  }
  console.log('');

  console.log('### Sample actionable excerpts');
  if (examples.length === 0) {
    console.log('- (none)');
  } else {
    for (const ex of examples) {
      console.log(
        `- PR #${ex.prNumber} (${ex.source}) by ${ex.author} — ${ex.category}`
      );
      console.log(`  - ${ex.prUrl}`);
      if (ex.lines.length === 0) {
        console.log('  - (no short actionable lines extracted)');
      } else {
        for (const line of ex.lines.slice(0, 3)) console.log(`  - ${line}`);
      }
    }
  }

  console.log('');
  console.log('### Repeated actionable lines (normalized)');
  if (sortedActionableLines.length === 0) {
    console.log('- (none found with frequency >= 3)');
  } else {
    for (const [line, count] of sortedActionableLines.slice(0, 25)) {
      console.log(`- (${count}x) ${line}`);
    }
  }
  console.log('');
  console.log('### Top keywords by category');
  for (const entry of topKeywordsByCategory) {
    if (!entry.top || entry.top.length === 0) continue;
    console.log(
      `- ${entry.category}: ${entry.top.map(([w, c]) => `${w}(${c})`).join(', ')}`
    );
  }
  console.log('');
  console.log('## Recommendations (script output)');
  console.log(
    '- If top category is `missing_tests`: add focused tests + PR checklist reminders.'
  );
  console.log(
    '- If `error_handling` or `security`: prefer docs/skill template hardening; avoid broad refactors.'
  );
  console.log('');
}

main().catch(error => {
  console.error(String(error?.stack ?? error));
  process.exitCode = 1;
});
