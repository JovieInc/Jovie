#!/usr/bin/env node

import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import {
  buildNativeQueuePolicyReadback,
  isPendingNativeCohortCutoverField,
  mergeNativeQueuePolicyObservations,
  NATIVE_QUEUE_POLICY,
} from './lib/merge-queue-guard.mjs';

// The live repository variable and active ruleset both use GitHub native.
// Keep bare read-only/local callers aligned with that canon; mutations still
// require the dedicated native authorization below.
export const DEFAULT_MERGE_QUEUE_BACKEND = 'native';
export const MERGE_QUEUE_BACKENDS = Object.freeze(['native']);
export const CANONICAL_NATIVE_MUTATION_ACTOR = 'jovie-bot[bot]';

const DEFAULT_REPOSITORY = 'JovieInc/Jovie';
const DEFAULT_RULESET_ID = '10512119';
const DEFAULT_BASE_BRANCH = 'main';
const DEFAULT_ENROLLMENT_POSTCONDITION_ATTEMPTS = 6;
const DEFAULT_ENROLLMENT_POSTCONDITION_DELAY_MS = 2_000;
const CI_WORKFLOW_PATH = '.github/workflows/ci.yml';
const NATIVE_MUTATION_AUTHORIZATIONS = new Set([
  'merge-queue-autoenroll',
  'test-fixture',
]);
const REQUIRED_CHECKS = Object.freeze([
  'PR Ready',
  'Migration Guard',
  'Fork PR Gate',
  'PR Size Guard',
]);
const NATIVE_QUEUE_ENTRY_STATES = new Set([
  'QUEUED',
  'AWAITING_CHECKS',
  'MERGEABLE',
  'UNMERGEABLE',
  'LOCKED',
]);

const PULL_REQUEST_STATE_FIELDS = `id number state isDraft headRefOid labels(first:100){nodes{name}} isInMergeQueue mergeQueueEntry { id state position } autoMergeRequest { enabledAt }`;
const REQUIRED_NATIVE_STATE_FIELDS =
  `id number state isDraft headRefOid labels isInMergeQueue mergeQueueEntry autoMergeRequest`.split(
    ' '
  );
// Durable tombstones. Unlike queue-deferred, these are never stripped by the
// drain controller, including hold-intake missed-admission recovery (JOV-5276).
export const NO_AUTO_HOLD_LABELS = Object.freeze([
  'no-auto',
  'no-auto-merge',
  'no-automerge',
]);
export const HARD_HOLD_LABELS = new Set([
  'needs-human',
  'hold',
  'gated',
  'queue-deferred',
  'needs-conflict-resolution',
  'fast',
  ...NO_AUTO_HOLD_LABELS,
]);
export const SELECTOR_BLOCKING_LABELS = new Set([
  'needs-human',
  'hold',
  'gated',
  'needs-conflict-resolution',
  'fast',
  ...NO_AUTO_HOLD_LABELS,
]);
const CLEAN_ADMITTING_PROMOTION_MODES = new Set([
  'normal',
  'hold-intake',
  'draft-only',
]);
const PULL_REQUEST_STATE_QUERY = `query MergeQueuePullRequestState($owner:String!,$name:String!,$number:Int!){repository(owner:$owner,name:$name){pullRequest(number:$number){${PULL_REQUEST_STATE_FIELDS}}}}`;
const OPEN_PULL_REQUEST_STATES_QUERY = `query MergeQueueOpenPullRequestStates($owner:String!,$name:String!,$endCursor:String){repository(owner:$owner,name:$name){pullRequests(first:100,after:$endCursor,states:OPEN){nodes{${PULL_REQUEST_STATE_FIELDS}} pageInfo{hasNextPage endCursor}}}}`;
const BRANCH_PROTECTION_QUERY = `query MergeQueueBranchProtection($owner:String!,$name:String!,$refName:String!){repository(owner:$owner,name:$name){ref(qualifiedName:$refName){name branchProtectionRule{id}}}}`;
const LIVE_QUEUE_CONFIGURATION_QUERY = `query MergeQueueLiveConfiguration($owner:String!,$name:String!,$branch:String!){repository(owner:$owner,name:$name){mergeQueue(branch:$branch){configuration{checkResponseTimeout maximumEntriesToBuild maximumEntriesToMerge mergeMethod minimumEntriesToMerge minimumEntriesToMergeWaitTime}}}}`;
const NATIVE_MUTATION_ACTOR_QUERY =
  'query MergeQueueNativeMutationActor { viewer { login } }';
const DEQUEUE_PULL_REQUEST_MUTATION = `mutation DequeuePullRequest($id:ID!){dequeuePullRequest(input:{id:$id}){mergeQueueEntry{id}}}`;
const ENABLE_AUTO_MERGE_MUTATION = `mutation EnablePullRequestAutoMerge($pullRequestId:ID!,$mergeMethod:PullRequestMergeMethod!){enablePullRequestAutoMerge(input:{pullRequestId:$pullRequestId,mergeMethod:$mergeMethod}){pullRequest{id}}}`;
const DISABLE_AUTO_MERGE_MUTATION = `mutation DisablePullRequestAutoMerge($pullRequestId:ID!){disablePullRequestAutoMerge(input:{pullRequestId:$pullRequestId}){pullRequest{id}}}`;

function backendError(code, message, details = {}) {
  return Object.assign(new Error(message), {
    name: 'MergeQueueBackendError',
    code,
    details,
  });
}

export function resolveMergeQueueBackend(value) {
  const candidate = value ?? DEFAULT_MERGE_QUEUE_BACKEND;
  if (!MERGE_QUEUE_BACKENDS.includes(candidate)) {
    throw backendError(
      'unknown_backend',
      `MERGE_QUEUE_BACKEND must be one of ${MERGE_QUEUE_BACKENDS.join(', ')}; received ${JSON.stringify(candidate)}`
    );
  }
  return candidate;
}

function requireNativeBackend(value) {
  return resolveMergeQueueBackend(value);
}

function parseRepositorySlug(repository) {
  if (!/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(repository)) {
    throw backendError(
      'invalid_repository',
      `Repository must be OWNER/REPO; received ${JSON.stringify(repository)}`
    );
  }
  const [owner, name] = repository.split('/');
  return { owner, name };
}

function parsePullRequestNumber(value) {
  const number = Number.parseInt(String(value), 10);
  if (
    !Number.isSafeInteger(number) ||
    number < 1 ||
    String(number) !== String(value)
  ) {
    throw backendError(
      'invalid_pull_request',
      `Pull request number must be a positive integer; received ${JSON.stringify(value)}`
    );
  }
  return number;
}

function parseExpectedHeadOid(value) {
  if (typeof value !== 'string' || !/^[0-9a-f]{40}$/i.test(value)) {
    throw backendError(
      'invalid_expected_head',
      'Expected head SHA must be a 40-character hexadecimal commit OID'
    );
  }
  return value.toLowerCase();
}

async function runGh(runner, args, description) {
  const result = await runner(args);
  if (!result || typeof result !== 'object') {
    throw backendError(
      'invalid_runner_result',
      'Command runner returned no result'
    );
  }
  const code = result?.code ?? result?.exitCode ?? 0;
  if (code !== 0) {
    throw backendError(
      'gh_command_failed',
      `${description} failed with exit code ${code}`,
      { stderr: String(result?.stderr ?? '').trim() }
    );
  }
  return String(result?.stdout ?? result ?? '');
}

async function runGhJson(runner, args, description) {
  const stdout = await runGh(runner, args, description);
  try {
    return JSON.parse(stdout);
  } catch (error) {
    throw backendError(
      'invalid_github_response',
      `${description} returned invalid JSON`,
      { cause: error instanceof Error ? error.message : String(error) }
    );
  }
}

function graphqlArgs(query, variables, { paginate = false, typed = [] } = {}) {
  const args = ['api', 'graphql'];
  if (paginate) args.push('--paginate', '--slurp');
  args.push('-f', `query=${query}`);
  for (const [name, value] of Object.entries(variables)) {
    args.push(typed.includes(name) ? '-F' : '-f', `${name}=${value}`);
  }
  return args;
}

function errorEvidence(error) {
  const candidate =
    typeof error === 'object' && error !== null ? error : undefined;
  return {
    code:
      typeof candidate?.code === 'string' ? candidate.code : 'unknown_error',
    message: error instanceof Error ? error.message : String(error),
    details:
      typeof candidate?.details === 'object' && candidate.details !== null
        ? candidate.details
        : {},
  };
}

function errorSummary(error) {
  const evidence = errorEvidence(error);
  const stderr =
    typeof evidence.details.stderr === 'string'
      ? evidence.details.stderr.trim()
      : '';
  return stderr ? `${evidence.message}: ${stderr}` : evidence.message;
}

const sleep = milliseconds =>
  new Promise(resolve => setTimeout(resolve, milliseconds));

export function createGhRunner({ env = process.env, spawn = spawnSync } = {}) {
  return async args => {
    const result = spawn('gh', args, {
      encoding: 'utf8',
      env: {
        ...env,
        FORCE_COLOR: '0',
        GH_FORCE_TTY: '0',
        NO_COLOR: '1',
      },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    if (result.error) {
      throw result.error;
    }
    return {
      code: result.status ?? 1,
      stdout: result.stdout ?? '',
      stderr: result.stderr ?? '',
    };
  };
}

function normalizeRequiredCheckName(context) {
  const name = typeof context === 'string' ? context.trim() : '';
  return name.startsWith('CI / ') ? name.slice('CI / '.length) : name;
}

function requiredCheckContexts(ruleset) {
  const rule = ruleset?.rules?.find(
    entry => entry?.type === 'required_status_checks'
  );
  const parameters = rule?.parameters;
  const checks = Array.isArray(parameters)
    ? parameters
    : parameters?.required_status_checks;
  if (!Array.isArray(checks)) return [];
  return checks
    .map(check => normalizeRequiredCheckName(check?.context))
    .filter(Boolean);
}

function hasMergeGroupChecksRequested(workflowYaml) {
  const block = workflowYaml.match(
    /^  merge_group:\s*(?:#.*)?\n((?:^ {4,}.*(?:\n|$))*)/m
  );
  return Boolean(
    block &&
      /^ {4}types:\s*\[[^\]]*\bchecks_requested\b[^\]]*\]/m.test(block[1])
  );
}

/**
 * Validate live GitHub ruleset, repository, and workflow evidence for native
 * merge-queue enrollment.
 *
 * @param {{
 *   ruleset?: object | null,
 *   repository?: object | null,
 *   workflowYaml?: string | null,
 *   branchProtectionRef?: object | null,
 *   liveQueueConfiguration?: object | null,
 *   rulesetId?: string,
 *   baseBranch?: string,
 *   allowUnavailableBypassActors?: boolean,
 * }} [input]
 */
export function validateNativePreflightEvidence({
  ruleset,
  repository,
  workflowYaml,
  branchProtectionRef,
  liveQueueConfiguration = null,
  rulesetId = DEFAULT_RULESET_ID,
  baseBranch = DEFAULT_BASE_BRANCH,
  allowUnavailableBypassActors = false,
} = {}) {
  const errors = [];
  const mergeQueueRule = ruleset?.rules?.find(
    rule => rule?.type === 'merge_queue'
  );
  const mergeQueue = mergeNativeQueuePolicyObservations(
    mergeQueueRule?.parameters,
    liveQueueConfiguration
  );
  const requiredChecks = requiredCheckContexts(ruleset);
  const includedRefs = ruleset?.conditions?.ref_name?.include;
  const workflowHasMergeGroup = hasMergeGroupChecksRequested(
    workflowYaml ?? ''
  );
  const missingChecks = REQUIRED_CHECKS.filter(
    check => !requiredChecks.includes(check)
  );
  const bypassActors = ruleset?.bypass_actors;
  const hasValidBypassActors = Array.isArray(bypassActors);
  const bypassActorsVisible = bypassActors !== undefined;
  const unavailableBypassActorsAllowed =
    allowUnavailableBypassActors === true && !bypassActorsVisible;
  const hasBranchProtectionRef =
    typeof branchProtectionRef === 'object' &&
    branchProtectionRef !== null &&
    !Array.isArray(branchProtectionRef);
  const hasBranchProtectionRuleField =
    hasBranchProtectionRef &&
    Object.hasOwn(branchProtectionRef, 'branchProtectionRule');
  const branchProtectionRule = hasBranchProtectionRuleField
    ? branchProtectionRef.branchProtectionRule
    : undefined;
  const hasBranchProtectionRuleShape =
    branchProtectionRule === null ||
    (typeof branchProtectionRule === 'object' &&
      !Array.isArray(branchProtectionRule) &&
      typeof branchProtectionRule.id === 'string' &&
      branchProtectionRule.id.length > 0);
  const hasExactBranchProtectionEvidence =
    hasBranchProtectionRef &&
    branchProtectionRef.name === baseBranch &&
    hasBranchProtectionRuleField &&
    hasBranchProtectionRuleShape;
  const classicRuleId =
    typeof branchProtectionRule?.id === 'string'
      ? branchProtectionRule.id
      : 'unknown';
  const validations = {
    [`ruleset id must be ${rulesetId}`]:
      String(ruleset?.id ?? '') === String(rulesetId),
    'ruleset enforcement must be active': ruleset?.enforcement === 'active',
    'ruleset target must be branch': ruleset?.target === 'branch',
    [`ruleset must include refs/heads/${baseBranch}`]:
      Array.isArray(includedRefs) &&
      (includedRefs.includes(`refs/heads/${baseBranch}`) ||
        includedRefs.includes('~DEFAULT_BRANCH')),
    'ruleset must contain an active merge_queue rule': Boolean(mergeQueueRule),
    ...Object.fromEntries(
      Object.entries(NATIVE_QUEUE_POLICY).map(([field, expected]) => [
        `merge_queue ${field} must be ${expected}`,
        mergeQueue[field] === expected ||
          isPendingNativeCohortCutoverField(field),
      ])
    ),
    [`ruleset is missing required checks: ${missingChecks.join(', ')}`]:
      missingChecks.length === 0,
    'source required checks must be loose; merge_group validates latest main':
      ruleset?.rules?.find(rule => rule?.type === 'required_status_checks')
        ?.parameters?.strict_required_status_checks_policy === false,
    'ruleset bypass_actors must be an array':
      hasValidBypassActors || unavailableBypassActorsAllowed,
    'ruleset bypass_actors must be empty before native enrollment':
      !hasValidBypassActors || bypassActors.length === 0,
    [`repository default branch must be ${baseBranch}`]:
      repository?.default_branch === baseBranch,
    'repository auto-merge must be enabled':
      repository?.allow_auto_merge === true,
    'repository squash merge must be enabled':
      repository?.allow_squash_merge === true,
    'CI workflow must handle merge_group checks_requested':
      workflowHasMergeGroup,
    [`classic branch protection evidence must include exact refs/heads/${baseBranch} branchProtectionRule`]:
      hasExactBranchProtectionEvidence,
    [`classic branch protection for refs/heads/${baseBranch} must be absent; found rule ${classicRuleId}, which creates dual control planes with native ruleset ${rulesetId}`]:
      !hasBranchProtectionRuleField || branchProtectionRule === null,
  };
  for (const [message, condition] of Object.entries(validations)) {
    if (!condition) errors.push(message);
  }
  const policyReadback = buildNativeQueuePolicyReadback(mergeQueue);
  const blockingDrift = policyReadback.drift.filter(
    field => !isPendingNativeCohortCutoverField(field)
  );
  if (blockingDrift.length > 0) {
    errors.push(
      `native queue policy readback drifted: ${blockingDrift.join(', ')}`
    );
  }
  return {
    ok: errors.length === 0,
    errors,
    policyReadback,
    evidence: {
      baseBranch,
      mergeMethod: mergeQueue.merge_method ?? null,
      requiredChecks,
      rulesetId: ruleset?.id ?? null,
      workflowHasMergeGroup,
      bypassActorsVisible,
      policyReadback,
    },
  };
}

export async function preflightMergeQueue({
  backend,
  repository = DEFAULT_REPOSITORY,
  rulesetId = DEFAULT_RULESET_ID,
  baseBranch = DEFAULT_BASE_BRANCH,
  allowUnavailableBypassActors = false,
  runner = createGhRunner(),
} = {}) {
  const resolvedBackend = requireNativeBackend(backend);

  const { owner, name } = parseRepositorySlug(repository);
  const ruleset = await runGhJson(
    runner,
    ['api', `repos/${repository}/rulesets/${rulesetId}`],
    'reading the live merge-queue ruleset'
  );
  const repositoryEvidence = await runGhJson(
    runner,
    ['api', `repos/${repository}`],
    'reading live repository merge settings'
  );
  const workflowYaml = await runGh(
    runner,
    [
      'api',
      '-H',
      'Accept: application/vnd.github.raw+json',
      `repos/${repository}/contents/${CI_WORKFLOW_PATH}?ref=${encodeURIComponent(baseBranch)}`,
    ],
    'reading the live CI workflow'
  );
  const branchProtectionPayload = assertGraphqlResponse(
    await runGhJson(
      runner,
      graphqlArgs(BRANCH_PROTECTION_QUERY, {
        owner,
        name,
        refName: `refs/heads/${baseBranch}`,
      }),
      'checking for redundant classic branch protection'
    ),
    'checking for redundant classic branch protection'
  );
  const branchProtectionRef = branchProtectionPayload?.data?.repository?.ref;
  const liveQueuePayload = assertGraphqlResponse(
    await runGhJson(
      runner,
      graphqlArgs(LIVE_QUEUE_CONFIGURATION_QUERY, {
        owner,
        name,
        branch: baseBranch,
      }),
      'reading the live GraphQL merge-queue configuration'
    ),
    'reading the live GraphQL merge-queue configuration'
  );
  const liveQueueConfiguration =
    liveQueuePayload?.data?.repository?.mergeQueue?.configuration ?? null;
  const validation = validateNativePreflightEvidence({
    ruleset,
    repository: repositoryEvidence,
    workflowYaml,
    branchProtectionRef,
    liveQueueConfiguration,
    rulesetId,
    baseBranch,
    allowUnavailableBypassActors,
  });
  if (!validation.ok) {
    throw backendError(
      'native_preflight_failed',
      `Native merge-queue preflight failed: ${validation.errors.join('; ')}`,
      { errors: validation.errors }
    );
  }
  return {
    backend: resolvedBackend,
    ready: true,
    policyReadback: validation.policyReadback,
    ...validation.evidence,
  };
}

function assertGraphqlResponse(payload, description) {
  if (Array.isArray(payload?.errors) && payload.errors.length > 0) {
    throw backendError(
      'github_graphql_error',
      `${description} returned GraphQL errors`,
      {
        errors: payload.errors.map(error => error?.message ?? String(error)),
      }
    );
  }
  return payload;
}

async function assertCanonicalNativeMutationActor(runner) {
  const description = 'verifying the native queue mutation actor';
  const payload = assertGraphqlResponse(
    await runGhJson(
      runner,
      graphqlArgs(NATIVE_MUTATION_ACTOR_QUERY, {}),
      description
    ),
    description
  );
  const observedActor = payload?.data?.viewer?.login;
  if (observedActor !== CANONICAL_NATIVE_MUTATION_ACTOR) {
    throw backendError(
      'native_mutation_actor_unauthorized',
      `Native queue mutation requires authenticated actor ${CANONICAL_NATIVE_MUTATION_ACTOR}; observed ${JSON.stringify(observedActor ?? null)}`,
      {
        expectedActor: CANONICAL_NATIVE_MUTATION_ACTOR,
        observedActor: typeof observedActor === 'string' ? observedActor : null,
      }
    );
  }
  return observedActor;
}

function normalizeNativePullRequest(pr) {
  const missing = REQUIRED_NATIVE_STATE_FIELDS.filter(
    field => !Object.hasOwn(pr ?? {}, field)
  );
  if (missing.length > 0 || typeof pr?.isInMergeQueue !== 'boolean') {
    throw backendError(
      'incomplete_queue_state',
      `Native queue state is incomplete: ${missing.join(', ') || 'isInMergeQueue'}`
    );
  }
  if (!Array.isArray(pr.labels?.nodes)) {
    throw backendError(
      'incomplete_queue_state',
      'Native queue state is missing authoritative labels'
    );
  }
  if (
    pr.mergeQueueEntry !== null &&
    (typeof pr.mergeQueueEntry?.id !== 'string' ||
      !NATIVE_QUEUE_ENTRY_STATES.has(pr.mergeQueueEntry?.state) ||
      !Number.isInteger(pr.mergeQueueEntry?.position) ||
      pr.mergeQueueEntry.position < 1)
  ) {
    throw backendError(
      'incomplete_queue_state',
      'Native mergeQueueEntry is missing its id, recognized state, or positive position'
    );
  }
  const hasAuthoritativeQueueEntry = Boolean(
    pr.isInMergeQueue === true && pr.mergeQueueEntry !== null
  );
  return {
    ...pr,
    backend: 'native',
    autoMergeEnabled: pr.autoMergeRequest !== null,
    queued: hasAuthoritativeQueueEntry,
  };
}

async function readNativePullRequestState({ runner, repository, number }) {
  const { owner, name } = parseRepositorySlug(repository);
  const description = `reading native queue state for PR #${number}`;
  const payload = assertGraphqlResponse(
    await runGhJson(
      runner,
      graphqlArgs(
        PULL_REQUEST_STATE_QUERY,
        { owner, name, number },
        { typed: ['number'] }
      ),
      description
    ),
    description
  );
  const pr = payload?.data?.repository?.pullRequest;
  if (!pr) {
    throw backendError('pull_request_not_found', `PR #${number} was not found`);
  }
  return normalizeNativePullRequest(pr);
}

export async function readPullRequestQueueState({
  backend,
  repository = DEFAULT_REPOSITORY,
  number,
  runner = createGhRunner(),
} = {}) {
  requireNativeBackend(backend);
  const parsedNumber = parsePullRequestNumber(number);
  return readNativePullRequestState({
    runner,
    repository,
    number: parsedNumber,
  });
}

function indexPullRequestStates(states, prs, normalize, missingMessage) {
  if (!Array.isArray(prs)) {
    throw backendError('incomplete_queue_state', missingMessage);
  }
  for (const pr of prs) {
    const state = normalize(pr);
    states[String(state.number)] = state;
  }
  return states;
}

export async function listPullRequestQueueStates({
  backend,
  repository = DEFAULT_REPOSITORY,
  runner = createGhRunner(),
} = {}) {
  requireNativeBackend(backend);
  const states = {};
  const { owner, name } = parseRepositorySlug(repository);
  const pages = await runGhJson(
    runner,
    graphqlArgs(
      OPEN_PULL_REQUEST_STATES_QUERY,
      { owner, name },
      { paginate: true }
    ),
    'listing native queue state'
  );
  if (!Array.isArray(pages)) {
    throw backendError(
      'incomplete_queue_state',
      'Native queue page list is not an array'
    );
  }
  for (const page of pages) {
    assertGraphqlResponse(page, 'listing native queue state');
    indexPullRequestStates(
      states,
      page?.data?.repository?.pullRequests?.nodes,
      normalizeNativePullRequest,
      'Native queue page has no PR nodes'
    );
  }
  return states;
}

/**
 * Authoritative GitHub-native membership for one exact PR head.
 * Auto-merge intent (`autoMergeRequest`) is never treated as a queue receipt.
 *
 * @param {object | null | undefined} state
 * @param {string} expectedHeadOid
 */
export function hasAuthoritativeExactHeadQueueReceipt(state, expectedHeadOid) {
  const expected =
    typeof expectedHeadOid === 'string' ? expectedHeadOid.toLowerCase() : '';
  const head =
    typeof state?.headRefOid === 'string' ? state.headRefOid.toLowerCase() : '';
  return Boolean(
    /^[0-9a-f]{40}$/.test(expected) &&
      state?.state === 'OPEN' &&
      state?.isDraft === false &&
      head === expected &&
      state?.isInMergeQueue === true &&
      state?.mergeQueueEntry != null &&
      typeof state.mergeQueueEntry.id === 'string' &&
      NATIVE_QUEUE_ENTRY_STATES.has(state.mergeQueueEntry.state) &&
      Number.isInteger(state.mergeQueueEntry.position) &&
      state.mergeQueueEntry.position > 0
  );
}

export function hardHoldLabels(state) {
  const nodes = Array.isArray(state?.labels?.nodes) ? state.labels.nodes : [];
  return [
    ...new Set(
      nodes
        .map(label => (typeof label?.name === 'string' ? label.name : null))
        .filter(name => HARD_HOLD_LABELS.has(name))
    ),
  ];
}

export function canAcceptExactHeadQueueReceipt(state, expectedHeadOid) {
  return (
    hasAuthoritativeExactHeadQueueReceipt(state, expectedHeadOid) &&
    hardHoldLabels(state).length === 0
  );
}

export function enrollmentPostcondition(state, expectedHeadOid) {
  return canAcceptExactHeadQueueReceipt(state, expectedHeadOid);
}

/**
 * Deterministic reason a native exact-head read is not an authoritative receipt.
 *
 * @param {object | null | undefined} state
 * @param {string} expectedHeadOid
 */
export function explainExactHeadQueueReceipt(state, expectedHeadOid) {
  const held = hardHoldLabels(state);
  if (canAcceptExactHeadQueueReceipt(state, expectedHeadOid)) {
    return { ok: true, reason: 'queued' };
  }
  const expected =
    typeof expectedHeadOid === 'string' ? expectedHeadOid.toLowerCase() : '';
  const parts = [];
  if (!state || typeof state !== 'object') {
    return { ok: false, reason: 'missing-state' };
  }
  const head =
    typeof state.headRefOid === 'string' ? state.headRefOid.toLowerCase() : '';
  if (head !== expected) {
    parts.push(`head=${state.headRefOid ?? 'missing'}`);
  }
  if (state.isInMergeQueue !== true) {
    parts.push('isInMergeQueue=false');
  }
  if (state.mergeQueueEntry == null) {
    parts.push('mergeQueueEntry=null');
  } else {
    if (typeof state.mergeQueueEntry.id !== 'string') {
      parts.push('mergeQueueEntry.id=missing');
    }
    if (!NATIVE_QUEUE_ENTRY_STATES.has(state.mergeQueueEntry.state)) {
      parts.push(
        `mergeQueueEntry.state=${state.mergeQueueEntry.state ?? 'missing'}`
      );
    }
    if (
      !Number.isInteger(state.mergeQueueEntry.position) ||
      state.mergeQueueEntry.position < 1
    ) {
      parts.push(
        `mergeQueueEntry.position=${String(state.mergeQueueEntry.position ?? 'missing')}`
      );
    }
  }
  if (state.autoMergeRequest != null) {
    parts.push(
      'autoMergeRequest=present (auto-merge intent is not membership)'
    );
  }
  if (held.length > 0) {
    parts.push(`held-by=${held.join(',')}`);
  }
  return {
    ok: false,
    reason: parts.join(' ') || 'missing-receipt',
  };
}

/**
 * Classify why the drain enroll selector would skip one exact PR/head.
 * `q` must already be authoritative native membership, never auto-merge intent.
 *
 * @param {{
 *   snapshot?: object[],
 *   admissionPr?: string | number,
 *   admissionHead?: string,
 *   promotionMode?: string,
 *   enrollSlots?: number,
 * }} [input]
 */
export function explainExactHeadAdmissionSelector({
  snapshot,
  admissionPr,
  admissionHead,
  promotionMode,
  enrollSlots,
} = {}) {
  if (!Array.isArray(snapshot)) {
    throw backendError(
      'invalid_snapshot',
      'Admission snapshot must be an array'
    );
  }
  const pr = String(admissionPr ?? '');
  const head =
    typeof admissionHead === 'string' ? admissionHead.toLowerCase() : '';
  const row = snapshot.find(
    item =>
      String(item?.n) === pr &&
      typeof item?.headOid === 'string' &&
      item.headOid.toLowerCase() === head
  );
  if (!row) {
    return {
      observed: false,
      queued: false,
      eligible: false,
      reason: 'not-observed',
    };
  }
  if (row.q === true) {
    return {
      observed: true,
      queued: true,
      eligible: false,
      reason: 'already-queued',
    };
  }
  const reasons = [];
  const mode = typeof promotionMode === 'string' ? promotionMode : '';
  const modeAllows =
    CLEAN_ADMITTING_PROMOTION_MODES.has(mode) ||
    (mode === 'isolated-only' && row.iso === true);
  if (!modeAllows) {
    reasons.push(`promotion-mode=${mode || 'missing'}`);
  }
  if (row.draft === true) reasons.push('draft');
  if (row.base !== 'main') reasons.push(`base=${row.base ?? 'missing'}`);
  if (row.m !== 'MERGEABLE') {
    reasons.push(`mergeable=${row.m ?? 'missing'}`);
  }
  const fails = Array.isArray(row.fail)
    ? row.fail.filter(value => typeof value === 'string' && value.length > 0)
    : [];
  if (fails.length > 0) {
    reasons.push(`failing-checks=${fails.join(',')}`);
  }
  const labels = Array.isArray(row.L)
    ? row.L.filter(value => typeof value === 'string')
    : [];
  const held = labels.filter(name => SELECTOR_BLOCKING_LABELS.has(name));
  if (held.length > 0) reasons.push(`held-by=${held.join(',')}`);
  const slots = Number(enrollSlots);
  if (!Number.isInteger(slots) || slots <= 0) {
    reasons.push('queue-depth-cap');
  }
  if (reasons.length > 0) {
    return {
      observed: true,
      queued: false,
      eligible: false,
      reason: reasons.join('; '),
    };
  }
  return {
    observed: true,
    queued: false,
    eligible: true,
    reason: 'eligible',
  };
}

function readStdinJson() {
  try {
    return JSON.parse(readFileSync(0, 'utf8'));
  } catch (error) {
    throw backendError(
      'invalid_snapshot',
      'Admission snapshot stdin must be JSON',
      { cause: error instanceof Error ? error.message : String(error) }
    );
  }
}

/**
 * Read-only poll for a persisted exact-head native queue receipt.
 * Does not enable auto-merge or treat auto-merge intent as membership.
 *
 * @param {{
 *   backend?: string,
 *   repository?: string,
 *   number?: string | number,
 *   expectedHeadOid?: string,
 *   runner?: (args: any) => Promise<{ code: number, stdout: string, stderr: string }>,
 *   postconditionAttempts?: number,
 *   postconditionDelayMs?: number,
 *   wait?: (milliseconds: number) => Promise<void>,
 * }} [input]
 */
export async function proveExactHeadQueueReceipt({
  backend,
  repository = DEFAULT_REPOSITORY,
  number,
  expectedHeadOid,
  runner = createGhRunner(),
  postconditionAttempts = DEFAULT_ENROLLMENT_POSTCONDITION_ATTEMPTS,
  postconditionDelayMs = DEFAULT_ENROLLMENT_POSTCONDITION_DELAY_MS,
  wait = sleep,
} = {}) {
  requireNativeBackend(backend);
  const parsedNumber = parsePullRequestNumber(number);
  const expectedHead = parseExpectedHeadOid(expectedHeadOid);
  const attempts = Number(postconditionAttempts);
  const delayMs = Number(postconditionDelayMs);
  if (!Number.isInteger(attempts) || attempts < 1) {
    throw backendError(
      'invalid_postcondition_attempts',
      'Receipt proof attempts must be a positive integer'
    );
  }
  if (!Number.isInteger(delayMs) || delayMs < 0) {
    throw backendError(
      'invalid_postcondition_delay',
      'Receipt proof delay must be a non-negative integer'
    );
  }
  const stateOptions = {
    backend: 'native',
    repository,
    number: parsedNumber,
    runner,
  };
  let state;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    state = await readPullRequestQueueState(stateOptions);
    if (canAcceptExactHeadQueueReceipt(state, expectedHead)) {
      return {
        ok: true,
        attempts: attempt,
        state,
        explanation: explainExactHeadQueueReceipt(state, expectedHead),
      };
    }
    if (
      hasAuthoritativeExactHeadQueueReceipt(state, expectedHead) &&
      hardHoldLabels(state).length > 0
    ) {
      return {
        ok: false,
        attempts: attempt,
        state,
        explanation: explainExactHeadQueueReceipt(state, expectedHead),
      };
    }
    const head =
      typeof state.headRefOid === 'string'
        ? state.headRefOid.toLowerCase()
        : '';
    if (head && head !== expectedHead) {
      return {
        ok: false,
        attempts: attempt,
        state,
        explanation: explainExactHeadQueueReceipt(state, expectedHead),
      };
    }
    if (attempt < attempts) await wait(delayMs);
  }
  return {
    ok: false,
    attempts,
    state,
    explanation: explainExactHeadQueueReceipt(state, expectedHead),
  };
}

export function dequeuePostcondition(state) {
  return Boolean(
    state?.backend === 'native' &&
      state.isInMergeQueue === false &&
      state.mergeQueueEntry === null &&
      state.autoMergeRequest === null &&
      state.queued === false
  );
}

function assertEnrollCandidate(state, expectedHeadOid) {
  if (state.state !== 'OPEN' || state.isDraft !== false) {
    throw backendError(
      'ineligible_pull_request',
      `PR #${state.number} must be open and ready for review before enrollment`
    );
  }
  if (state.headRefOid.toLowerCase() !== expectedHeadOid) {
    throw backendError(
      'head_changed',
      `PR #${state.number} head changed from ${expectedHeadOid} to ${state.headRefOid}`
    );
  }
  const heldLabels = state.labels.nodes
    .map(label => label?.name)
    .filter(name => HARD_HOLD_LABELS.has(name));
  if (heldLabels.length > 0) {
    throw backendError(
      'held_pull_request',
      `PR #${state.number} is held by ${heldLabels.join(', ')}`,
      { labels: heldLabels }
    );
  }
}

async function pollEnrollmentPostcondition({
  stateOptions,
  expectedHeadOid,
  attempts,
  delayMs,
  wait,
}) {
  let state;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    state = await readPullRequestQueueState(stateOptions);
    if (enrollmentPostcondition(state, expectedHeadOid)) {
      return { attempts: attempt, state };
    }
    assertEnrollCandidate(state, expectedHeadOid);
    if (attempt < attempts) await wait(delayMs);
  }
  return { attempts, state };
}

export async function enrollPullRequest({
  backend,
  repository = DEFAULT_REPOSITORY,
  rulesetId = DEFAULT_RULESET_ID,
  baseBranch = DEFAULT_BASE_BRANCH,
  allowUnavailableBypassActors = false,
  number,
  expectedHeadOid,
  runner = createGhRunner(),
  mutationRunner = runner,
  postconditionAttempts = DEFAULT_ENROLLMENT_POSTCONDITION_ATTEMPTS,
  postconditionDelayMs = DEFAULT_ENROLLMENT_POSTCONDITION_DELAY_MS,
  wait = sleep,
} = {}) {
  const resolvedBackend = requireNativeBackend(backend);
  const parsedNumber = parsePullRequestNumber(number);
  const expectedHead = parseExpectedHeadOid(expectedHeadOid);
  const mutationActor =
    await assertCanonicalNativeMutationActor(mutationRunner);
  const stateOptions = {
    backend: resolvedBackend,
    repository,
    number: parsedNumber,
    runner,
  };

  await preflightMergeQueue({
    backend: resolvedBackend,
    repository,
    rulesetId,
    baseBranch,
    allowUnavailableBypassActors,
    runner,
  });

  const before = await readPullRequestQueueState(stateOptions);
  assertEnrollCandidate(before, expectedHead);
  if (enrollmentPostcondition(before, expectedHead)) {
    return {
      backend: resolvedBackend,
      changed: false,
      mutationActor,
      state: before,
    };
  }

  let mutationError = null;
  try {
    await runGraphqlMutation(
      mutationRunner,
      ENABLE_AUTO_MERGE_MUTATION,
      { pullRequestId: before.id, mergeMethod: 'SQUASH' },
      `enrolling PR #${parsedNumber} with ${resolvedBackend}`
    );
  } catch (error) {
    mutationError = error;
  }
  const observation = await pollEnrollmentPostcondition({
    stateOptions,
    expectedHeadOid: expectedHead,
    attempts: postconditionAttempts,
    delayMs: postconditionDelayMs,
    wait,
  });
  if (enrollmentPostcondition(observation.state, expectedHead)) {
    return {
      backend: resolvedBackend,
      changed: true,
      mutationActor,
      postconditionAttempts: observation.attempts,
      reconciledAfterCommandError: Boolean(mutationError),
      state: observation.state,
    };
  }
  const mutationErrorDetails = mutationError
    ? errorEvidence(mutationError)
    : null;
  const mutationFailure = mutationError
    ? `; mutation error: ${errorSummary(mutationError)}`
    : '';
  throw backendError(
    'enrollment_postcondition_failed',
    `Could not prove PR #${parsedNumber} is enrolled at ${expectedHead} after ${observation.attempts} authoritative reads${mutationFailure}`,
    {
      mutationError: mutationErrorDetails,
      postconditionAttempts: observation.attempts,
      state: observation.state,
    }
  );
}

async function runGraphqlMutation(runner, query, variables, description) {
  assertGraphqlResponse(
    await runGhJson(runner, graphqlArgs(query, variables), description),
    description
  );
}

export async function dequeuePullRequest({
  backend,
  repository = DEFAULT_REPOSITORY,
  number,
  runner = createGhRunner(),
  mutationRunner = runner,
} = {}) {
  const resolvedBackend = requireNativeBackend(backend);
  const parsedNumber = parsePullRequestNumber(number);
  const mutationActor =
    await assertCanonicalNativeMutationActor(mutationRunner);
  const stateOptions = {
    backend: resolvedBackend,
    repository,
    number: parsedNumber,
    runner,
  };
  const before = await readPullRequestQueueState(stateOptions);
  if (dequeuePostcondition(before)) {
    return {
      backend: resolvedBackend,
      changed: false,
      mutationActor,
      state: before,
    };
  }

  const mutationErrors = [];
  if (before.isInMergeQueue || before.mergeQueueEntry !== null) {
    try {
      // GitHub's DequeuePullRequestInput.id is the PullRequest node ID.
      await runGraphqlMutation(
        mutationRunner,
        DEQUEUE_PULL_REQUEST_MUTATION,
        { id: before.id },
        `dequeuing native PR #${parsedNumber}`
      );
    } catch (error) {
      mutationErrors.push(error);
    }
  }

  let current = await readPullRequestQueueState(stateOptions);
  if (current.autoMergeRequest !== null) {
    try {
      await runGraphqlMutation(
        mutationRunner,
        DISABLE_AUTO_MERGE_MUTATION,
        { pullRequestId: current.id },
        `disabling auto-merge for PR #${parsedNumber}`
      );
    } catch (error) {
      mutationErrors.push(error);
    }
    current = await readPullRequestQueueState(stateOptions);
  }

  if (dequeuePostcondition(current)) {
    return {
      backend: resolvedBackend,
      changed: true,
      mutationActor,
      reconciledAfterCommandError: mutationErrors.length > 0,
      state: current,
    };
  }
  throw backendError(
    'dequeue_postcondition_failed',
    `Could not prove PR #${parsedNumber} is outside the ${resolvedBackend} queue`,
    {
      mutationErrors: mutationErrors.map(error => error.message),
      state: current,
    }
  );
}

/**
 * @param {string[]} argv
 * @param {{
 *   env?: NodeJS.ProcessEnv,
 *   runner?: (args: any) => Promise<{ code: number, stdout: string, stderr: string }>,
 *   mutationRunner?: (args: any) => Promise<{ code: number, stdout: string, stderr: string }>,
 *   write?: (value: any) => unknown,
 * }} [options]
 */
export async function runCli(
  argv,
  {
    env = process.env,
    runner = createGhRunner({ env }),
    mutationRunner,
    write = value => process.stdout.write(`${value}\n`),
  } = {}
) {
  const [command, ...args] = argv;
  // explain-selector classifies a local SNAP JSON document. Fixture dry-runs
  // inherit MERGE_QUEUE_BACKEND=test-label-fixture and must still explain a
  // stale exact-head scope instead of failing closed on backend validation.
  const backend =
    command === 'explain-selector'
      ? DEFAULT_MERGE_QUEUE_BACKEND
      : resolveMergeQueueBackend(
          env.MERGE_QUEUE_BACKEND ?? DEFAULT_MERGE_QUEUE_BACKEND
        );
  const repository = env.REPO ?? env.GITHUB_REPOSITORY ?? DEFAULT_REPOSITORY;
  const rulesetId = env.MERGE_QUEUE_RULESET_ID ?? DEFAULT_RULESET_ID;
  const baseBranch = env.MERGE_QUEUE_BASE_BRANCH ?? DEFAULT_BASE_BRANCH;
  const allowUnavailableBypassActors =
    env.MERGE_QUEUE_NATIVE_AUTHORIZATION === 'merge-queue-autoenroll';
  const resolvedMutationRunner =
    mutationRunner ??
    (typeof env.GH_MUTATION_TOKEN === 'string' &&
    env.GH_MUTATION_TOKEN.length > 0
      ? createGhRunner({
          env: { ...env, GH_TOKEN: env.GH_MUTATION_TOKEN },
        })
      : runner);
  const options = { backend, repository, rulesetId, baseBranch, runner };
  const preflightOptions = { ...options, allowUnavailableBypassActors };
  const commands = {
    preflight: () => preflightMergeQueue(preflightOptions),
    'list-state': () => listPullRequestQueueStates(options),
    'explain-selector': () =>
      explainExactHeadAdmissionSelector({
        snapshot: readStdinJson(),
        admissionPr: args[0],
        admissionHead: args[1],
        promotionMode: args[2],
        enrollSlots: Number.parseInt(String(args[3]), 10),
      }),
    'prove-receipt': () =>
      proveExactHeadQueueReceipt({
        ...options,
        number: args[0],
        expectedHeadOid: args[1],
      }),
    enroll: () =>
      enrollPullRequest({
        ...preflightOptions,
        number: args[0],
        expectedHeadOid: args[1],
        mutationRunner: resolvedMutationRunner,
      }),
    dequeue: () =>
      dequeuePullRequest({
        ...options,
        number: args[0],
        mutationRunner: resolvedMutationRunner,
      }),
  };
  const usage = {
    preflight: [0, 'preflight takes no arguments'],
    'list-state': [0, 'list-state takes no arguments'],
    'explain-selector': [
      4,
      'explain-selector requires <number> <headSha> <promotionMode> <enrollSlots>',
    ],
    'prove-receipt': [2, 'prove-receipt requires <number> <headSha>'],
    enroll: [2, 'enroll requires <number> <headSha>'],
    dequeue: [1, 'dequeue requires <number>'],
  };
  if (!Object.hasOwn(commands, command)) {
    throw backendError(
      'usage',
      'Usage: merge-queue-backend.mjs <preflight|list-state|explain-selector|prove-receipt|enroll|dequeue>'
    );
  }
  const [argumentCount, usageMessage] = usage[command];
  if (args.length !== argumentCount) {
    throw backendError('usage', usageMessage);
  }
  if (
    (command === 'enroll' || command === 'dequeue') &&
    backend === 'native' &&
    !NATIVE_MUTATION_AUTHORIZATIONS.has(env.MERGE_QUEUE_NATIVE_AUTHORIZATION)
  ) {
    throw backendError(
      'native_mutation_unauthorized',
      'Native CLI mutation requires MERGE_QUEUE_NATIVE_AUTHORIZATION=merge-queue-autoenroll'
    );
  }

  const result = await commands[command]();
  write(JSON.stringify(result));
  return result;
}

const isMain =
  process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isMain) {
  runCli(process.argv.slice(2)).catch(error => {
    const message = error instanceof Error ? error.message : String(error);
    process.stderr.write(`merge-queue-backend: ${message}\n`);
    process.exitCode = 1;
  });
}
