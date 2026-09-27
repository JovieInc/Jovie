#!/usr/bin/env node
// IO driver for the DeepSec closed loop (.github/workflows/deepsec.yml).
//   plan    decide whether and how to scan (ledger, budget, frontier models)
//   scan    run deepsec in budgeted chunks; write result.json + job summary
//   record  update the spend/model ledger; file, verify and close Linear issues
// Decisions live in deepsec-loop.mjs; this file only moves bytes.
import { spawnSync } from 'node:child_process';
import {
  appendFileSync,
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  writeFileSync,
} from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { JOVIE_TEAM_ID, linearGraphql } from '../lib/linear-issue-intake.mjs';
import {
  admitRun,
  applyRun,
  applySuppressions,
  canStartChunk,
  collectRun,
  estimateChunkUsd,
  formatIssue,
  frontierModels,
  GUARDED_LANE_ISSUE,
  groupFindings,
  hasScannedModel,
  isCriticalOrHigh,
  monthKey,
  monthSpend,
  orderCandidates,
  parseLedger,
  pendingFrontierModels,
  planReconciliation,
  priceFor,
  readMarker,
  renderSummary,
  resolveCaps,
  seedLedger,
  selectSensitiveFiles,
  shortHash,
  summarizeUsage,
  validateSuppressions,
  verificationTargets,
  writeMarker,
} from './deepsec-loop.mjs';
import { validatePolicy } from './deepsec-policy.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const WORKSPACE = join(HERE, 'deepsec');
const LEDGER_BRANCH = 'security/deepsec-ledger';
const LEDGER_PATH = 'ledger.json';
// Files per deepsec invocation: the unit of budget measurement.
const CHUNK = 20;

const targets = () =>
  JSON.parse(readFileSync(join(WORKSPACE, 'targets.json'), 'utf8')).targets;

export function loadPolicy() {
  return validatePolicy(
    readFileSync(join(WORKSPACE, 'policy.json')),
    readFileSync(join(WORKSPACE, 'targets.json'))
  ).policy;
}

/** @returns {Promise<any>} */
async function getJson(url, init = {}, fetchImpl = fetch) {
  const response = await fetchImpl(url, {
    ...init,
    signal: AbortSignal.timeout(20_000),
  });
  if (!response.ok) throw new Error(`${url} -> HTTP ${response.status}`);
  return response.json();
}

// ---- Ledger on an orphan branch, via the contents API ---------------------

/**
 * @param {string} path
 * @param {{ method?: string, body?: unknown, token?: string, fetchImpl?: typeof fetch }} [options]
 */
function gh(path, { method = 'GET', body, token, fetchImpl = fetch } = {}) {
  const repo = process.env.GITHUB_REPOSITORY ?? 'JovieInc/Jovie';
  return fetchImpl(`https://api.github.com/repos/${repo}/${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: 'application/vnd.github+json',
      'Content-Type': 'application/json',
    },
    body: body ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(20_000),
  });
}

export async function readLedger({ token, fetchImpl }) {
  const response = await gh(
    `contents/${LEDGER_PATH}?ref=${encodeURIComponent(LEDGER_BRANCH)}`,
    { token, fetchImpl }
  );
  if (response.status === 404) return { ledger: parseLedger(''), sha: null };
  if (!response.ok) throw new Error(`ledger read HTTP ${response.status}`);
  const file = /** @type {any} */ (await response.json());
  return {
    ledger: parseLedger(Buffer.from(file.content, 'base64').toString('utf8')),
    sha: file.sha,
  };
}

async function createLedgerBranch({ token, fetchImpl }) {
  const post = async (path, body) => {
    const response = await gh(path, { method: 'POST', body, token, fetchImpl });
    if (!response.ok && response.status !== 422)
      throw new Error(`${path} HTTP ${response.status}`);
    return /** @type {Promise<any>} */ (response.json());
  };
  const tree = await post('git/trees', {
    tree: [
      {
        path: 'README.md',
        mode: '100644',
        type: 'blob',
        content:
          'DeepSec spend and once-per-model ledger. Written by .github/workflows/deepsec.yml.\n',
      },
    ],
  });
  const commit = await post('git/commits', {
    message: 'chore(security): start deepsec ledger',
    tree: tree.sha,
    parents: [],
  });
  await post('git/refs', {
    ref: `refs/heads/${LEDGER_BRANCH}`,
    sha: commit.sha,
  });
}

// Optimistic read-modify-write: a concurrent writer makes the PUT fail on the
// stale blob sha, and the update is re-applied to the fresh ledger.
export async function updateLedger(
  mutate,
  { token, fetchImpl = fetch, attempts = 6 }
) {
  for (let attempt = 1; attempt <= attempts; attempt++) {
    const { ledger, sha } = await readLedger({ token, fetchImpl });
    const next = mutate(ledger);
    const response = await gh(`contents/${LEDGER_PATH}`, {
      method: 'PUT',
      token,
      fetchImpl,
      body: {
        message: `chore(security): deepsec ledger ${new Date().toISOString()}`,
        content: Buffer.from(`${JSON.stringify(next, null, 2)}\n`).toString(
          'base64'
        ),
        branch: LEDGER_BRANCH,
        ...(sha ? { sha } : {}),
      },
    });
    if (response.ok) return next;
    if (response.status === 404 && attempt === 1)
      await createLedgerBranch({ token, fetchImpl });
    else if (![409, 422].includes(response.status))
      throw new Error(`ledger write HTTP ${response.status}`);
  }
  throw new Error('ledger write kept conflicting');
}

// ---- Linear ----------------------------------------------------------------

async function linear(query, variables, apiKey) {
  const result = await linearGraphql({ query, variables, apiKey }, 'deepsec');
  if (!result.ok)
    throw new Error(`${result.reason}: ${JSON.stringify(result.body)}`);
  return result.data;
}

export async function loadLoopIssues(apiKey) {
  const data = await linear(
    `query($teamId: ID!) {
      issues(first: 250, filter: {
        team: { id: { eq: $teamId } }
        description: { contains: "deepsec-loop:" }
      }) { nodes { id identifier url title description state { type name } } }
    }`,
    { teamId: JOVIE_TEAM_ID },
    apiKey
  );
  return data.issues.nodes.filter(issue => readMarker(issue.description));
}

// ---- Model lookup ------------------------------------------------------------

export function modelFor(gatewayId, policy, leaderboard) {
  if (gatewayId === policy.models.cheap.gatewayId) return policy.models.cheap;
  return (
    frontierModels(leaderboard.results, Number.POSITIVE_INFINITY).find(
      model => model?.gatewayId === gatewayId
    ) ?? null
  );
}

// ---- plan ----------------------------------------------------------------

/** @returns {Promise<Record<string, any>>} */
export async function plan(env, deps = {}) {
  const fetchImpl = deps.fetchImpl ?? fetch;
  const policy = loadPolicy();
  const now = deps.now ?? new Date().toISOString();
  const caps = resolveCaps(policy.billing, env);
  const { ledger } = await readLedger({ token: env.GITHUB_TOKEN, fetchImpl });
  const monthSpentUsd = monthSpend(ledger, monthKey(now));
  const kind =
    env.EVENT === 'pull_request'
      ? 'pr'
      : env.EVENT === 'workflow_dispatch'
        ? env.INPUT_MODE
        : env.SCHEDULE === env.WEEKLY_CRON
          ? 'weekly'
          : 'frontier';
  const base = { kind, run: false, headSha: env.HEAD_SHA, monthSpentUsd };
  if (policy.execution.status !== 'advisory')
    return { ...base, reason: 'policy execution status is not advisory' };
  const budget = admitRun({ kind, caps, monthSpentUsd });
  if (!budget.admit) return { ...base, reason: budget.reason };

  if (kind === 'pr') {
    const { files, deferred } = selectSensitiveFiles(
      env.CHANGED_FILES.split('\n').filter(Boolean),
      policy.billing.prMaxFiles
    );
    if (files.length === 0)
      return {
        ...base,
        reason: 'no auth/billing/security-sensitive files changed',
      };
    return {
      ...base,
      run: true,
      reason: budget.reason,
      capUsd: budget.capUsd,
      model: policy.models.cheap,
      files,
      deferred,
    };
  }

  const leaderboard = await getJson(
    policy.models.frontierSource,
    {},
    fetchImpl
  );
  if (kind === 'weekly') {
    const verify = env.LINEAR_API_KEY
      ? verificationTargets(await loadLoopIssues(env.LINEAR_API_KEY))
          .map(target => ({
            ...target,
            model: modelFor(target.gatewayId, policy, leaderboard),
          }))
          .filter(target => target.model)
      : [];
    return {
      ...base,
      run: true,
      reason: budget.reason,
      capUsd: budget.capUsd,
      model: policy.models.cheap,
      verify,
      coverage: ledger.coverage,
    };
  }

  let model;
  let seed = [];
  if (env.INPUT_MODEL) {
    model = modelFor(env.INPUT_MODEL, policy, leaderboard);
    if (!model)
      return { ...base, reason: `${env.INPUT_MODEL} is not on DeepSecBench` };
  } else {
    const top = frontierModels(leaderboard.results, policy.models.frontierTopN);
    // First run ever: scan with the strongest model, mark the rest as known.
    if (Object.keys(ledger.models).length === 0) seed = top.slice(1);
    model = pendingFrontierModels(
      leaderboard.results,
      seedLedger(ledger, seed, now),
      policy.models.frontierTopN
    )[0];
    if (!model)
      return { ...base, reason: 'no new frontier model on DeepSecBench' };
  }
  if (hasScannedModel(ledger, model.gatewayId) && env.INPUT_FORCE !== 'true')
    return {
      ...base,
      reason: `${model.gatewayId} already scanned the repo once`,
    };
  return {
    ...base,
    run: true,
    reason: budget.reason,
    capUsd: budget.capUsd,
    model,
    seed,
  };
}

// ---- scan ----------------------------------------------------------------

function listJson(dir) {
  if (!existsSync(dir)) return [];
  return readdirSync(dir, { recursive: true, withFileTypes: true })
    .filter(entry => entry.isFile() && entry.name.endsWith('.json'))
    .map(entry =>
      JSON.parse(readFileSync(join(entry.parentPath, entry.name), 'utf8'))
    );
}

function deepsec(args, env) {
  const result = spawnSync(join(WORKSPACE, 'node_modules/.bin/deepsec'), args, {
    cwd: WORKSPACE,
    env,
    stdio: 'inherit',
    timeout: 3 * 60 * 60 * 1000,
  });
  // Direct mode exits 1 when it found something; anything else is an error.
  return result.status === 0 || result.status === 1
    ? null
    : `deepsec ${args[0]} exited ${result.status ?? result.signal}`;
}

export function scannerEnv(env, policy, dataRoot, srcRoot) {
  const clean = {
    PATH: env.PATH,
    HOME: env.HOME,
    TMPDIR: env.RUNNER_TEMP ?? env.TMPDIR,
    LANG: env.LANG ?? 'C.UTF-8',
    CI: 'true',
    AI_GATEWAY_API_KEY: env.AI_GATEWAY_API_KEY,
    DEEPSEC_SOURCE_ROOT: srcRoot,
    DEEPSEC_DATA_ROOT: dataRoot,
    // Honored by the Claude harness; codex/pi requests carry deepsec's own
    // x-title attribution instead.
    ANTHROPIC_CUSTOM_HEADERS: `ai-reporting-tags: ${policy.gatewayTags.join(',')}`,
  };
  for (const name of policy.execution.rejectEnv) delete clean[name];
  return clean;
}

export async function scan(env, deps = {}) {
  const policy = loadPolicy();
  const planned = JSON.parse(readFileSync(env.PLAN_FILE, 'utf8'));
  const dataRoot = resolve(env.RUNNER_TEMP ?? '/tmp', 'deepsec-data');
  mkdirSync(dataRoot, { recursive: true });
  const projectDir = join(dataRoot, policy.projectId);
  const scannerEnvVars = scannerEnv(
    env,
    policy,
    dataRoot,
    resolve(env.SRC_ROOT)
  );
  const pricing = await getJson(
    policy.models.pricingSource,
    {},
    deps.fetchImpl
  );
  const models = new Map();
  const runIds = [];
  let error = null;
  let stopped = false;
  let largestChunkUsd = 0;
  let spentUsd = 0;

  const knownRuns = () =>
    new Set(listJson(join(projectDir, 'runs')).map(run => run.runId));
  const measure = () => {
    const records = listJson(join(projectDir, 'files'));
    const entries = records.flatMap(record =>
      (record.analysisHistory ?? []).filter(entry =>
        runIds.includes(entry.runId)
      )
    );
    let cost = 0;
    for (const { model, price } of models.values())
      cost += summarizeUsage(
        entries.filter(entry => entry.model === model),
        price,
        policy.billing.costSafetyFactor
      ).costUsd;
    return { records, entries, cost };
  };
  const chunk = (model, files) => {
    const estimate = estimateChunkUsd(
      models.get(model.gatewayId).price,
      files.length,
      policy.billing.costSafetyFactor
    );
    if (
      !canStartChunk({
        spentUsd,
        capUsd: planned.capUsd,
        largestChunkUsd: Math.max(largestChunkUsd, estimate),
      })
    ) {
      stopped = true;
      return false;
    }
    const before = knownRuns();
    const args = ['process', '--files', files.join(',')];
    error = deepsec(
      [
        ...args,
        '--project-id',
        policy.projectId,
        '--agent',
        model.agent,
        '--model',
        model.model,
        '--thinking-level',
        model.reasoning,
        '--concurrency',
        '6',
      ],
      scannerEnvVars
    );
    const fresh = [...knownRuns()].filter(id => !before.has(id));
    runIds.push(...fresh);
    // deepsec logs and continues when its config fails to load, scanning an
    // auto-created empty project; treat "no run recorded" as a hard error.
    if (!error && fresh.length === 0)
      error = `deepsec ${args[0]} recorded no run in ${projectDir}`;
    const { cost } = measure();
    largestChunkUsd = Math.max(largestChunkUsd, cost - spentUsd);
    spentUsd = cost;
    return !error;
  };
  const priced = model => {
    const price = priceFor(pricing, model.gatewayId);
    if (price) models.set(model.gatewayId, { model: model.model, price });
    return price;
  };

  const run = (model, files) => {
    for (let i = 0; i < files.length && !error && !stopped; i += CHUNK)
      chunk(model, files.slice(i, i + CHUNK));
  };
  if (!priced(planned.model)) {
    error = `no gateway price for ${planned.model.gatewayId}; skipped (fail closed)`;
  } else if (planned.kind === 'pr') {
    run(planned.model, planned.files);
  } else {
    // Same-model re-scans first: closing a fixed issue needs this evidence.
    for (const target of planned.verify ?? [])
      if (priced(target.model)) run(target.model, target.files);
    // The regex pass is free; it ranks candidates for the budgeted AI pass.
    if (!error && !stopped)
      error = deepsec(
        ['scan', '--project-id', policy.projectId],
        scannerEnvVars
      );
    if (!error)
      run(
        planned.model,
        orderCandidates(listJson(join(projectDir, 'files')), {
          targets: targets(),
          coverage: planned.kind === 'weekly' ? planned.coverage : {},
        })
      );
  }

  const { records, entries } = measure();
  const modelOf = entry =>
    [...models].find(([, value]) => value.model === entry.model)?.[0] ??
    entry.model;
  const { analyzed, findings } = collectRun(records, runIds, modelOf);
  const usage = {
    analyses: 0,
    inputTokens: 0,
    outputTokens: 0,
    cacheReadTokens: 0,
    costUsd: 0,
  };
  for (const [gatewayId, { price }] of models) {
    const part = summarizeUsage(
      entries.filter(entry => modelOf(entry) === gatewayId),
      price,
      policy.billing.costSafetyFactor
    );
    for (const key of Object.keys(usage)) usage[key] += part[key];
  }
  usage.costUsd = Math.round(usage.costUsd * 10_000) / 10_000;
  const missing = (planned.files ?? []).filter(
    path => !analyzed.some(row => row.path === path)
  );
  if (!error && !stopped && missing.length)
    error = `deepsec skipped ${missing.length} planned file(s): ${missing.join(', ')}`;
  const result = {
    kind: planned.kind,
    gatewayId: planned.model.gatewayId,
    agent: planned.model.agent,
    reasoning: planned.model.reasoning,
    headSha: planned.headSha,
    status: error ? 'error' : stopped ? 'partial-budget' : 'complete',
    error,
    capUsd: planned.capUsd,
    monthSpentUsd: planned.monthSpentUsd,
    usage,
    analyzed,
    groups: groupFindings(findings),
    runIds,
    coverage:
      planned.kind === 'weekly'
        ? Object.fromEntries(
            records
              .filter(record =>
                analyzed.some(
                  row =>
                    row.path === record.filePath &&
                    row.gatewayId === planned.model.gatewayId
                )
              )
              .map(record => [record.filePath, shortHash(record.fileHash)])
          )
        : undefined,
    finishedAt: (deps.now ?? new Date()).toISOString(),
    note: planned.deferred?.length
      ? `Deferred ${planned.deferred.length} sensitive file(s) past the ${policy.billing.prMaxFiles}-file PR limit.`
      : null,
  };
  writeFileSync(env.RESULT_FILE, `${JSON.stringify(result, null, 2)}\n`);
  if (env.GITHUB_STEP_SUMMARY)
    appendFileSync(env.GITHUB_STEP_SUMMARY, `${renderSummary(result)}\n`);
  return result;
}

// ---- record ----------------------------------------------------------------

async function labelIds(names, apiKey) {
  const data = await linear(
    `query($names: [String!]) { issueLabels(first: 50, filter: { name: { in: $names } }) {
      nodes { id name team { id } } } }`,
    { names },
    apiKey
  );
  const ids = new Map();
  for (const label of data.issueLabels.nodes)
    if (!label.team || label.team.id === JOVIE_TEAM_ID)
      ids.set(label.name, label.id);
  return ids;
}

async function reconcile(result, env) {
  const apiKey = env.LINEAR_API_KEY;
  const policy = loadPolicy();
  const suppressions = validateSuppressions(
    JSON.parse(readFileSync(join(WORKSPACE, 'suppressions.json'), 'utf8'))
  );
  const { kept, suppressed, reviewDue } = applySuppressions(
    result.groups,
    suppressions,
    result.finishedAt
  );
  const issues = await loadLoopIssues(apiKey);
  const actions = planReconciliation({
    groups: kept,
    issues,
    analyzed: result.analyzed,
    maxNew: policy.billing.maxNewIssuesPerRun,
  });
  const meta = await linear(
    `query($teamId: String!, $guarded: String!) {
      team(id: $teamId) { states { nodes { id name type } } }
      issue(id: $guarded) { id }
    }`,
    { teamId: JOVIE_TEAM_ID, guarded: GUARDED_LANE_ISSUE },
    apiKey
  );
  const stateId = name =>
    meta.team.states.nodes.find(state => state.name === name)?.id;
  const labels = await labelIds(
    [
      'security',
      'Bug',
      'area:security',
      'risk:high',
      'severity:P0-blocker',
      'severity:P1',
      'severity:P2',
    ],
    apiKey
  );
  const ctx = {
    kind: result.kind,
    headSha: result.headSha,
    runUrl: env.RUN_URL,
  };
  // Operator preview: every read above ran; no Linear mutation below does.
  if (env.DEEPSEC_DRY_RUN === 'true')
    return actions
      .map(action => {
        const target = action.issue?.identifier ?? action.group?.path;
        const title = action.group ? formatIssue(action.group, ctx).title : '';
        return `- dry-run ${action.type} ${target} ${title}`;
      })
      .join('\n');
  const update = (id, input) =>
    linear(
      'mutation($id: String!, $input: IssueUpdateInput!) { issueUpdate(id: $id, input: $input) { success } }',
      { id, input },
      apiKey
    );
  const comment = (issueId, body) =>
    linear(
      'mutation($input: CommentCreateInput!) { commentCreate(input: $input) { success } }',
      { input: { issueId, body } },
      apiKey
    );
  const sha = result.headSha.slice(0, 12);
  const guardedNew = [];
  const log = [];
  for (const action of actions) {
    const { issue, marker } = action;
    if (action.type === 'create') {
      const shaped = formatIssue(action.group, ctx);
      const data = await linear(
        `mutation($input: IssueCreateInput!) { issueCreate(input: $input) {
          success issue { id identifier url } } }`,
        {
          input: {
            teamId: JOVIE_TEAM_ID,
            title: shaped.title,
            description: shaped.description,
            priority: shaped.priority,
            stateId: stateId('Backlog'),
            labelIds: shaped.labels
              .map(name => labels.get(name))
              .filter(Boolean),
          },
        },
        apiKey
      );
      const created = data.issueCreate.issue;
      log.push(
        `created ${created.identifier} ${action.group.severity} ${action.group.path}`
      );
      if (shaped.guarded) {
        guardedNew.push(
          `${created.identifier} (${action.group.severity}) ${created.url}`
        );
        await linear(
          `mutation($input: IssueRelationCreateInput!) { issueRelationCreate(input: $input) { success } }`,
          {
            input: {
              issueId: created.id,
              relatedIssueId: meta.issue.id,
              type: 'related',
            },
          },
          apiKey
        );
      }
    } else if (action.type === 'reopen') {
      await update(issue.id, {
        stateId: stateId('Todo'),
        description: writeMarker(issue.description, {
          ...marker,
          absent: 0,
          reopenedAt: result.finishedAt,
        }),
      });
      await comment(
        issue.id,
        `DeepSec re-scan at \`${sha}\` (${result.gatewayId}) still reports this. Reopened: the fix is not verified. ${env.RUN_URL}`
      );
      if (isCriticalOrHigh(action.group.severity))
        guardedNew.push(`${issue.identifier} (reopened) ${issue.url}`);
      log.push(`reopened ${issue.identifier}`);
    } else if (action.type === 'seen' && marker.absent) {
      await update(issue.id, {
        description: writeMarker(issue.description, { ...marker, absent: 0 }),
      });
    } else if (action.type === 'mark-absent') {
      await update(issue.id, {
        description: writeMarker(issue.description, {
          ...marker,
          absent: (marker.absent ?? 0) + 1,
        }),
      });
      log.push(`absent once ${issue.identifier}`);
    } else if (
      action.type === 'verify-fixed' ||
      action.type === 'close-fixed'
    ) {
      await update(issue.id, {
        ...(action.type === 'close-fixed' ? { stateId: stateId('Done') } : {}),
        description: writeMarker(issue.description, {
          ...marker,
          verifiedAt: result.finishedAt,
          verifiedSha: result.headSha,
        }),
      });
      await comment(
        issue.id,
        `Verified fixed: a DeepSec re-scan of \`${marker.path}\` at \`${sha}\` with \`${marker.model}\` no longer reports it. ${env.RUN_URL}`
      );
      log.push(`verified ${issue.identifier}`);
    } else if (action.type === 'skip-canceled') {
      log.push(
        `canceled ${issue.identifier} still reported: add a suppression entry for ${action.group.fingerprint}`
      );
    } else if (action.type === 'defer') {
      log.push(`deferred ${action.group.fingerprint} (new-issue limit)`);
    }
  }
  if (guardedNew.length)
    await comment(
      meta.issue.id,
      [
        `Summer: DeepSec filed critical/high security findings for the guarded lane (${result.kind} scan, \`${result.gatewayId}\`, \`${sha}\`):`,
        ...guardedNew.map(line => `- ${line}`),
        `Run: ${env.RUN_URL}`,
      ].join('\n')
    );
  return [
    '### Linear reconciliation',
    ...log.map(line => `- ${line}`),
    `- suppressed: ${suppressed.length}; suppressions due for monthly review: ${reviewDue.map(entry => entry.fingerprint).join(', ') || 'none'}`,
  ].join('\n');
}

export async function record(env) {
  const planned = JSON.parse(readFileSync(env.PLAN_FILE, 'utf8'));
  const result = existsSync(env.RESULT_FILE)
    ? JSON.parse(readFileSync(env.RESULT_FILE, 'utf8'))
    : null;
  if (env.DEEPSEC_DRY_RUN === 'true' && result && env.LINEAR_API_KEY) {
    console.log(await reconcile(result, env));
    return;
  }
  const now = new Date().toISOString();
  await updateLedger(
    ledger => {
      let next = seedLedger(
        ledger,
        planned.seed ?? [],
        now,
        planned.model?.gatewayId
      );
      if (result)
        next = applyRun(next, {
          kind: result.kind,
          gatewayId: result.gatewayId,
          headSha: result.headSha,
          status: result.status,
          costUsd: result.usage.costUsd,
          filesAnalyzed: result.usage.analyses,
          finishedAt: result.finishedAt,
          runUrl: env.RUN_URL,
          coverage: result.coverage,
        });
      return next;
    },
    { token: env.GITHUB_TOKEN }
  );
  if (!result) return;
  let summary = '';
  if (result.kind === 'pr') {
    if (result.groups.length === 0) return;
    const body = renderSummary(result);
    writeFileSync(
      env.PR_COMMENT_FILE,
      `${body}\n\nAdvisory only: this check never blocks merge.\n`
    );
  } else if (env.LINEAR_API_KEY) {
    summary = await reconcile(result, env);
  } else summary = 'LINEAR_API_KEY missing: findings were not filed.';
  if (summary && env.GITHUB_STEP_SUMMARY)
    appendFileSync(env.GITHUB_STEP_SUMMARY, `${summary}\n`);
}

// ---- CLI -------------------------------------------------------------------

/** @param {string[]} args */
async function main(args) {
  const [command] = args;
  const env = process.env;
  if (command === 'plan') {
    const planned = await plan(env);
    writeFileSync(env.PLAN_FILE, `${JSON.stringify(planned, null, 2)}\n`);
    if (env.GITHUB_OUTPUT)
      appendFileSync(env.GITHUB_OUTPUT, `run=${planned.run}\n`);
    const line = `DeepSec ${planned.kind}: ${planned.run ? 'scan' : 'skip'} (${planned.reason})${planned.model ? ` model ${planned.model.gatewayId}` : ''}`;
    console.log(line);
    if (env.GITHUB_STEP_SUMMARY)
      appendFileSync(env.GITHUB_STEP_SUMMARY, `${line}\n`);
  } else if (command === 'scan') {
    const result = await scan(env);
    if (result.status === 'error') console.error(`::warning::${result.error}`);
  } else if (command === 'record') {
    await record(env);
  } else
    throw new Error(
      `usage: deepsec-run.mjs plan|scan|record (${relative(process.cwd(), HERE)})`
    );
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href)
  main(process.argv.slice(2)).catch(error => {
    console.error(error);
    process.exitCode = 1;
  });
