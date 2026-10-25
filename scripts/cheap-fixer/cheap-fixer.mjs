#!/usr/bin/env node
/**
 * Cheap fixer: first rung of the repair ladder (docs/evaluations/cheap-fixer.md). Triggered by
 * cheap-fixer.yml on a failed required workflow_run. Diagnoses with a cheap Gateway model, has
 * Jev judge the patch, and either records it (shadow) or pushes it as one normal commit (push).
 * Any doubt hands off to the lanes untouched. Never executes PR code; the only inputs are logs
 * and file text, treated as untrusted. All outbound calls go through packages/api-client.
 *
 * Env: GH_TOKEN (read), GH_PUSH_TOKEN (push mode), AI_GATEWAY_API_KEY, REPO, EVENT_PATH,
 *      MODE=shadow|push, PUSH_CLASSES=comma list, OUT_DIR, REPLAY=1 (historical run, judge-only).
 */
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import {
  copyFileSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
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
  BIOME_EXT,
  buildPrompt,
  CLAIM_HOST,
  CLASSES,
  claimBody,
  classifyDetail,
  commandFromLog,
  costUsd,
  FORMAT_LIMITS,
  fillRedBeforeGreen,
  fleetKinds,
  guardFormatterOutput,
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

// Shared budget, breaker and retries: the client layer is the contract (.claude/rules/external-apis.md).
const reader = createGitHubClient({
  token: process.env.GH_TOKEN ?? '',
  credential: 'cheap-fixer-read',
});
const writer = process.env.GH_PUSH_TOKEN
  ? createGitHubClient({
      token: process.env.GH_PUSH_TOKEN,
      credential: 'cheap-fixer-write',
    })
  : null;
const modelClient = createApiClient({
  provider: 'ai-gateway',
  credential: 'cheap-fixer-gateway',
  authorize: headers =>
    headers.set('authorization', `Bearer ${process.env.AI_GATEWAY_API_KEY}`),
});
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
  const body = res.json();
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

  const pr = await get(`repos/${REPO}/pulls/${number}`);
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
  const jobs = (
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
  // Rung and action: deterministic rungs first, the model only for typecheck/test-like classes.
  const kinds = failureClass === 'pr_metadata' ? fleetKinds(rawLog) : [];
  const biomeRed =
    failureClass === 'format' ||
    (failureClass === 'lint' && /biome/i.test(logTail));
  let rung = 'model';
  let action = failureClass;
  if (failureClass === 'pr_metadata') {
    rung = 'fleet';
    action = kinds.includes('evidence-unavailable')
      ? 'fleet_rerun'
      : kinds.includes('red-before-green')
        ? 'fleet_body'
        : 'fleet_handoff';
  } else if (biomeRed) {
    rung = 'formatter';
    action = failureClass;
  } else if (!CLASSES.includes(failureClass)) {
    finish('handoff-unfixable-class');
  }
  Object.assign(receipt, { rung, action, fleetKinds: kinds });
  if (MODE === 'push' && !PUSH_CLASSES.has(action))
    finish('handoff-class-not-enabled');

  // Only push mode fences the head: shadow must never stop the lanes from working.
  let claimId = null;
  if (MODE === 'push') {
    if (!writer) finish('error', { error: 'push mode without GH_PUSH_TOKEN' });
    const posted = (
      await writer.rest(
        'POST',
        `repos/${REPO}/issues/${number}/comments`,
        { body: claimBody(sha) },
        call
      )
    ).json();
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

  // One verified, non-forced commit (createCommitOnBranch fails if the head moved).
  const pushFiles = async (files, headline, detail) => {
    const fresh = await get(`repos/${REPO}/pulls/${number}`);
    if (
      fresh.head.sha !== sha ||
      fresh.labels.some(l => HOLD_LABELS.has(l.name.toLowerCase()))
    )
      await handoff('head-moved-or-held');
    const data = await writer.graphql(
      `mutation CheapFix($input: CreateCommitOnBranchInput!) {
        createCommitOnBranch(input: $input) { commit { oid } }
      }`,
      {
        input: {
          branch: { repositoryNameWithOwner: REPO, branchName: pr.head.ref },
          expectedHeadOid: sha,
          message: {
            headline,
            body: `${detail}\n\nRun ${process.env.GITHUB_RUN_ID ?? ''}.\n\nCo-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>`,
          },
          fileChanges: {
            additions: Object.entries(files).map(([path, f]) => ({
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
  };
  const comment = async body => {
    const marker = `<!-- cheap-fixer:${sha} -->`;
    const existing = await get(
      `repos/${REPO}/issues/${number}/comments?per_page=100`
    );
    if (existing.some(c => c.body?.includes(marker))) return false;
    await writer.rest(
      'POST',
      `repos/${REPO}/issues/${number}/comments`,
      { body: `${marker}\n${body}` },
      call
    );
    return true;
  };

  // Rung: PR-body / fleet-rule reds. Facts only; a missing fact is named, never invented.
  if (rung === 'fleet') {
    const annotations = [...rawLog.matchAll(/##\[error\](.+)/g)]
      .map(m => m[1].trim())
      .filter(m => !/^Process completed/.test(m))
      .slice(0, 5);
    receipt.annotations = annotations;
    if (action === 'fleet_rerun') {
      // The rule script threw before evaluating (head moved, incomplete read, API quota): re-run, change nothing.
      if (run.run_attempt !== 1 || pr.head.sha !== sha)
        await handoff('rerun-not-eligible');
      if (MODE === 'shadow') finish('shadow-would-rerun');
      await writer.rest(
        'POST',
        `repos/${REPO}/actions/runs/${run.id}/rerun-failed-jobs`,
        undefined,
        call
      );
      mark('rerun');
      await release();
      finish('rerun-requested');
    }
    if (action === 'fleet_body') {
      const { evaluateFleetRules } = await import('../pr-fleet-rules.mjs');
      const required = new Set([
        'Source Validation',
        'CI',
        'Changed-Evidence Test Suites',
      ]);
      const runs = (
        await get(
          `repos/${REPO}/actions/runs?event=pull_request&branch=${encodeURIComponent(pr.head.ref)}&status=failure&per_page=50`
        )
      ).workflow_runs.filter(
        r =>
          required.has(r.name) &&
          r.head_sha !== sha &&
          r.id !== run.id &&
          Date.parse(r.created_at) < Date.parse(run.created_at)
      );
      let evidence = null;
      for (const prior of runs.slice(0, 5)) {
        const priorJobs = (
          await get(
            `repos/${REPO}/actions/runs/${prior.id}/jobs?per_page=100&filter=latest`
          )
        ).jobs.filter(
          j =>
            j.conclusion === 'failure' &&
            !/^(PR Ready|PR Fleet Rules)|\bgate\b/i.test(j.name) &&
            !j.steps?.some(
              s => s.conclusion === 'failure' && /fleet rules/i.test(s.name)
            )
        );
        for (const j of priorJobs.slice(0, 2)) {
          const priorLog = (
            await reader.rest(
              'GET',
              `repos/${REPO}/actions/jobs/${j.id}/logs`,
              undefined,
              call
            )
          ).text;
          const command = commandFromLog(priorLog);
          const priorClass = classifyDetail(
            curateLogTail(priorLog).slice(-LIMITS.logTailBytes)
          ).name;
          if (command && CLASSES.includes(priorClass)) {
            evidence = {
              command,
              runUrl: prior.html_url,
              job: j.name,
              priorClass,
            };
            break;
          }
        }
        if (evidence) break;
      }
      receipt.evidence = evidence;
      if (!evidence) {
        const msg = `PR metadata check "${annotations[0] ?? 'red-before-green'}" needs a fact the automation cannot derive: the failing command and a red run from before the fix. No earlier failed required run with a readable command exists on this branch. Add \`Failing command:\` and \`Failing run (before fix): <URL>\` under \`## Red-before-green\`.`;
        if (MODE === 'push' && PUSH_CLASSES.has('fleet_handoff'))
          await comment(`🤖 cheap-fixer: ${msg}`);
        await handoff('missing-facts', { missing: msg });
      }
      const body = fillRedBeforeGreen(pr.body, evidence);
      const files = await get(
        `repos/${REPO}/pulls/${number}/files?per_page=100`
      );
      const after = evaluateFleetRules({
        pr: { ...pr, body },
        files,
        repository: REPO,
      });
      receipt.remainingErrors = after.errors;
      if (after.errors.some(e => e.startsWith('red-before-green')))
        await handoff('body-still-red');
      receipt.bodyDiff = { before: pr.body ?? '', after: body };
      if (MODE === 'shadow') finish('shadow-body-proposed');
      await writer.rest(
        'PATCH',
        `repos/${REPO}/pulls/${number}`,
        { body },
        call
      );
      mark('body-updated');
      await release();
      finish('body-updated');
    }
    // locked-areas, done-receipt, assertions: a human or lane owns the missing fact.
    const msg = `PR metadata check is red and needs facts automation must not invent: ${annotations.join(' | ') || 'see the PR Fleet Rules job'}.`;
    if (MODE === 'push' && PUSH_CLASSES.has('fleet_handoff'))
      await comment(`🤖 cheap-fixer: ${msg}`);
    await handoff('metadata-needs-human-fact', { missing: msg });
  }

  // Rung: formatter. The repo's own biome, trusted config from main, PR files as data; no PR code runs.
  const changed = await get(`repos/${REPO}/pulls/${number}/files?per_page=100`);
  if (rung === 'formatter') {
    const candidates = changed
      .filter(f => f.status !== 'removed' && BIOME_EXT.test(f.filename))
      .map(f => f.filename);
    if (!candidates.length || candidates.length > FORMAT_LIMITS.maxFiles)
      await handoff('formatter-file-count', { count: candidates.length });
    const dir = mkdtempSync(join(tmpdir(), 'cheap-fixer-fmt-'));
    copyFileSync('biome.json', join(dir, 'biome.json'));
    writeFileSync(join(dir, '.gitignore'), ''); // biome's vcs.useIgnoreFile needs one in the scratch root
    execFileSync('git', ['init', '-q'], { cwd: dir });
    const before = {};
    for (const p of candidates) {
      const f = await get(`repos/${REPO}/contents/${encodeURI(p)}?ref=${sha}`);
      if (f.size > FORMAT_LIMITS.maxFileBytes || f.encoding !== 'base64')
        await handoff('formatter-file-size', { path: p });
      before[p] = Buffer.from(f.content, 'base64').toString('utf8');
      mkdirSync(dirname(join(dir, p)), { recursive: true });
      writeFileSync(join(dir, p), before[p]);
    }
    const biome =
      process.env.BIOME_BIN || join(process.cwd(), 'node_modules/.bin/biome');
    const biomeRun = args => {
      try {
        execFileSync(biome, args, { cwd: dir, stdio: 'pipe', timeout: 120000 });
        return 0;
      } catch (e) {
        receipt.biomeOutput =
          `${e.stdout ?? ''}${e.stderr ?? ''}${e.message}`.slice(-900);
        return e.status ?? 1;
      }
    };
    biomeRun(['check', '--write', '--no-errors-on-unmatched', ...candidates]);
    const verifyStatus = biomeRun([
      'check',
      '--no-errors-on-unmatched',
      ...candidates,
    ]);
    mark('formatter');
    if (verifyStatus !== 0) await handoff('formatter-still-red');
    const files = {};
    for (const p of candidates) {
      const after = readFileSync(join(dir, p), 'utf8');
      if (after !== before[p]) files[p] = { before: before[p], after };
    }
    const violations = guardFormatterOutput(files);
    const diff = Object.entries(files)
      .map(([p, f]) => unifiedDiff(p, f.before, f.after))
      .filter(Boolean)
      .join('\n');
    Object.assign(receipt, { diff, files: Object.keys(files) });
    if (violations.length) await handoff('guard-violation', { violations });
    if (MODE === 'shadow') finish('shadow-proposed');
    await pushFiles(
      files,
      `chore(ci): apply biome ${failureClass} fixes (cheap-fixer) for #${number}`,
      'Deterministic: biome check --write on files this PR changed, trusted config from main; check passes afterwards.'
    );
  }

  // Files: only ones the PR changed (plus snapshots named in the log).
  const changedInPr = new Set(
    changed.filter(f => f.status !== 'removed').map(f => f.filename)
  );
  const wanted = pathsInLog(rawLog, changedInPr);
  if (!wanted.length) await handoff('no-candidate-files');
  const contents = {};
  for (const p of wanted) {
    try {
      const f = await get(`repos/${REPO}/contents/${encodeURI(p)}?ref=${sha}`);
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
  if (!applied.ok) await handoff('edit-invalid', { reason: applied.reason });
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

  await pushFiles(
    applied.files,
    `fix(ci): ${failureClass} fix from cheap-fixer for #${number}`,
    `${receipt.explanation}\n\nJev verdict: approve (${decision.confidence?.toFixed?.(2)}).`
  );
}

main().catch(e => {
  receipt.error = String(e.message).slice(0, 300);
  finish('error');
});
