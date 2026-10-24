#!/usr/bin/env node
/**
 * Cheap fixer: first rung of the repair ladder. Triggered by cheap-fixer.yml on a failed required
 * workflow_run. Diagnoses with a cheap Gateway model, has Jev judge the patch, and either records
 * it (shadow) or pushes it as one normal commit (push). Any doubt hands off to the lanes untouched.
 * Never executes PR code; the only inputs are logs and file text, treated as untrusted.
 *
 * Env: GH_TOKEN (read), GH_PUSH_TOKEN (push mode), AI_GATEWAY_API_KEY, REPO, EVENT_PATH,
 *      MODE=shadow|push, PUSH_CLASSES=comma list, OUT_DIR.
 */
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
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
const MODE =
  process.env.MODE === 'push' && process.env.REPLAY !== '1' ? 'push' : 'shadow';
const PUSH_CLASSES = new Set(
  (process.env.PUSH_CLASSES || '')
    .split(',')
    .map(s => s.trim())
    .filter(Boolean)
);
const REPLAY = process.env.REPLAY === '1'; // historical red run: judge-only, never claims or pushes
const OUT_DIR = process.env.OUT_DIR || 'cheap-fixer-out';
const GATEWAY = 'https://ai-gateway.vercel.sh/v1/chat/completions';
const t0 = Date.now();

function gh(args, { token = process.env.GH_TOKEN, input } = {}) {
  const r = spawnSync('gh', args, {
    encoding: 'utf8',
    input,
    env: { ...process.env, GH_TOKEN: token },
    maxBuffer: 64 << 20,
  });
  if (r.status !== 0)
    throw new Error(
      `gh ${args.slice(0, 3).join(' ')} failed: ${(r.stderr || '').slice(0, 300)}`
    );
  return r.stdout;
}
const api = (path, opts) => JSON.parse(gh(['api', path], opts) || 'null');
const stamp = () => new Date().toISOString();

const receipt = {
  schema: SCHEMA,
  mode: MODE,
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
  const res = await fetch(GATEWAY, {
    method: 'POST',
    headers: {
      authorization: `Bearer ${process.env.AI_GATEWAY_API_KEY}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      model,
      temperature: 0,
      max_tokens: 4000,
      messages: [
        { role: 'system', content: prompt.system },
        { role: 'user', content: prompt.user },
      ],
    }),
    signal: AbortSignal.timeout(60000),
  });
  if (!res.ok) throw new Error(`gateway ${res.status}`);
  const body = await res.json();
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

  const pr = api(`repos/${REPO}/pulls/${number}`);
  const labels = new Set(pr.labels.map(l => l.name.toLowerCase()));
  if (!REPLAY && pr.state !== 'open') finish('skip-closed');
  if (!REPLAY && pr.head.sha !== sha) finish('skip-stale-head');
  if (pr.head.repo?.full_name !== REPO) finish('skip-fork');
  if (pr.base.ref !== 'main') finish('skip-not-main-base');
  if (pr.head.ref === 'main') finish('skip-main');
  const held = [...labels].filter(l => HOLD_LABELS.has(l));
  if (!REPLAY && held.length) finish('skip-hold', { held });

  const comments = api(
    `repos/${REPO}/issues/${number}/comments?per_page=100&since=${new Date(Date.now() - 3 * 3600e3).toISOString()}`
  );
  const claims = activeClaims(comments, sha);
  const foreign = claims.filter(c => c.host !== CLAIM_HOST);
  if (foreign.length)
    finish('skip-lane-claimed', { claimedBy: foreign.map(c => c.host) });
  if (MODE === 'push' && claims.length) finish('skip-already-attempted');

  // Failing job + log tail.
  const jobs = api(
    `repos/${REPO}/actions/runs/${run.id}/jobs?per_page=100&filter=latest`
  ).jobs.filter(j => j.conclusion === 'failure');
  if (!jobs.length) finish('skip-no-failed-job');
  // Aggregator jobs (PR Ready, gates) only echo a child's failure; diagnose the child.
  const job =
    jobs.find(j => !/^(PR Ready|Merge Queue|.*\bgate\b)/i.test(j.name)) ??
    jobs[0];
  const step = job.steps?.find(s => s.conclusion === 'failure')?.name;
  const rawLog = gh(['api', `repos/${REPO}/actions/jobs/${job.id}/logs`]);
  const { curateLogTail } = await import(
    '../invariants/jev-ci-failure-triage.mjs'
  );
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
    const posted = JSON.parse(
      gh(
        [
          'api',
          `repos/${REPO}/issues/${number}/comments`,
          '-f',
          `body=${claimBody(sha)}`,
        ],
        { token: process.env.GH_PUSH_TOKEN }
      )
    );
    claimId = posted.id;
    const after = activeClaims(
      api(
        `repos/${REPO}/issues/${number}/comments?per_page=100&since=${new Date(Date.now() - 3 * 3600e3).toISOString()}`
      ),
      sha
    );
    const first = after.sort((a, b) =>
      a.createdAt.localeCompare(b.createdAt)
    )[0];
    if (first && first.commentId !== claimId) {
      gh(['api', '-X', 'DELETE', `repos/${REPO}/issues/comments/${claimId}`], {
        token: process.env.GH_PUSH_TOKEN,
      });
      finish('skip-lost-claim-race');
    }
    mark('claimed');
  }
  const release = () => {
    if (claimId)
      try {
        gh(
          ['api', '-X', 'DELETE', `repos/${REPO}/issues/comments/${claimId}`],
          { token: process.env.GH_PUSH_TOKEN }
        );
      } catch {}
  };
  const handoff = (why, extra) => {
    release();
    finish(`handoff-${why}`, extra);
  };

  // Files: only ones the PR changed (plus snapshots named in the log).
  const changed = api(`repos/${REPO}/pulls/${number}/files?per_page=100`);
  const changedInPr = new Set(
    changed.filter(f => f.status !== 'removed').map(f => f.filename)
  );
  const wanted = pathsInLog(rawLog, changedInPr);
  if (!wanted.length) handoff('no-candidate-files');
  const contents = {};
  for (const p of wanted) {
    try {
      const f = api(`repos/${REPO}/contents/${encodeURI(p)}?ref=${sha}`);
      if (f.size <= LIMITS.maxFileBytes && f.encoding === 'base64')
        contents[p] = Buffer.from(f.content, 'base64').toString('utf8');
    } catch {
      /* file absent at head: skip */
    }
  }
  if (!Object.keys(contents).length) handoff('no-readable-files');

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
  if (!reply) handoff('model-unusable');
  if (reply.handoff || !reply.edits)
    handoff('model-declined', {
      reason: String(reply.handoff ?? '').slice(0, 200),
    });
  const applied = applyEdits(reply.edits, contents);
  if (!applied.ok) handoff('edit-invalid', { reason: applied.reason });
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
  if (violations.length) handoff('guard-violation', { violations });
  mark('guards');

  // Jev judges. Admission is bounded and local to this attempt; Jev never dispatches anything.
  const { preparePatchVerdictRequest, interpretPatchVerdict } = await import(
    '../invariants/jev-patch-verdict.mjs'
  );
  const { runPreparedJevEvaluation } = await import(
    '../invariants/jev-gateway.mjs'
  );
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
  receipt.jev = {
    status: verdict.status,
    decision: verdict.decision ?? verdict.detail?.decision ?? null,
  };
  const decision = verdict.decision;
  if (verdict.status !== 'evaluated' || !decision?.approved)
    handoff('jev-rejected', { jevStatus: verdict.status });

  if (MODE === 'shadow') finish('shadow-proposed');

  // Push as one normal, non-forced commit via the git data API (app-signed, verified).
  const tok = process.env.GH_PUSH_TOKEN;
  const fresh = api(`repos/${REPO}/pulls/${number}`, { token: tok });
  if (
    fresh.head.sha !== sha ||
    fresh.labels.some(l => HOLD_LABELS.has(l.name.toLowerCase()))
  )
    handoff('head-moved-or-held');
  const commit = api(`repos/${REPO}/git/commits/${sha}`, { token: tok });
  const tree = [];
  for (const [p, f] of Object.entries(applied.files)) {
    const blob = JSON.parse(
      gh(
        [
          'api',
          `repos/${REPO}/git/blobs`,
          '-f',
          `content=${f.after}`,
          '-f',
          'encoding=utf-8',
        ],
        { token: tok }
      )
    );
    tree.push({ path: p, mode: '100644', type: 'blob', sha: blob.sha });
  }
  const newTree = JSON.parse(
    gh(['api', `repos/${REPO}/git/trees`, '--input', '-'], {
      token: tok,
      input: JSON.stringify({ base_tree: commit.tree.sha, tree }),
    })
  );
  const message = `fix(ci): ${failureClass} fix from cheap-fixer for #${number}\n\n${receipt.explanation}\n\nJev verdict: approve (${decision.confidence?.toFixed?.(2)}). Run ${process.env.GITHUB_RUN_ID ?? ''}.\n\nCo-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>`;
  const newCommit = JSON.parse(
    gh(['api', `repos/${REPO}/git/commits`, '--input', '-'], {
      token: tok,
      input: JSON.stringify({ message, tree: newTree.sha, parents: [sha] }),
    })
  );
  gh(
    [
      'api',
      '-X',
      'PATCH',
      `repos/${REPO}/git/refs/heads/${pr.head.ref}`,
      '-f',
      `sha=${newCommit.sha}`,
      '-F',
      'force=false',
    ],
    { token: tok }
  );
  mark('pushed');
  // The claim is fenced to the old head; deleting it keeps the PR clean for the lanes if the new head goes red.
  release();
  finish('pushed', { pushedSha: newCommit.sha });
}

main().catch(e => {
  receipt.error = String(e.message).slice(0, 300);
  finish('error');
});
