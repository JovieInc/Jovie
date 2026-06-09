#!/usr/bin/env node
/**
 * AI Code Review Script — triggered by GitHub Actions on PR events.
 * Uses kimi-k2.6:free via OpenRouter for $0 cost.
 * Incorporates best practices from Anthropic Code Review, Greptile, and PR-Agent.
 */

const fs = require('fs');
const https = require('https');

const MARKER = 'AI Code Review (kimi-k2.6:free)';

// ── Read inputs ──
const diff = fs.readFileSync('/tmp/pr-diff.txt', 'utf8');
const prNumber = process.env.PR_NUMBER;
const prTitle = process.env.PR_TITLE || '';
const prBody = process.env.PR_BODY || '';
const repoOwner = process.env.REPO_OWNER;
const repoName = process.env.REPO_NAME;
const openRouterKey = process.env.OPENROUTER_API_KEY;
const githubToken = process.env.GITHUB_TOKEN;

if (!openRouterKey) {
  console.error('OPENROUTER_API_KEY not set');
  process.exit(1);
}

// ── Build changed files list ──
const changedFiles = diff
  .split('\n')
  .filter(l => l.startsWith('diff --git'))
  .map(l => l.replace('diff --git a/', '').split(' ')[0])
  .join('\n');

// ── System prompt — Anthropic-style multi-agent focus ──
const systemPrompt = `You are a senior code reviewer for the Jovie codebase - a Next.js/React web app with Clerk auth, Drizzle/Postgres, Stripe billing, and Tailwind CSS.

Jovie codebase conventions:
- TypeScript everywhere, no \`any\` unless unavoidable
- Single DB driver: \`import { db } from '@/lib/db'\`
- Clerk proxy via fetch(), not middleware.ts
- No emoji in UI - use icons
- No native browser dialogs (alert/confirm/prompt)
- No decorative hover motion (translate/scale/lift)
- Migration files are immutable once committed
- Conventional commit messages required
- One Clerk instance per environment
- Performance must not replace route UIs (same design, faster)
- Marketing pages must be fully static
- Global UI singletons render once (root layout only)

Review focus (in priority order):
1. Logic bugs - race conditions, null dereferences, off-by-one, incorrect conditionals
2. Security - hardcoded secrets, SQL injection, XSS, auth bypass, CSP compliance
3. Convention violations - deviating from Jovie codebase rules above
4. Missing tests - untested code paths, missing edge cases
5. Design drift - violating DESIGN.md tokens or component hierarchy
6. Performance - N+1 queries, large bundles, blocking async paths

DO NOT comment on: style preferences that don't violate conventions, variable naming (unless misleading), minor formatting, things that are technically correct but could be better.

Output format:
## Review Summary
**Verdict**: Approve / Changes Requested / Comment

### Critical Issues (blockers)
- **path/to/file.ts:123** - What is wrong, why it matters, suggested fix.

### Warnings (should fix)
- Similar format for less critical issues.

### Suggestions (nice to have)
- Non-blocking improvement ideas.

### What Looks Good
- Highlights of what the PR does well.

Be specific. Reference line numbers. If no issues found, say so clearly.`;

const userPrompt = `## PR #${prNumber}: ${prTitle}

### Description
${prBody || '_No description_'}

### Files changed
${changedFiles}

### Diff
\`\`\`diff
${diff.substring(0, 32000)}
\`\`\``;

// ── Call OpenRouter ──
async function callOpenRouter() {
  return new Promise((resolve, reject) => {
    const payload = JSON.stringify({
      model: 'kimi-k2.6:free',
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ],
      temperature: 0.2,
      max_tokens: 4096,
    });

    const req = https.request(
      {
        hostname: 'openrouter.ai',
        path: '/api/v1/chat/completions',
        method: 'POST',
        headers: {
          Authorization: `Bearer ${openRouterKey}`,
          'Content-Type': 'application/json',
          'HTTP-Referer': 'https://github.com/JovieInc/Jovie',
          'X-Title': 'Jovie AI Code Review',
          'Content-Length': Buffer.byteLength(payload),
        },
        timeout: 120000,
      },
      res => {
        let body = '';
        res.on('data', chunk => (body += chunk));
        res.on('end', () => {
          try {
            const data = JSON.parse(body);
            if (data.choices && data.choices[0]) {
              resolve(data.choices[0].message.content);
            } else {
              reject(
                new Error('No response from model: ' + body.substring(0, 200))
              );
            }
          } catch (_e) {
            reject(new Error('JSON parse error: ' + body.substring(0, 200)));
          }
        });
      }
    );

    req.on('error', reject);
    req.on('timeout', () => {
      req.destroy();
      reject(new Error('Request timeout'));
    });
    req.write(payload);
    req.end();
  });
}

// ── GitHub API helpers ──
async function githubRequest(method, path, body) {
  return new Promise((resolve, reject) => {
    const payload = body ? JSON.stringify(body) : null;
    const req = https.request(
      {
        hostname: 'api.github.com',
        path: path,
        method: method,
        headers: {
          Authorization: `Bearer ${githubToken}`,
          'Content-Type': 'application/json',
          Accept: 'application/vnd.github+json',
          'User-Agent': 'Jovie-AI-Review',
          'Content-Length': payload ? Buffer.byteLength(payload) : 0,
        },
        timeout: 30000,
      },
      res => {
        let body = '';
        res.on('data', chunk => (body += chunk));
        res.on('end', () => {
          try {
            resolve({ status: res.statusCode, data: JSON.parse(body) });
          } catch (_e) {
            resolve({ status: res.statusCode, data: body });
          }
        });
      }
    );
    req.on('error', reject);
    if (payload) req.write(payload);
    req.end();
  });
}

async function findExistingReview(comments) {
  return comments.find(c => c.body && c.body.includes(MARKER));
}

async function postOrUpdateReview(review) {
  const { data: comments } = await githubRequest(
    'GET',
    `/repos/${repoOwner}/${repoName}/issues/${prNumber}/comments`
  );

  const existing = await findExistingReview(comments || []);
  const reviewBody = [
    `## ${MARKER}`,
    '',
    review,
    '',
    '---',
    '*This is an automated review. Please verify all suggestions before applying.*',
  ].join('\n');

  if (existing) {
    console.log(`Updating existing review comment #${existing.id}`);
    await githubRequest(
      'PATCH',
      `/repos/${repoOwner}/${repoName}/issues/comments/${existing.id}`,
      { body: reviewBody }
    );
  } else {
    console.log('Posting new review comment');
    await githubRequest(
      'POST',
      `/repos/${repoOwner}/${repoName}/issues/${prNumber}/comments`,
      { body: reviewBody }
    );
  }
}

// ── Main ──
async function main() {
  console.log(`AI Code Review: PR #${prNumber} — ${prTitle}`);
  console.log(`Diff size: ${diff.length} bytes, Model: kimi-k2.6:free`);

  console.log('Calling OpenRouter...');
  const review = await callOpenRouter();
  console.log(`Review received (${review.length} chars)`);

  await postOrUpdateReview(review);
  console.log('Review posted to PR');
}

main().catch(err => {
  console.error('Error:', err.message);
  process.exit(1);
});
