#!/usr/bin/env node
/**
 * Cheap fixer: first rung of the repair ladder (docs/evaluations/cheap-fixer.md). Triggered by
 * cheap-fixer.yml on a failed required workflow_run. Diagnoses with a cheap Gateway model, has
 * Jev judge the patch, and either records it (shadow) or pushes it as one normal commit (push).
 * Any doubt hands off to the lanes untouched. Never executes PR code; the only inputs are logs
 * and file text, treated as untrusted. All outbound calls go through packages/api-client.
 *
 * Env: GH_READ_TOKEN (read), GH_TOKEN (push mode), AI_GATEWAY_API_KEY, REPO, EVENT_PATH,
 *      MODE=shadow|push, PUSH_CLASSES=comma list, OUT_DIR, REPLAY=1 (historical run, judge-only).
 */
import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { createApiClient } from '../../packages/api-client/client.ts';
import { providerSpec } from '../../packages/api-client/contract.ts';
import { createGitHubClient } from '../../packages/api-client/github.ts';
import { curateLogTail } from '../invariants/jev-ci-failure-triage.mjs';
import { runPreparedJevEvaluation } from '../invariants/jev-gateway.mjs';
import {
  interpretPatchVerdict,
  preparePatchVerdictRequest,
} from '../invariants/jev-patch-verdict.mjs';
import {
  activeClaims,
  applyEdits,
  buildPrompt,
  CLAIM_HOST,
  CLASSES,
  claimBody,
  classifyDetail,
  costUsd,
  guardPatch,
  HOLD_LABELS,
  LIMITS,
  MODELS,
  parseModelReply,
  pathsInLog,
  SCHEMA,
  unifiedDiff,
} from './cheap-fixer-lib.mjs';

const REPO = process.env.REPO || 'JovieInc/Jovie';
const REPLAY = process.env.REPLAY === '1'; // historical red run: judge-only, never claims or pushes
const MODE = process.env.MODE === 'push' && !REPLAY ? 'push' : 'shadow';
const PUSH_CLASSES = new Set(
  (process.env.PUSH_CLASSES || '')
    .split(',')
    .map(s => s.trim())
    .filter(Boolean)
);
const OUT_DIR = process.env.OUT_DIR || 'cheap-fixer-out';
const GATEWAY = `https://${providerSpec('ai-gateway').hosts[0]}/v1/chat/completions`;
const t0 = Date.now();

/**
 * @typedef {{
 *   state: string,
 *   head: { sha: string, ref: string, repo?: { full_name?: string } | null },
 *   base: { ref: string },
 *   labels: Array<{ name: string }>,
 * }} GhPull
 * @typedef {{
 *   id: number,
 *   name: string,
 *   conclusion: string | null,
 *   steps?: Array<{ name?: string, conclusion?: string | null }>,
 * }} GhJob
 * @typedef {{ jobs: GhJob[] }} GhJobsPage
 * @typedef {{ id: number }} GhComment
 * @typedef {Array<{ filename: string, status: string }>} GhFiles
 * @typedef {{ size: number, encoding: string, content: string }} GhContent
 * @typedef {{
 *   usage?: { prompt_tokens?: number, completion_tokens?: number } | null,
 *   choices?: Array<{ message?: { content?: string | null } | null }>,
 * }} GatewayReply
 */

// Shared budget, breaker and retries: the client layer is the contract (.claude/rules/external-apis.md).
const reader = createGitHubClient({
  token: process.env.GH_READ_TOKEN ?? '',
  credential: 'cheap-fixer-read',
});
const writer = process.env.GH_TOKEN
  ? createGitHubClient({
      token: process.env.GH_TOKEN,
      credential: 'cheap-fixer-write',
    })
  : null;
const modelClient = createApiClient({
  provider: 'ai-gateway',
  credential: 'cheap-fixer-gateway',
  authorize: headers =>
    headers.set('authorization', `Bearer ${process.env.AI_GATEWAY_API_KEY}`),
});
// A bare object widens `priority` to `string`, which is not a PriorityName.
/** @type {{ readonly priority: 'repair' }} */
const call = { priority: 'repair' };
const get = async path =>
  (await reader.rest('GET', path, undefined, call)).json();
const stamp = () => new Date().toISOString();
const since = () => new Date(Date.now() - 3 * 3600e3).toISOString();

const receipt = {
  schema: SCHEMA,
  mode: MODE,
  replay: REPLAY,
  repo: REPO,
  startedAt: stamp(),
  stages: {},
  outcome: 'started',
  models: [],
  costUsd: 0,
};
const mark = name => {
  receipt.stages[name] = stamp();
};
function finish(outcome, extra = {}) {
  Object.assign(receipt, extra, {
    outcome,
    finishedAt: stamp(),
    durationMs: Date.now() - t0,
  });
  mkdirSync(OUT_DIR, { recursive: true });
  writeFileSync(`${OUT_DIR}/receipt.json`, JSON.stringify(receipt, null, 2));
  const line = `cheap-fixer ${outcome} pr=${receipt.pr ?? '-'} class=${receipt.failureClass ?? '-'} cost=$${receipt.costUsd.toFixed(5)}`;
  console.log(line);
  if (process.env.GITHUB_STEP_SUMMARY)
    writeFileSync(
      process.env.GITHUB_STEP_SUMMARY,
      `${line}\n\n\`\`\`diff\n${receipt.diff ?? ''}\n\`\`\`\n`,
      { flag: 'a' }
    );
  process.exit(0);
}

async function chat(model, prompt) {
  const res = await modelClient.request({
    url: GATEWAY,
    method: 'POST',
    priority: 'repair',
    timeoutMs: 60000,
    maxAttempts: 2,
    body: {
      model,
      temperature: 0,
      max_tokens: 4000,
      messages: [
        { role: 'system', content: prompt.system },
        { role: 'user', content: prompt.user },
      ],
    },
  });
  const body = /** @type {GatewayReply} */ (res.json());
  const cost = costUsd(model, body.usage);
  receipt.models.push({ model, usage: body.usage ?? null, costUsd: cost });
  receipt.costUsd += cost ?? 0;
  return body.choices?.[0]?.message?.content ?? '';
}

async function main() {
  const event = JSON.parse(readFileSync(process.env.EVENT_PATH, 'utf8'));
  const run = event.workflow_run;
  const sha = run.head_sha;
  const number = run.pull_requests?.[0]?.number;
  Object.assign(receipt, {
    sha,
    pr: number ?? null,
    runId: run.id,
    workflow: run.name,
    redAt: run.updated_at,
  });
  receipt.stages.red = run.updated_at;
  mark('start');
  if (!number) finish('skip-no-pr');

  const pr = /** @type {GhPull} */ (await get(`repos/${REPO}/pulls/${number}`));
  const labels = new Set(pr.labels.map(l => l.name.toLowerCase()));
  if (!REPLAY && pr.state !== 'open') finish('skip-closed');
  if (!REPLAY && pr.head.sha !== sha) finish('skip-stale-head');
  if (pr.head.repo?.full_name !== REPO) finish('skip-fork');
  if (pr.base.ref !== 'main') finish('skip-not-main-base');
  if (pr.head.ref === 'main') finish('skip-main');
  const held = [...labels].filter(l => HOLD_LABELS.has(l));
  if (!REPLAY && held.length) finish('skip-hold', { held });

  const commentsPath = `repos/${REPO}/issues/${number}/comments?per_page=100&since=${since()}`;
  const claims = activeClaims(await get(commentsPath), sha);
  const foreign = claims.filter(c => c.host !== CLAIM_HOST);
  if (!REPLAY && foreign.length)
    finish('skip-lane-claimed', { claimedBy: foreign.map(c => c.host) });
  if (MODE === 'push' && claims.length) finish('skip-already-attempted');

  // Failing job (aggregators like PR Ready only echo a child) and its log tail.
  const jobs = /** @type {GhJobsPage} */ (
    await get(
      `repos/${REPO}/actions/runs/${run.id}/jobs?per_page=100&filter=latest`
    )
  ).jobs.filter(j => j.conclusion === 'failure');
  if (!jobs.length) finish('skip-no-failed-job');
  const job =
    jobs.find(j => !/^(PR Ready|Merge Queue|.*\bgate\b)/i.test(j.name)) ??
    jobs[0];
  const step = job.steps?.find(s => s.conclusion === 'failure')?.name;
  const rawLog = (
    await reader.rest(
      'GET',
      `repos/${REPO}/actions/jobs/${job.id}/logs`,
      undefined,
      call
    )
  ).text;
  const logTail = curateLogTail(rawLog).slice(-LIMITS.logTailBytes);
  mark('logs');
  const { name: failureClass, match: classMatch } = classifyDetail(logTail);
  Object.assign(receipt, {
    failureClass,
    classMatch,
    job: job.name,
    step,
    failedJobs: jobs.map(j => j.name),
  });
  if (!CLASSES.includes(failureClass)) finish('handoff-unfixable-class');
  if (MODE === 'push' && !PUSH_CLASSES.has(failureClass))
    finish('handoff-class-not-enabled');

  // Only push mode fences the head: shadow must never stop the lanes from working.
  let claimId = null;
  if (MODE === 'push') {
    if (!writer) finish('error', { error: 'push mode without GH_TOKEN' });
    const posted = /** @type {GhComment} */ (
      (
        await writer.rest(
          'POST',
          `repos/${REPO}/issues/${number}/comments`,
          { body: claimBody(sha) },
          call
        )
      ).json()
    );
    claimId = posted.id;
    const after = activeClaims(await get(commentsPath), sha).sort((a, b) =>
      a.createdAt.localeCompare(b.createdAt)
    );
    if (after[0] && after[0].commentId !== claimId) {
      await writer.rest(
        'DELETE',
        `repos/${REPO}/issues/comments/${claimId}`,
        undefined,
        call
      );
      finish('skip-lost-claim-race');
    }
    mark('claimed');
  }
  const release = async () => {
    if (!claimId) return;
    try {
      await writer.rest(
        'DELETE',
        `repos/${REPO}/issues/comments/${claimId}`,
        undefined,
        call
      );
    } catch {
      /* the claim expires with its TTL; the lanes also treat a missing fix as unclaimed */
    }
  };
  const handoff = async (why, extra) => {
    await release();
    finish(`handoff-${why}`, extra);
  };

  // Files: only ones the PR changed (plus snapshots named in the log).
  const changed = /** @type {GhFiles} */ (
    await get(`repos/${REPO}/pulls/${number}/files?per_page=100`)
  );
  const changedInPr = new Set(
    changed.filter(f => f.status !== 'removed').map(f => f.filename)
  );
  const wanted = pathsInLog(rawLog, changedInPr);
  if (!wanted.length) await handoff('no-candidate-files');
  const contents = {};
  for (const p of wanted) {
    try {
      const f = /** @type {GhContent} */ (
        await get(`repos/${REPO}/contents/${encodeURI(p)}?ref=${sha}`)
      );
      if (f.size <= LIMITS.maxFileBytes && f.encoding === 'base64')
        contents[p] = Buffer.from(f.content, 'base64').toString('utf8');
    } catch {
      /* file absent at head: skip */
    }
  }
  if (!Object.keys(contents).length) await handoff('no-readable-files');

  // One bounded attempt: primary model, fallback model only when the reply is unparseable.
  const prompt = buildPrompt({
    failureClass,
    workflow: run.name,
    job: job.name,
    step,
    logTail,
    files: contents,
  });
  let reply = null;
  for (const model of [MODELS.primary, MODELS.fallback]) {
    try {
      reply = parseModelReply(await chat(model, prompt));
    } catch (e) {
      receipt.modelError = String(e.message).slice(0, 120);
    }
    if (reply) break;
  }
  mark('model');
  if (!reply) await handoff('model-unusable');
  if (reply.handoff || !reply.edits)
    await handoff('model-declined', {
      reason: String(reply.handoff ?? '').slice(0, 200),
    });
  const applied = applyEdits(reply.edits, contents);
  // checkJs does not narrow this union on `!applied.ok`; `=== false` does.
  if (applied.ok === false) {
    await handoff('edit-invalid', { reason: applied.reason });
    return;
  }
  const violations = guardPatch(applied.files, { changedInPr, failureClass });
  const diff = Object.entries(applied.files)
    .map(([p, f]) => unifiedDiff(p, f.before, f.after))
    .filter(Boolean)
    .join('\n');
  Object.assign(receipt, {
    diff,
    explanation: String(reply.explanation ?? '').slice(0, 300),
    files: Object.keys(applied.files),
  });
  if (violations.length) await handoff('guard-violation', { violations });
  mark('guards');

  // Jev judges. Admission is bounded and local to this attempt; Jev never dispatches anything.
  const request = preparePatchVerdictRequest({
    sourceSha: sha,
    artifactSha256: createHash('sha256').update(diff).digest('hex'),
    failureClass,
    workflow: run.name,
    job: job.name,
    log: logTail,
    diff,
  });
  const verdict = await runPreparedJevEvaluation(
    request,
    {
      apiKey: process.env.AI_GATEWAY_API_KEY,
      credentialRef: 'AI_GATEWAY_API_KEY',
      approval: {
        fingerprint: request.fingerprint,
        dataApproved: true,
        fundingApproved: true,
        expiresAt: Date.now() + 240000,
        authorityRef: `cheap-fixer:run-${process.env.GITHUB_RUN_ID ?? 'local'}`,
        availableUsd: 1,
        maxUsd: 0.01,
        estimatedUpperBoundUsd: 0.001,
      },
      readCurrentFingerprint: () => request.fingerprint,
    },
    interpretPatchVerdict
  );
  mark('jev');
  receipt.jev = { status: verdict.status, decision: verdict.decision ?? null };
  const decision = verdict.decision;
  if (verdict.status !== 'evaluated' || !decision?.approved)
    await handoff('jev-rejected', { jevStatus: verdict.status });

  if (MODE === 'shadow') finish('shadow-proposed');

  // Push: one verified, non-forced commit (createCommitOnBranch fails if the head moved).
  const fresh = /** @type {GhPull} */ (
    await get(`repos/${REPO}/pulls/${number}`)
  );
  if (
    fresh.head.sha !== sha ||
    fresh.labels.some(l => HOLD_LABELS.has(l.name.toLowerCase()))
  )
    await handoff('head-moved-or-held');
  const message = `fix(ci): ${failureClass} fix from cheap-fixer for #${number}`;
  const data = await writer.graphql(
    `mutation CheapFix($input: CreateCommitOnBranchInput!) {
      createCommitOnBranch(input: $input) { commit { oid } }
    }`,
    {
      input: {
        branch: { repositoryNameWithOwner: REPO, branchName: pr.head.ref },
        expectedHeadOid: sha,
        message: {
          headline: message,
          body: `${receipt.explanation}\n\nJev verdict: approve (${decision.confidence?.toFixed?.(2)}). Run ${process.env.GITHUB_RUN_ID ?? ''}.\n\nCo-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>`,
        },
        fileChanges: {
          additions: Object.entries(applied.files).map(([path, f]) => ({
            path,
            contents: Buffer.from(f.after).toString('base64'),
          })),
        },
      },
    },
    call
  );
  mark('pushed');
  // The claim is fenced to the old head; deleting it keeps the PR clean for the lanes if the new head goes red.
  await release();
  finish('pushed', { pushedSha: data.createCommitOnBranch.commit.oid });
}

main().catch(e => {
  receipt.error = String(e.message).slice(0, 300);
  finish('error');
});
