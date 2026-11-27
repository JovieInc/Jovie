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
 * Original P0/P1 bot findings are recovered into Linear independently of
 * replies, thread resolution, merge, and the current head. New issues get a
 * reply only while the original thread remains safe to resolve.
 * Filing is best effort: a failure is logged and the thread still resolves.
 *
 * api-budget: github-app-graphql 120/hr - one thread read per green PR Ready head (~60/hr at peak) plus bounded source revalidation, one resolve per open bot thread, and one reply per newly filed P0/P1 thread
 *
 * CLI:
 *   node scripts/lib/bot-review-threads.mjs --repo OWNER/NAME --pr N --head SHA [--dry-run]
 */
import { pathToFileURL } from 'node:url';
import {
  buildFindingIssue,
  escalationSeverity,
  fileFinding,
  findingReply,
} from './bot-review-findings.mjs';

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
  'query($owner:String!,$name:String!,$number:Int!,$after:String){repository(owner:$owner,name:$name){' +
  'pullRequest(number:$number){state headRefOid reviewThreads(first:100,after:$after){pageInfo{hasNextPage endCursor} nodes{id isResolved ' +
  'path line originalLine comments(first:50){pageInfo{hasNextPage} ' +
  'nodes{body url originalCommit{oid} commit{oid} author{__typename login}}}}}}}}';
export const RESOLVE_MUTATION =
  'mutation($id:ID!){resolveReviewThread(input:{threadId:$id}){thread{id isResolved}}}';
export const REPLY_MUTATION =
  'mutation($id:ID!,$body:String!){addPullRequestReviewThreadReply(' +
  'input:{pullRequestReviewThreadId:$id,body:$body}){comment{id}}}';

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

/** Read bounded original-thread pages; never claim a truncated read is complete.
 * @returns {Promise<{live?: any, threads: any[], incomplete: boolean, reason?: string, nextCursor?: string}>}
 */
export async function readBotReviewThreads({
  repo,
  pr,
  gh = defaultGh,
  maxPages = 3,
  after = null,
}) {
  const [owner, name] = String(repo ?? '').split('/');
  if (!owner || !name || !Number.isInteger(pr) || pr < 1)
    throw new Error('usage: --repo OWNER/NAME --pr N');
  const threads = [];
  let live;
  for (let page = 0; page < maxPages; page++) {
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
      ...(after ? ['-f', `after=${after}`] : []),
    ]);
    if (read.code !== 0)
      return { live, threads, incomplete: true, reason: 'read-failed' };
    const body = JSON.parse(read.stdout);
    const next = body?.data?.repository?.pullRequest;
    if (body.errors?.length || !next)
      return { live, threads, incomplete: true, reason: 'graphql-error' };
    if (
      live &&
      (live.headRefOid !== next.headRefOid || live.state !== next.state)
    )
      return { live, threads, incomplete: true, reason: 'head-moved' };
    live = next;
    const connection = next.reviewThreads;
    threads.push(...(connection?.nodes ?? []));
    if (connection?.pageInfo?.hasNextPage === false)
      return { live, threads, incomplete: false };
    const cursor = connection?.pageInfo?.endCursor;
    if (!cursor || cursor === after) break;
    after = cursor;
  }
  return {
    live,
    threads,
    incomplete: true,
    reason: 'thread-pagination-incomplete',
    nextCursor: after,
  };
}

/** Intake uses the original bot comment, regardless of thread/PR disposition. */
export async function recoverBotFindings({
  repo,
  pr,
  gh = defaultGh,
  dryRun = false,
  intake = {},
  log = console.log,
  source = undefined,
  commentUrl = null,
  maxPages = 3,
  after = null,
}) {
  const read =
    source ?? (await readBotReviewThreads({ repo, pr, gh, maxPages, after }));
  const filed = [];
  const warnings = [];
  const findings = [];
  if (read.incomplete)
    warnings.push(`#${pr}: ${read.reason}; recovery incomplete`);
  for (const thread of read.threads) {
    if (typeof thread?.id !== 'string' || !thread.id) continue;
    if (commentUrl && thread.comments?.nodes?.[0]?.url !== commentUrl) continue;
    if (!isReviewBot(thread.comments?.nodes?.[0]?.author)) continue;
    const severity = escalationSeverity(thread);
    if (!severity) continue;
    const issue = buildFindingIssue({
      repo,
      pr,
      head: read.live?.headRefOid,
      thread,
      severity,
    });
    const result = await fileFinding(issue, {
      ...intake,
      ...(dryRun ? { enabled: false } : {}),
      log,
      pr,
    });
    findings.push({ thread, severity, result });
    if (result.ok) filed.push(result.identifier);
    else if (!result.dryRun)
      warnings.push(`#${pr}: ${issue.fingerprint}: ${result.reason}`);
    if (result.reason === 'linear_rate_limited') {
      warnings.push(
        `Linear quota cooldown${result.resetAt ? ` until ${result.resetAt}` : ''}; recovery incomplete`
      );
      break;
    }
  }
  return { filed, warnings, findings, source: read };
}

const HEAD_QUERY =
  'query($owner:String!,$name:String!,$number:Int!,$id:ID!){repository(owner:$owner,name:$name){pullRequest(number:$number){state headRefOid}} node(id:$id){... on PullRequestReviewThread{id isResolved comments(first:50){pageInfo{hasNextPage} nodes{body author{__typename login}}}}}}';

/** Resolve only safe bot threads on the same live green head; intake is advisory. */
export async function resolveBotThreads({
  repo,
  pr,
  head,
  dryRun = false,
  gh = defaultGh,
  log = console.log,
  intake = {},
}) {
  const source = await readBotReviewThreads({ repo, pr, gh });
  if (!source.live)
    return {
      resolved: [],
      failed: [],
      filed: [],
      skip: source.reason ?? 'read-failed',
    };
  const recovery = await recoverBotFindings({
    repo,
    pr,
    gh,
    dryRun,
    intake,
    log,
    source,
  });
  for (const warning of recovery.warnings)
    log(`bot-review-threads: ${warning}`);
  const { skip, ids } = selectResolvableThreads(
    { ...source.live, reviewThreads: { nodes: source.threads } },
    head
  );
  const resolved = [],
    failed = [];
  const result = reason => ({
    resolved,
    failed,
    filed: recovery.filed,
    skip: reason,
  });
  if (skip) return result(skip);
  // Intake may await a slow or failed provider. Revalidate before either reply
  // or resolve: neither is allowed on an obsolete source head.
  const stillCurrent = async id => {
    const [owner, name] = repo.split('/');
    const read = await gh([
      'api',
      'graphql',
      '-f',
      `query=${HEAD_QUERY}`,
      '-f',
      `owner=${owner}`,
      '-f',
      `name=${name}`,
      '-F',
      `number=${pr}`,
      '-f',
      `id=${id}`,
    ]);
    if (read.code !== 0) return false;
    const body = JSON.parse(read.stdout);
    const live = body?.data?.repository?.pullRequest;
    return (
      !body.errors?.length &&
      live?.state === 'OPEN' &&
      live.headRefOid === head &&
      threadSkipReason(body?.data?.node) === null
    );
  };
  for (const id of ids) {
    if (dryRun) {
      resolved.push(id);
      continue;
    }
    if (!(await stillCurrent(id))) return result('source-changed');
    const finding = recovery.findings.find(row => row.thread.id === id);
    if (finding?.result.ok && finding.result.action === 'created') {
      const reply = await gh([
        'api',
        'graphql',
        '-f',
        `query=${REPLY_MUTATION}`,
        '-f',
        `id=${id}`,
        '-f',
        `body=${findingReply(finding.result, finding.severity)}`,
      ]);
      if (reply.code !== 0)
        log(`bot-review-threads: #${pr} issue reply failed on ${id}`);
      if (!(await stillCurrent(id))) return result('source-changed');
    }
    const mutation = await gh([
      'api',
      'graphql',
      '-f',
      `query=${RESOLVE_MUTATION}`,
      '-f',
      `id=${id}`,
    ]);
    (mutation.code === 0 ? resolved : failed).push(id);
  }
  return result(null);
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
