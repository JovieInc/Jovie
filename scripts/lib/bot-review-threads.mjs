#!/usr/bin/env node
/**
 * Resolve bot review threads on a PR whose current head is green.
 *
 * Founder rule (2026-11-11): bot review comments (Sentry Seer, CodeRabbit and
 * similar) never hold a green PR; agents fix or answer them and resolve the
 * thread themselves. This is the backstop for the threads an agent left open.
 *
 * A thread is resolved here only when all of these hold:
 *   - the PR is open and its head is the exact head that went green;
 *   - the thread is unresolved and its first comment is by a known review bot
 *     (GraphQL author __typename Bot, login in REVIEW_BOTS);
 *   - every later comment is by a bot or carries an agent footer, so no
 *     human is waiting on an answer in it;
 *   - all of the thread's comments were read (no further page).
 * Human-started threads, and bot threads a human replied in, are never touched.
 *
 * api-budget: github-app-graphql 120/hr - one thread read per green PR Ready head (~60/hr at peak) plus one resolve per open bot thread
 *
 * CLI:
 *   node scripts/lib/bot-review-threads.mjs --repo OWNER/NAME --pr N --head SHA [--dry-run]
 */
import { pathToFileURL } from 'node:url';

export const REVIEW_BOTS = Object.freeze([
  'sentry',
  'coderabbitai',
  'cursor',
  'greptile-apps',
  'chatgpt-codex-connector',
  'copilot-pull-request-reviewer',
  'gemini-code-assist',
]);

// Replies agents post (they push as a user account) end with this footer.
const AGENT_FOOTER = /Generated (?:by|with) \[Claude Code\]/;
const SHA = /^[0-9a-f]{40}$/;

export const THREADS_QUERY =
  'query($owner:String!,$name:String!,$number:Int!){repository(owner:$owner,name:$name){' +
  'pullRequest(number:$number){state headRefOid reviewThreads(first:100){nodes{id isResolved ' +
  'comments(first:50){pageInfo{hasNextPage} nodes{body author{__typename login}}}}}}}}';
export const RESOLVE_MUTATION =
  'mutation($id:ID!){resolveReviewThread(input:{threadId:$id}){thread{id isResolved}}}';

const login = author =>
  String(author?.login ?? '')
    .toLowerCase()
    .replace(/\[bot\]$/, '');

export function isReviewBot(author) {
  return author?.__typename === 'Bot' && REVIEW_BOTS.includes(login(author));
}

const isBot = author =>
  author?.__typename === 'Bot' || /\[bot\]$/i.test(String(author?.login ?? ''));

/** Why a thread is left alone, or null when it may be resolved. */
export function threadSkipReason(thread) {
  if (!thread || typeof thread.id !== 'string' || !thread.id)
    return 'malformed';
  if (thread.isResolved !== false) return 'resolved';
  const comments = thread.comments?.nodes;
  if (!Array.isArray(comments) || comments.length === 0) return 'no-comments';
  if (thread.comments.pageInfo?.hasNextPage !== false) return 'incomplete';
  if (!isReviewBot(comments[0]?.author)) return 'not-bot';
  const human = comments
    .slice(1)
    .some(c => !isBot(c?.author) && !AGENT_FOOTER.test(String(c?.body ?? '')));
  return human ? 'human-reply' : null;
}

/** The thread ids to resolve on a live PR read for the green head. */
export function selectResolvableThreads(pullRequest, head) {
  if (!SHA.test(String(head ?? ''))) return { skip: 'bad-head', ids: [] };
  if (pullRequest?.state !== 'OPEN') return { skip: 'not-open', ids: [] };
  if (pullRequest.headRefOid !== head) return { skip: 'head-moved', ids: [] };
  const threads = pullRequest.reviewThreads?.nodes ?? [];
  return {
    skip: null,
    ids: threads.filter(t => threadSkipReason(t) === null).map(t => t.id),
  };
}

/** @typedef {(args: string[]) => Promise<{ code: number, stdout: string }>} Gh */

/** @type {Gh} */
async function defaultGh(args) {
  const { runGh } = await import('../../packages/api-client/gh.ts');
  return runGh(args, { priority: 'report' });
}

/**
 * @param {{ repo: string, pr: number, head: string, dryRun?: boolean,
 *   gh?: Gh, log?: (line: string) => void }} options
 */
export async function resolveBotThreads({
  repo,
  pr,
  head,
  dryRun = false,
  gh = defaultGh,
  log = console.log,
}) {
  const [owner, name] = String(repo ?? '').split('/');
  if (!owner || !name || !Number.isInteger(pr) || pr < 1)
    throw new Error('usage: --repo OWNER/NAME --pr N --head SHA');
  const read = await gh([
    'api',
    'graphql',
    '-f',
    `query=${THREADS_QUERY}`,
    '-f',
    `owner=${owner}`,
    '-f',
    `name=${name}`,
    '-F',
    `number=${pr}`,
  ]);
  if (read.code !== 0) {
    log(`bot-review-threads: #${pr} read failed (exit ${read.code})`);
    return { resolved: [], failed: [], skip: 'read-failed' };
  }
  const live = JSON.parse(read.stdout)?.data?.repository?.pullRequest;
  const { skip, ids } = selectResolvableThreads(live, head);
  if (skip) {
    log(`bot-review-threads: #${pr} skipped (${skip})`);
    return { resolved: [], failed: [], skip };
  }
  const resolved = [];
  const failed = [];
  for (const id of ids) {
    if (dryRun) {
      log(`bot-review-threads: #${pr} would resolve ${id}`);
      resolved.push(id);
      continue;
    }
    const result = await gh([
      'api',
      'graphql',
      '-f',
      `query=${RESOLVE_MUTATION}`,
      '-f',
      `id=${id}`,
    ]);
    (result.code === 0 ? resolved : failed).push(id);
  }
  log(
    `bot-review-threads: #${pr} resolved ${resolved.length} bot thread(s)` +
      (failed.length ? `, ${failed.length} failed` : '')
  );
  return { resolved, failed, skip: null };
}

function parseArgs(argv) {
  const args = { repo: '', pr: 0, head: '', dryRun: false };
  for (let i = 0; i < argv.length; i += 1) {
    const key = argv[i];
    if (key === '--dry-run') args.dryRun = true;
    else if (key === '--repo') args.repo = argv[++i];
    else if (key === '--pr') args.pr = Number(argv[++i]);
    else if (key === '--head') args.head = argv[++i];
  }
  return args;
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  // Best effort: a thread that would not resolve is a warning, never a red
  // controller run; the agent guidance still owns resolving it.
  const outcome = await resolveBotThreads(parseArgs(process.argv.slice(2)));
  if (outcome.failed.length)
    console.log(
      `::warning::bot-review-threads could not resolve ${outcome.failed.join(', ')}`
    );
}
