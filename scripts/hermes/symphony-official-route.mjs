#!/usr/bin/env node
/** Subscription-native model routing for the official OpenAI Symphony lifecycle. */

import { mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { basename, join, resolve } from 'node:path';

export const OFFICIAL_ROUTE_SCHEMA = 'symphony-official-route/v1';
export const OFFICIAL_ROUTE_FILE = '.symphony-official-route.json';

const MODEL_RANK = Object.freeze({
  'gpt-5.6-luna': 0,
  'gpt-5.6-terra': 1,
  'gpt-5.6-sol': 2,
});
const EFFORT_RANK = Object.freeze({ low: 0, medium: 1, high: 2, xhigh: 3 });
const ROUTES = Object.freeze({
  routine: { model: 'gpt-5.6-luna', reasoningEffort: 'low' },
  standard: { model: 'gpt-5.6-luna', reasoningEffort: 'medium' },
  evidence: { model: 'gpt-5.6-terra', reasoningEffort: 'high' },
  hard: { model: 'gpt-5.6-sol', reasoningEffort: 'xhigh' },
});

const issueText = issue =>
  [
    issue?.title,
    issue?.description,
    ...(issue?.labels?.nodes || issue?.labels || []).map(label =>
      typeof label === 'string' ? label : label?.name
    ),
  ]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();

export function classifyOfficialRoute(issue, { attempt = 1 } = {}) {
  const text = issueText(issue);
  const hardRisk =
    /\b(auth|billing|payment|security|secret|token|credential|database|migration|production|deploy|release|privacy|legal|destructive|merge[- ]queue|branch protection)\b/.test(
      text
    );
  const explicitFailure =
    /\b(fail(?:ed|ing|ure)?|crash|incident|regression|root cause|broken|timeout|retry|conflict)\b/.test(
      text
    );
  const failure = attempt > 1 || explicitFailure;
  const evidence =
    /\b(verify|verification|evidence|proof|invariant|coverage|golden path|adversarial|exact runtime|check[- ]run|ci)\b/.test(
      text
    );
  const ambiguity =
    /\b(architecture|architectural|orchestrat|refactor|workflow|routing|unknown|ambiguous|investigat|audit|system[- ]wide)\b/.test(
      text
    );
  const routine =
    /\b(typo|copy|docs?|readme|format|lint|rename|comment|mechanical|token replacement|snapshot update)\b/.test(
      text
    );

  const routeClass =
    hardRisk || explicitFailure || attempt >= 3
      ? 'hard'
      : evidence || ambiguity || failure
        ? 'evidence'
        : routine
          ? 'routine'
          : 'standard';
  return {
    routeClass,
    hardRisk,
    failure,
    explicitFailure,
    evidence,
    ambiguity,
    routine,
    attempt,
  };
}

function strongerRoute(left, right) {
  if (!left) return right;
  const model =
    MODEL_RANK[left.model] >= MODEL_RANK[right.model]
      ? left.model
      : right.model;
  const reasoningEffort =
    EFFORT_RANK[left.reasoningEffort] >= EFFORT_RANK[right.reasoningEffort]
      ? left.reasoningEffort
      : right.reasoningEffort;
  return { model, reasoningEffort };
}

function capacityEvidence(capacity) {
  if (!capacity || typeof capacity !== 'object') {
    return { readable: false, alert: 'capacity-telemetry-unavailable' };
  }
  const usagePercent = Number(capacity.usagePercent);
  const remainingPercent = Number(capacity.remainingPercent);
  const observedAt =
    typeof capacity.observedAt === 'string' ? capacity.observedAt : null;
  const nearExhaustion =
    (Number.isFinite(usagePercent) && usagePercent >= 90) ||
    (Number.isFinite(remainingPercent) && remainingPercent <= 10);
  return {
    readable:
      Number.isFinite(usagePercent) || Number.isFinite(remainingPercent),
    usagePercent: Number.isFinite(usagePercent) ? usagePercent : null,
    remainingPercent: Number.isFinite(remainingPercent)
      ? remainingPercent
      : null,
    observedAt,
    alert: nearExhaustion ? 'multi-account-routing-required' : null,
  };
}

export function selectOfficialRoute({
  issue,
  previous = null,
  capacity = null,
}) {
  const previousAttempt = Number(previous?.attempt || 0);
  const classification = classifyOfficialRoute(issue, {
    attempt: previousAttempt + 1,
  });
  const selected = ROUTES[classification.routeClass];
  const floor =
    previous?.model in MODEL_RANK && previous?.reasoningEffort in EFFORT_RANK
      ? {
          model: previous.model,
          reasoningEffort: previous.reasoningEffort,
        }
      : null;
  const route = strongerRoute(floor, selected);
  return {
    schema: OFFICIAL_ROUTE_SCHEMA,
    issue: issue.identifier,
    model: route.model,
    reasoningEffort: route.reasoningEffort,
    attempt: classification.attempt,
    classification,
    preventedDowngrade:
      Boolean(floor) &&
      (route.model !== selected.model ||
        route.reasoningEffort !== selected.reasoningEffort),
    capacity: capacityEvidence(capacity),
    generatedAt: new Date().toISOString(),
  };
}

export function readOfficialRoute(workspace) {
  try {
    const route = JSON.parse(
      readFileSync(join(workspace, OFFICIAL_ROUTE_FILE), 'utf8')
    );
    if (
      route?.schema !== OFFICIAL_ROUTE_SCHEMA ||
      !(route.model in MODEL_RANK) ||
      !(route.reasoningEffort in EFFORT_RANK)
    )
      return null;
    return route;
  } catch {
    return null;
  }
}

export function writeOfficialRoute(workspace, route) {
  mkdirSync(workspace, { recursive: true });
  const target = join(workspace, OFFICIAL_ROUTE_FILE);
  const temporary = `${target}.${process.pid}.tmp`;
  writeFileSync(temporary, `${JSON.stringify(route, null, 2)}\n`, {
    mode: 0o600,
  });
  renameSync(temporary, target);
  return target;
}

function routeStateRoot() {
  return resolve(
    process.env.SYMPHONY_ROUTE_STATE_ROOT ||
      join(homedir(), '.local/state/jovie-symphony/routes')
  );
}

function readStateRoute(identifier) {
  return readOfficialRoute(routeStateRootForIssue(identifier));
}

function routeStateRootForIssue(identifier) {
  return join(routeStateRoot(), identifier);
}

function writeStateRoute(identifier, route) {
  return writeOfficialRoute(routeStateRootForIssue(identifier), route);
}

function readJson(path) {
  if (!path) return null;
  try {
    return JSON.parse(readFileSync(path, 'utf8'));
  } catch {
    return null;
  }
}

function flag(argv, name) {
  const index = argv.indexOf(name);
  return index >= 0 ? argv[index + 1] : undefined;
}

async function fetchLinearIssue(identifier) {
  const apiKey = process.env.LINEAR_API_KEY;
  if (!apiKey) throw new Error('LINEAR_API_KEY is unavailable to before_run');
  const match = /^([A-Za-z][A-Za-z0-9]*)-(\d+)$/.exec(identifier);
  if (!match) throw new Error(`invalid Linear issue identifier: ${identifier}`);
  const response = await fetch('https://api.linear.app/graphql', {
    method: 'POST',
    headers: {
      Authorization: apiKey,
      'Content-Type': 'application/json',
      'User-Agent': 'jovie-official-symphony-route/1',
    },
    body: JSON.stringify({
      query: `query($teamKey: String!, $number: Float!) {
        issues(filter: { team: { key: { eq: $teamKey } }, number: { eq: $number } }, first: 1) {
          nodes { identifier title description labels { nodes { name } } }
        }
      }`,
      variables: {
        teamKey: match[1].toUpperCase(),
        number: Number(match[2]),
      },
    }),
    signal: AbortSignal.timeout(10_000),
  });
  if (!response.ok)
    throw new Error(`Linear route lookup failed: HTTP ${response.status}`);
  const payload = await response.json();
  if (Array.isArray(payload?.errors) && payload.errors.length)
    throw new Error('Linear route lookup returned GraphQL errors');
  return payload?.data?.issues?.nodes?.[0] || null;
}

async function prepare(argv) {
  const workspace = resolve(flag(argv, '--workspace') || process.cwd());
  const identifier = flag(argv, '--issue') || basename(workspace);
  const issueFile = flag(argv, '--issue-file');
  const issue = issueFile
    ? readJson(issueFile)
    : await fetchLinearIssue(identifier);
  if (!issue || issue.identifier !== identifier)
    throw new Error(`issue unavailable or mismatched: ${identifier}`);
  // The durable floor lives outside the agent sandbox. The workspace copy is
  // for readback only and cannot lower a later route if an agent edits it.
  const previous = readStateRoute(identifier);
  const capacity = readJson(
    process.env.SYMPHONY_CODEX_CAPACITY_FILE || flag(argv, '--capacity-file')
  );
  const route = selectOfficialRoute({ issue, previous, capacity });
  writeStateRoute(identifier, route);
  writeOfficialRoute(workspace, route);
  process.stdout.write(`${JSON.stringify(route)}\n`);
}

function launch(argv) {
  const workspace = resolve(flag(argv, '--workspace') || process.cwd());
  const route = readOfficialRoute(workspace);
  if (!route) throw new Error('validated official route receipt is missing');
  if (route.capacity?.alert === 'multi-account-routing-required')
    process.stderr.write(
      `SYMPHONY_CAPACITY_ALERT ${route.capacity.alert} issue=${route.issue}\n`
    );
  process.stdout.write(`${route.model}\t${route.reasoningEffort}\n`);
}

if (
  process.argv[1] &&
  import.meta.url === `file://${resolve(process.argv[1])}`
) {
  const [command, ...argv] = process.argv.slice(2);
  try {
    if (command === 'prepare') await prepare(argv);
    else if (command === 'launch') launch(argv);
    else throw new Error('usage: symphony-official-route.mjs prepare|launch');
  } catch (error) {
    process.stderr.write(
      `SYMPHONY_OFFICIAL_ROUTE_FAILURE retryable=false reason=${JSON.stringify(error.message)}\n`
    );
    process.exit(78);
  }
}
