#!/usr/bin/env node

import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import {
  buildNativeQueuePolicyReadback,
  isPendingNativeCheckTimeoutCutover,
  isPendingNativeCohortCutoverField,
  isSupportedNativeBuildConcurrency,
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
const NATIVE_MUTATION_AUTHORIZATIONS = new Set(['test-fixture']);
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
const UTC_TIMESTAMP_PATTERN =
  /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?Z$/;

const INVENTORY_PAGE_SIZE = 30;
const PULL_REQUEST_STATE_FIELDS = `id number state isDraft title body mergeable mergeStateStatus headRefName headRefOid baseRefName labels(first:100){nodes{name}} isInMergeQueue mergeQueueEntry { id state position enqueuedAt } autoMergeRequest { enabledAt }`;
const REQUIRED_NATIVE_STATE_FIELDS =
  `id number state isDraft headRefOid labels isInMergeQueue mergeQueueEntry autoMergeRequest`.split(
    ' '
  );
// JOV-INV-023 / JOV-INV-028: legacy human/no-auto labels are inert. Only
// current machine state may stop native queue admission.
export const HARD_HOLD_LABELS = new Set([
  'hold',
  'gated',
  'incident',
  'queue-deferred',
  'needs-conflict-resolution',
  'fast',
]);
export const SELECTOR_BLOCKING_LABELS = new Set([
  'hold',
  'gated',
  'incident',
  'needs-conflict-resolution',
  'fast',
]);
const CLEAN_ADMITTING_PROMOTION_MODES = new Set([
  'normal',
  'hold-intake',
  'draft-only',
]);
const PULL_REQUEST_STATE_QUERY = `query MergeQueuePullRequestState($owner:String!,$name:String!,$number:Int!){repository(owner:$owner,name:$name){pullRequest(number:$number){${PULL_REQUEST_STATE_FIELDS}}}}`;
// Event enqueuer uses the app's [bot] login; actor/entry enqueuer use Bot.login.
const CANONICAL_MEMBERSHIP_QUERY = `query MergeQueueCanonicalMembership($owner:String!,$name:String!,$number:Int!){repository(owner:$owner,name:$name){pullRequest(number:$number){${PULL_REQUEST_STATE_FIELDS} mergeQueueEntry{enqueuer{__typename login}} timelineItems(last:1,itemTypes:[ADDED_TO_MERGE_QUEUE_EVENT,REMOVED_FROM_MERGE_QUEUE_EVENT]){nodes{__typename ... on AddedToMergeQueueEvent{id createdAt actor{__typename login} enqueuer{login}} ... on RemovedFromMergeQueueEvent{id createdAt actor{__typename login}}} pageInfo{hasNextPage}}}}}`;
// Chronological window of queue removals and head changes (JOV-6620).
const EJECTION_HISTORY_QUERY = `query MergeQueueEjectionHistory($owner:String!,$name:String!,$number:Int!){repository(owner:$owner,name:$name){pullRequest(number:$number){timelineItems(last:20,itemTypes:[REMOVED_FROM_MERGE_QUEUE_EVENT,PULL_REQUEST_COMMIT,HEAD_REF_FORCE_PUSHED_EVENT]){nodes{__typename ... on RemovedFromMergeQueueEvent{createdAt reason}}}}}}`;
const OPEN_PULL_REQUEST_STATES_QUERY = `query MergeQueueOpenPullRequestStates($owner:String!,$name:String!,$endCursor:String){repository(owner:$owner,name:$name){pullRequests(first:${INVENTORY_PAGE_SIZE},after:$endCursor,states:OPEN){nodes{${PULL_REQUEST_STATE_FIELDS}} pageInfo{hasNextPage endCursor}}}}`;
const BRANCH_PROTECTION_QUERY = `query MergeQueueBranchProtection($owner:String!,$name:String!,$refName:String!){repository(owner:$owner,name:$name){ref(qualifiedName:$refName){name branchProtectionRule{id}}}}`;
const LIVE_QUEUE_CONFIGURATION_QUERY = `query MergeQueueLiveConfiguration($owner:String!,$name:String!,$branch:String!){repository(owner:$owner,name:$name){mergeQueue(branch:$branch){configuration{checkResponseTimeout maximumEntriesToBuild maximumEntriesToMerge mergeMethod minimumEntriesToMerge minimumEntriesToMergeWaitTime}}}}`;
const BYPASS_ACTOR_AGGREGATE_QUERY = `query MergeQueueBypassActorAggregate($owner:String!,$name:String!,$rulesetId:Int!){viewer{login} repository(owner:$owner,name:$name){nameWithOwner ruleset(databaseId:$rulesetId){id databaseId name enforcement target updatedAt source{__typename ... on Repository{nameWithOwner}} conditions{refName{include exclude} organizationProperty{__typename} repositoryId{__typename} repositoryName{__typename} repositoryProperty{__typename}} rules(first:100){totalCount pageInfo{hasNextPage hasPreviousPage} nodes{type parameters{__typename ... on MergeQueueParameters{checkResponseTimeoutMinutes groupingStrategy maxEntriesToBuild maxEntriesToMerge mergeMethod minEntriesToMerge minEntriesToMergeWaitMinutes} ... on RequiredStatusChecksParameters{strictRequiredStatusChecksPolicy requiredStatusChecks{context integrationId}}}}} bypassActors(first:1){totalCount pageInfo{hasNextPage hasPreviousPage}}}}}`;
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

/**
 * Postcondition poll spacing for CLI callers. Hermetic fixtures (whose fake
 * `gh` answers instantly) set MERGE_QUEUE_POSTCONDITION_DELAY_MS=0 so the
 * same bounded read sequence runs without real wall-clock waits; production
 * leaves it unset and keeps the eventual-consistency default.
 * @param {NodeJS.ProcessEnv} env
 */
function postconditionDelayFromEnv(env) {
  const raw = env.MERGE_QUEUE_POSTCONDITION_DELAY_MS;
  if (raw === undefined || raw === '') {
    return DEFAULT_ENROLLMENT_POSTCONDITION_DELAY_MS;
  }
  if (!/^\d{1,6}$/.test(raw)) {
    throw backendError(
      'invalid_postcondition_delay',
      'MERGE_QUEUE_POSTCONDITION_DELAY_MS must be a non-negative integer'
    );
  }
  return Number(raw);
}

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

// REST omits bypass_actors without ruleset write access. This independently
// labelled proof comes from the same configured reader, never a synthetic []
// or a historical receipt. v1 binds an exact version; v2 independently proves
// admission policy and global zero in one ruleset response. Preserve both raw
// timestamps: DateTime precision cannot establish cross-interface revisions.
function versionTimestamp(value) {
  if (typeof value !== 'string') return null;
  const match = value.match(
    /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.(\d+))?(Z|([+-])(\d{2}):(\d{2}))$/
  );
  if (!match) return null;
  const [
    ,
    year,
    month,
    day,
    hour,
    minute,
    second,
    fraction = '',
    zone,
    ,
    zoneHour = '0',
    zoneMinute = '0',
  ] = match;
  const leap =
    Number(year) % 4 === 0 &&
    (Number(year) % 100 !== 0 || Number(year) % 400 === 0);
  const days = [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  if (
    Number(month) < 1 ||
    Number(month) > 12 ||
    Number(day) < 1 ||
    Number(day) > days[Number(month) - 1] ||
    Number(hour) > 23 ||
    Number(minute) > 59 ||
    Number(second) > 59 ||
    Number(zoneHour) > 23 ||
    Number(zoneMinute) > 59
  )
    return null;
  // Parse only whole seconds; compare every fractional digit independently.
  const seconds = Date.parse(
    `${year}-${month}-${day}T${hour}:${minute}:${second}${zone}`
  );
  return Number.isFinite(seconds)
    ? { seconds, fraction: fraction.replace(/0+$/, '') }
    : null;
}

function matchingVersionTimestamps(restValue, graphqlValue, policyBound) {
  const rest = versionTimestamp(restValue);
  const graphql = UTC_TIMESTAMP_PATTERN.test(graphqlValue ?? '')
    ? versionTimestamp(graphqlValue)
    : null;
  return Boolean(
    rest &&
      graphql &&
      rest.seconds === graphql.seconds &&
      (rest.fraction === graphql.fraction ||
        // This rejects incompatible observations; it never proves equal revisions.
        (policyBound && !graphqlValue.includes('.')))
  );
}

const QUEUE_PARAMETER_FIELDS = Object.freeze({
  checkResponseTimeoutMinutes: 'check_response_timeout_minutes',
  groupingStrategy: 'grouping_strategy',
  maxEntriesToBuild: 'max_entries_to_build',
  maxEntriesToMerge: 'max_entries_to_merge',
  mergeMethod: 'merge_method',
  minEntriesToMerge: 'min_entries_to_merge',
  minEntriesToMergeWaitMinutes: 'min_entries_to_merge_wait_minutes',
});

function completeConnection(connection) {
  return (
    Number.isSafeInteger(connection?.totalCount) &&
    connection.totalCount >= 0 &&
    Array.isArray(connection.nodes) &&
    connection.nodes.length === connection.totalCount &&
    connection.pageInfo?.hasNextPage === false &&
    connection.pageInfo?.hasPreviousPage === false
  );
}

function checkIdentity(check, graphql) {
  const field = graphql ? 'integrationId' : 'integration_id';
  const id = check?.[field];
  if (
    typeof check?.context !== 'string' ||
    check.context.length === 0 ||
    (graphql && (!Object.hasOwn(check, field) || id === undefined)) ||
    (id !== undefined && id !== null && (!Number.isSafeInteger(id) || id < 1))
  )
    return null;
  return JSON.stringify([check.context, id ?? null]);
}

function matchingAdmissionPolicy(live, rest, repository) {
  const conditions = live?.conditions;
  const refs = conditions?.refName;
  const restRefs = rest?.conditions?.ref_name;
  const nodes = live?.rules?.nodes;
  const restRules = rest?.rules;
  if (
    live?.source?.__typename !== 'Repository' ||
    live.source.nameWithOwner !== repository ||
    live.target !== 'BRANCH' ||
    !conditions ||
    [
      'organizationProperty',
      'repositoryId',
      'repositoryName',
      'repositoryProperty',
    ].some(field => conditions[field] !== null) ||
    Object.keys(rest?.conditions ?? {}).some(field => field !== 'ref_name') ||
    !Array.isArray(refs?.include) ||
    !refs.include.every(ref => typeof ref === 'string') ||
    !Array.isArray(refs?.exclude) ||
    refs.exclude.length !== 0 ||
    !Array.isArray(restRefs?.include) ||
    !Array.isArray(restRefs?.exclude) ||
    JSON.stringify(refs.include.slice().sort()) !==
      JSON.stringify(restRefs.include.slice().sort()) ||
    JSON.stringify(refs.exclude) !== JSON.stringify(restRefs?.exclude) ||
    !completeConnection(live.rules) ||
    !Array.isArray(restRules) ||
    nodes.some(node => typeof node?.type !== 'string') ||
    restRules.some(rule => typeof rule?.type !== 'string') ||
    JSON.stringify(nodes.map(node => node.type.toLowerCase()).sort()) !==
      JSON.stringify(restRules.map(rule => rule.type).sort())
  )
    return false;
  const queueRules = nodes.filter(node => node.type === 'MERGE_QUEUE');
  const checkRules = nodes.filter(
    node => node.type === 'REQUIRED_STATUS_CHECKS'
  );
  if (queueRules.length !== 1 || checkRules.length !== 1) return false;
  const queue = queueRules[0].parameters;
  const restQueue = restRules.find(
    rule => rule.type === 'merge_queue'
  )?.parameters;
  const checks = checkRules[0].parameters;
  const restChecks = restRules.find(
    rule => rule.type === 'required_status_checks'
  )?.parameters;
  if (
    queue?.__typename !== 'MergeQueueParameters' ||
    checks?.__typename !== 'RequiredStatusChecksParameters' ||
    checks.strictRequiredStatusChecksPolicy !== false ||
    restChecks?.strict_required_status_checks_policy !== false ||
    !Array.isArray(checks.requiredStatusChecks) ||
    !Array.isArray(restChecks.required_status_checks)
  )
    return false;
  const checkIds = checks.requiredStatusChecks.map(check =>
    checkIdentity(check, true)
  );
  const restCheckIds = restChecks.required_status_checks.map(check =>
    checkIdentity(check, false)
  );
  if (
    checkIds.includes(null) ||
    restCheckIds.includes(null) ||
    JSON.stringify(checkIds.sort()) !== JSON.stringify(restCheckIds.sort()) ||
    !REQUIRED_CHECKS.every(context =>
      checks.requiredStatusChecks.some(
        check => normalizeRequiredCheckName(check.context) === context
      )
    )
  )
    return false;
  // Validate this response independently. External queue configuration must
  // never overwrite an invalid projected ruleset parameter.
  return Object.entries(QUEUE_PARAMETER_FIELDS).every(([field, restField]) => {
    const value = queue[field];
    const numeric = typeof NATIVE_QUEUE_POLICY[restField] === 'number';
    const minimum = restField === 'min_entries_to_merge_wait_minutes' ? 0 : 1;
    if (numeric && (!Number.isSafeInteger(value) || value < minimum))
      return false;
    return (
      value !== undefined &&
      value === restQueue?.[restField] &&
      (value === NATIVE_QUEUE_POLICY[restField] ||
        isSupportedNativeBuildConcurrency(restField, value) ||
        isPendingNativeCheckTimeoutCutover(restField, value) ||
        isPendingNativeCohortCutoverField(restField))
    );
  });
}

function freshBypassAggregateTimestamp(observedAt) {
  const age = Date.now() - Date.parse(observedAt);
  return (
    typeof observedAt === 'string' &&
    UTC_TIMESTAMP_PATTERN.test(observedAt) &&
    Number.isFinite(age) &&
    age >= 0 &&
    age <= 60_000
  );
}

function validateBypassActorAggregate(proof, ruleset, repository, rulesetId) {
  const response = proof?.response;
  const data = response?.data;
  const liveRepository = data?.repository;
  const liveRuleset = liveRepository?.ruleset;
  const connection = liveRuleset?.bypassActors;
  const policyBound = proof?.schema === 'jovie-native-bypass-aggregate/v2';
  return (
    (proof?.schema === 'jovie-native-bypass-aggregate/v1' || policyBound) &&
    freshBypassAggregateTimestamp(proof.observedAt) &&
    (response?.errors === undefined ||
      (Array.isArray(response.errors) && response.errors.length === 0)) &&
    data?.viewer?.login === CANONICAL_NATIVE_MUTATION_ACTOR &&
    liveRepository?.nameWithOwner === repository &&
    ruleset?.source_type === 'Repository' &&
    ruleset.source === repository &&
    Number.isSafeInteger(liveRuleset?.databaseId) &&
    String(liveRuleset.databaseId) === String(rulesetId) &&
    liveRuleset.databaseId === ruleset?.id &&
    typeof ruleset?.node_id === 'string' &&
    ruleset.node_id.length > 0 &&
    liveRuleset?.id === ruleset.node_id &&
    typeof ruleset?.name === 'string' &&
    ruleset.name.length > 0 &&
    liveRuleset?.name === ruleset.name &&
    liveRuleset?.enforcement === 'ACTIVE' &&
    ruleset.enforcement === 'active' &&
    (!policyBound ||
      matchingAdmissionPolicy(liveRuleset, ruleset, repository)) &&
    matchingVersionTimestamps(
      ruleset?.updated_at,
      liveRuleset?.updatedAt,
      policyBound
    ) &&
    connection?.totalCount === 0 &&
    connection?.pageInfo?.hasNextPage === false &&
    connection?.pageInfo?.hasPreviousPage === false
  );
}

/**
 * Validate live GitHub ruleset, repository, and workflow evidence for native
 * merge-queue enrollment.
 * The legacy allowUnavailableBypassActors option is accepted but ignored;
 * complete zero-bypass proof is always required.
 *
 * @param {{
 *   ruleset?: object | null,
 *   repository?: object | null,
 *   workflowYaml?: string | null,
 *   branchProtectionRef?: object | null,
 *   liveQueueConfiguration?: object | null,
 *   rulesetId?: string,
 *   baseBranch?: string,
 *   repositorySlug?: string,
 *   bypassActorAggregate?: object,
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
  repositorySlug = DEFAULT_REPOSITORY,
  bypassActorAggregate,
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
  const aggregateProvided = bypassActorAggregate !== undefined;
  const aggregateZero =
    aggregateProvided &&
    validateBypassActorAggregate(
      bypassActorAggregate,
      ruleset,
      repositorySlug,
      rulesetId
    );
  const missingRestProvenZero =
    !Object.hasOwn(ruleset ?? {}, 'bypass_actors') && aggregateZero;
  if (aggregateProvided && !aggregateZero) {
    errors.push(
      'ruleset bypass aggregate must be fresh, complete, canonical-actor, identity-bound zero evidence'
    );
  }
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
          isSupportedNativeBuildConcurrency(field, mergeQueue[field]) ||
          isPendingNativeCheckTimeoutCutover(field, mergeQueue[field]) ||
          isPendingNativeCohortCutoverField(field),
      ])
    ),
    [`ruleset is missing required checks: ${missingChecks.join(', ')}`]:
      missingChecks.length === 0,
    'source required checks must be loose; merge_group validates latest main':
      ruleset?.rules?.find(rule => rule?.type === 'required_status_checks')
        ?.parameters?.strict_required_status_checks_policy === false,
    'ruleset bypass_actors must be an array':
      hasValidBypassActors || missingRestProvenZero,
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
    field =>
      !isPendingNativeCohortCutoverField(field) &&
      !isSupportedNativeBuildConcurrency(field, mergeQueue[field]) &&
      !isPendingNativeCheckTimeoutCutover(field, mergeQueue[field])
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
      bypassActorEvidence: aggregateZero
        ? {
            kind: 'graphql-aggregate',
            totalCount: 0,
            actor: bypassActorAggregate.response.data.viewer.login,
            observedAt: bypassActorAggregate.observedAt,
            rulesetNodeId: ruleset.node_id,
            updatedAt: ruleset.updated_at,
            graphqlUpdatedAt:
              bypassActorAggregate.response.data.repository.ruleset.updatedAt,
            binding:
              bypassActorAggregate.schema === 'jovie-native-bypass-aggregate/v2'
                ? 'same-response-admission-policy'
                : 'exact-version',
          }
        : {
            kind: hasValidBypassActors ? 'rest-actor-list' : 'unverified',
            totalCount: hasValidBypassActors ? bypassActors.length : null,
          },
      policyReadback,
    },
  };
}

/**
 * The legacy allowUnavailableBypassActors option is accepted but ignored;
 * acquisition and validation remain fail closed.
 * @param {{
 *   backend?: string,
 *   repository?: string,
 *   rulesetId?: string,
 *   baseBranch?: string,
 *   runner?: (args: any) => Promise<{ code: number, stdout: string, stderr: string }>,
 *   allowUnavailableBypassActors?: boolean,
 * }} [input]
 */
export async function preflightMergeQueue({
  backend,
  repository = DEFAULT_REPOSITORY,
  rulesetId = DEFAULT_RULESET_ID,
  baseBranch = DEFAULT_BASE_BRANCH,
  runner = createGhRunner(),
} = {}) {
  const resolvedBackend = requireNativeBackend(backend);

  const { owner, name } = parseRepositorySlug(repository);
  const observedAt = new Date().toISOString();
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
  // Acquire only for an actually omitted field. A visible malformed/nonempty
  // list still rejects; the old unavailable-field opt-in cannot authorize entry.
  const bypassActorAggregate = Object.hasOwn(ruleset ?? {}, 'bypass_actors')
    ? undefined
    : {
        schema: 'jovie-native-bypass-aggregate/v2',
        observedAt,
        response: await runGhJson(
          runner,
          graphqlArgs(
            BYPASS_ACTOR_AGGREGATE_QUERY,
            {
              owner,
              name,
              rulesetId,
            },
            { typed: ['rulesetId'] }
          ),
          'reading the live ruleset bypass aggregate'
        ),
      };
  const validation = validateNativePreflightEvidence({
    ruleset,
    repository: repositoryEvidence,
    workflowYaml,
    branchProtectionRef,
    liveQueueConfiguration,
    rulesetId,
    baseBranch,
    repositorySlug: repository,
    bypassActorAggregate,
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
      pr.mergeQueueEntry.position < 1 ||
      typeof pr.mergeQueueEntry?.enqueuedAt !== 'string' ||
      !UTC_TIMESTAMP_PATTERN.test(pr.mergeQueueEntry.enqueuedAt))
  ) {
    throw backendError(
      'incomplete_queue_state',
      'Native mergeQueueEntry is missing its id, recognized state, positive position, or enqueuedAt timestamp'
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

/**
 * @param {{
 *   backend?: string,
 *   repository?: string,
 *   number?: string | number,
 *   runner?: (args: any) => Promise<{ code: number, stdout: string, stderr: string }>,
 * }} [input]
 */
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

/**
 * @param {{
 *   backend?: string,
 *   repository?: string,
 *   runner?: (args: any) => Promise<{ code: number, stdout: string, stderr: string }>,
 *   exactPullRequestNumber?: string | number,
 * }} [input]
 */
export async function listPullRequestQueueStates({
  backend,
  repository = DEFAULT_REPOSITORY,
  runner = createGhRunner(),
  exactPullRequestNumber,
} = {}) {
  requireNativeBackend(backend);
  if (
    exactPullRequestNumber != null &&
    String(exactPullRequestNumber).length > 0
  ) {
    const state = await readPullRequestQueueState({
      backend,
      repository,
      number: exactPullRequestNumber,
      runner,
    });
    return { [String(state.number)]: state };
  }
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

// ponytail: GitHub retains pending intent until required checks pass. It is
// never queue membership and needs no compensating disable/re-enroll loop.
function hasPendingAutoMergeIntent(state, expectedHeadOid) {
  return Boolean(
    state?.backend === 'native' &&
      state.state === 'OPEN' &&
      state.isDraft === false &&
      state.headRefOid?.toLowerCase() === expectedHeadOid &&
      hardHoldLabels(state).length === 0 &&
      state.isInMergeQueue === false &&
      state.mergeQueueEntry === null &&
      UTC_TIMESTAMP_PATTERN.test(state.autoMergeRequest?.enabledAt ?? '') &&
      Number.isFinite(Date.parse(state.autoMergeRequest.enabledAt))
  );
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
    (mode === 'isolated-only' && row.iso === true) ||
    (mode === 'controller-repair-only' && row.controllerRepair === true);
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

/** Re-read the observed entry and its event together before certifying admission. */
export async function proveCanonicalMembership({
  backend,
  repository = DEFAULT_REPOSITORY,
  number,
  expectedHeadOid,
  expectedEntryId,
  runner = createGhRunner(),
  now = Date.now,
  observe = evidence => process.stderr.write(`${JSON.stringify(evidence)}\n`),
}) {
  requireNativeBackend(backend);
  const expectedHead = parseExpectedHeadOid(expectedHeadOid);
  if (typeof expectedEntryId !== 'string' || expectedEntryId.length === 0) {
    throw backendError(
      'invalid_queue_entry',
      'An observed queue entry ID is required'
    );
  }
  const payload = assertGraphqlResponse(
    await runGhJson(
      runner,
      graphqlArgs(
        CANONICAL_MEMBERSHIP_QUERY,
        {
          ...parseRepositorySlug(repository),
          number: parsePullRequestNumber(number),
        },
        { typed: ['number'] }
      ),
      'verifying canonical queue membership'
    ),
    'verifying canonical queue membership'
  );
  const observedAt = now();
  const pr = payload?.data?.repository?.pullRequest;
  const state = normalizeNativePullRequest(pr ?? {});
  const timeline = pr.timelineItems;
  const event = timeline?.nodes?.[0];
  const entryTime = Date.parse(state.mergeQueueEntry?.enqueuedAt ?? '');
  const eventTime = Date.parse(event?.createdAt ?? '');
  // Ownership comes from the pinned current entry's native Bot identity.
  // The latest lifecycle event corroborates it; GitHub timestamps identify
  // distinct object creations, not a unique enqueue-operation join key.
  // Reject timestamps predating the current entry.
  // Same-second or delayed old-event ambiguity cannot be resolved by this
  // schema: ordering corroborates ownership, never a unique operation join.
  const predicates = {
    eligibleHead: canAcceptExactHeadQueueReceipt(state, expectedHead),
    currentEntry: state.mergeQueueEntry?.id === expectedEntryId,
    terminalPage: timeline?.pageInfo?.hasNextPage === false,
    singleEvent: Array.isArray(timeline?.nodes) && timeline.nodes.length === 1,
    addedEvent: event?.__typename === 'AddedToMergeQueueEvent',
    eventId: typeof event?.id === 'string' && event.id.length > 0,
    entryBotType: state.mergeQueueEntry?.enqueuer?.__typename === 'Bot',
    entryBotLogin: state.mergeQueueEntry?.enqueuer?.login === 'jovie-bot',
    eventBotType: event?.actor?.__typename === 'Bot',
    eventBotLogin: event?.actor?.login === 'jovie-bot',
    eventEnqueuer: event?.enqueuer?.login === CANONICAL_NATIVE_MUTATION_ACTOR,
    entryTimestamp: Number.isFinite(entryTime),
    eventTimestamp:
      UTC_TIMESTAMP_PATTERN.test(event?.createdAt ?? '') &&
      Number.isFinite(eventTime),
    eventNotBeforeEntry: eventTime >= entryTime,
  };
  // New clock-based constraints qualify observationally over real admissions
  // before enforcement. Host clock skew must not create a new delivery veto.
  const observations = {
    observedTimestamp: Number.isFinite(observedAt),
    entryNotFuture: Number.isFinite(observedAt) && entryTime <= observedAt,
    eventNotFuture: Number.isFinite(observedAt) && eventTime <= observedAt,
  };
  const observationIssues = Object.entries(observations)
    .filter(([, passes]) => !passes)
    .map(([name]) => name);
  const failedPredicates = Object.entries(predicates)
    .filter(([, passes]) => !passes)
    .map(([name]) => name);
  // Explicit scalar allowlist: never include PR body/title, tokens, raw API
  // errors or unbounded objects in a CLI failure receipt.
  const scalar = value =>
    typeof value === 'string'
      ? value.slice(0, 256)
      : typeof value === 'boolean' ||
          (typeof value === 'number' && Number.isFinite(value))
        ? value
        : null;
  const evidence = {
    schema:
      failedPredicates.length > 0
        ? 'jovie-canonical-membership-failure/v1'
        : 'jovie-canonical-membership-observation/v1',
    observedAt: scalar(observedAt),
    failedPredicates,
    predicates,
    observations,
    observationIssues,
    expectedHead: scalar(expectedHead),
    expectedEntryId: scalar(expectedEntryId),
    head: scalar(pr.headRefOid),
    pullRequestState: scalar(state.state),
    isDraft: scalar(state.isDraft),
    isInMergeQueue: scalar(state.isInMergeQueue),
    hardHolds: hardHoldLabels(state),
    entryState: scalar(state.mergeQueueEntry?.state),
    entryPosition: scalar(state.mergeQueueEntry?.position),
    entryId: scalar(state.mergeQueueEntry?.id),
    enqueuedAt: scalar(state.mergeQueueEntry?.enqueuedAt),
    entryActorType: scalar(state.mergeQueueEntry?.enqueuer?.__typename),
    entryActorLogin: scalar(state.mergeQueueEntry?.enqueuer?.login),
    eventId: scalar(event?.id),
    eventType: scalar(event?.__typename),
    createdAt: scalar(event?.createdAt),
    eventActorType: scalar(event?.actor?.__typename),
    eventActorLogin: scalar(event?.actor?.login),
    eventEnqueuerLogin: scalar(event?.enqueuer?.login),
    hasNextPage: scalar(timeline?.pageInfo?.hasNextPage),
    eventCount: Array.isArray(timeline?.nodes) ? timeline.nodes.length : null,
  };
  if (failedPredicates.length > 0) {
    const membershipChanged =
      !predicates.eligibleHead || !predicates.currentEntry;
    throw backendError(
      membershipChanged
        ? 'queue_membership_changed'
        : 'noncanonical_queue_membership',
      membershipChanged
        ? 'Queue entry or eligible source head changed before admission receipt'
        : 'Queue entry lacks a matching Jovie Bot admission event',
      { membershipEvidence: evidence }
    );
  }
  if (observationIssues.length > 0) {
    // Observation delivery itself must remain nonblocking.
    try {
      observe(evidence);
    } catch {
      /* No new admission gate. */
    }
  }
  return { state, eventId: event.id, entryId: expectedEntryId };
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

/**
 * True when the newest queue-relevant timeline event is a failed-checks
 * removal: the head has not changed since the queue rejected it, so
 * re-enrolling would poison and rebuild every merge group behind it
 * (JOV-6620). Timeline items are chronological.
 *
 * @param {Array<{ __typename?: string, reason?: string }> | null | undefined} nodes
 */
export function ejectedWithoutRepair(nodes) {
  if (!Array.isArray(nodes)) {
    throw backendError(
      'incomplete_queue_state',
      'Merge-queue ejection history is not an array'
    );
  }
  const newest = nodes.at(-1);
  return (
    newest?.__typename === 'RemovedFromMergeQueueEvent' &&
    newest.reason === 'failed_checks'
  );
}

async function assertNotEjectedAtSameHead({ runner, repository, number }) {
  const { owner, name } = parseRepositorySlug(repository);
  const description = `reading merge-queue ejections for PR #${number}`;
  const payload = await runGhJson(
    runner,
    graphqlArgs(
      EJECTION_HISTORY_QUERY,
      { owner, name, number },
      { typed: ['number'] }
    ),
    description
  );
  assertGraphqlResponse(payload, description);
  if (
    ejectedWithoutRepair(
      payload?.data?.repository?.pullRequest?.timelineItems?.nodes
    )
  ) {
    throw backendError(
      'ejected_same_head',
      `PR #${number} was removed from the merge queue for failed checks and its head has not changed since. Push a repair, or pass a flake rerun receipt (JOV-6620).`
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

/**
 * @param {{
 *   backend?: string,
 *   repository?: string,
 *   rulesetId?: string,
 *   baseBranch?: string,
 *   allowUnavailableBypassActors?: boolean,
 *   number?: string | number,
 *   expectedHeadOid?: string,
 *   runner?: (args: any) => Promise<{ code: number, stdout: string, stderr: string }>,
 *   mutationRunner?: (args: any) => Promise<{ code: number, stdout: string, stderr: string }>,
 *   postconditionAttempts?: number,
 *   postconditionDelayMs?: number,
 *   wait?: (milliseconds: number) => Promise<void>,
 *   flakeRerunReceipt?: string,
 * }} [input]
 */
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
  flakeRerunReceipt = '',
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

  const preflight = await preflightMergeQueue({
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
    await proveCanonicalMembership({
      ...stateOptions,
      expectedHeadOid: expectedHead,
      expectedEntryId: before.mergeQueueEntry.id,
    });
    return {
      backend: resolvedBackend,
      changed: false,
      mutationActor,
      state: before,
    };
  }
  if (hasPendingAutoMergeIntent(before, expectedHead)) {
    return {
      backend: resolvedBackend,
      changed: false,
      disposition: 'auto-merge-pending',
      mutationActor,
      state: before,
    };
  }

  if (!flakeRerunReceipt) {
    await assertNotEjectedAtSameHead({
      runner,
      repository,
      number: parsedNumber,
    });
  }

  let mutationError = null;
  if (
    preflight.bypassActorEvidence.kind === 'graphql-aggregate' &&
    !freshBypassAggregateTimestamp(preflight.bypassActorEvidence.observedAt)
  ) {
    throw backendError(
      'native_preflight_failed',
      'Native merge-queue bypass aggregate expired before enrollment'
    );
  }
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
    await proveCanonicalMembership({
      ...stateOptions,
      expectedHeadOid: expectedHead,
      expectedEntryId: observation.state.mergeQueueEntry.id,
    });
    return {
      backend: resolvedBackend,
      changed: true,
      mutationActor,
      postconditionAttempts: observation.attempts,
      reconciledAfterCommandError: Boolean(mutationError),
      state: observation.state,
    };
  }
  if (hasPendingAutoMergeIntent(observation.state, expectedHead)) {
    return {
      backend: resolvedBackend,
      changed: true,
      disposition: 'auto-merge-pending',
      mutationActor,
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

/**
 * @param {{
 *   backend?: string,
 *   repository?: string,
 *   number?: string | number,
 *   expectedHeadOid?: string,
 *   runner?: (args: any) => Promise<{ code: number, stdout: string, stderr: string }>,
 *   mutationRunner?: (args: any) => Promise<{ code: number, stdout: string, stderr: string }>,
 * }} [input]
 */
export async function dequeuePullRequest({
  backend,
  repository = DEFAULT_REPOSITORY,
  number,
  expectedHeadOid,
  runner = createGhRunner(),
  mutationRunner = runner,
} = {}) {
  const resolvedBackend = requireNativeBackend(backend);
  const parsedNumber = parsePullRequestNumber(number);
  const expectedHead =
    expectedHeadOid == null ? null : parseExpectedHeadOid(expectedHeadOid);
  const mutationActor =
    await assertCanonicalNativeMutationActor(mutationRunner);
  const stateOptions = {
    backend: resolvedBackend,
    repository,
    number: parsedNumber,
    runner,
  };
  const before = await readPullRequestQueueState(stateOptions);
  if (
    expectedHead !== null &&
    String(before.headRefOid ?? '').toLowerCase() !== expectedHead
  ) {
    return {
      backend: resolvedBackend,
      changed: false,
      skipped: true,
      reason: 'head-changed',
      mutationActor,
      state: before,
    };
  }
  if (dequeuePostcondition(before)) {
    return {
      backend: resolvedBackend,
      changed: false,
      mutationActor,
      state: before,
    };
  }

  let mutationBefore = before;
  let guardedQueueEntry = null;
  if (expectedHead !== null) {
    if (!before.queued || before.mergeQueueEntry === null) {
      return {
        backend: resolvedBackend,
        changed: false,
        skipped: true,
        reason: 'queue-entry-changed',
        mutationActor,
        state: before,
      };
    }
    guardedQueueEntry = {
      id: before.mergeQueueEntry.id,
      enqueuedAt: before.mergeQueueEntry.enqueuedAt,
    };
    mutationBefore = await readPullRequestQueueState(stateOptions);
    if (
      String(mutationBefore.headRefOid ?? '').toLowerCase() !== expectedHead
    ) {
      return {
        backend: resolvedBackend,
        changed: false,
        skipped: true,
        reason: 'head-changed',
        mutationActor,
        guardedQueueEntry,
        state: mutationBefore,
      };
    }
    if (
      !mutationBefore.queued ||
      mutationBefore.mergeQueueEntry?.id !== guardedQueueEntry.id ||
      mutationBefore.mergeQueueEntry?.enqueuedAt !==
        guardedQueueEntry.enqueuedAt
    ) {
      return {
        backend: resolvedBackend,
        changed: false,
        skipped: true,
        reason: 'queue-entry-changed',
        mutationActor,
        guardedQueueEntry,
        state: mutationBefore,
      };
    }
  }

  const mutationErrors = [];
  if (
    mutationBefore.isInMergeQueue ||
    mutationBefore.mergeQueueEntry !== null
  ) {
    try {
      // GitHub's DequeuePullRequestInput.id is the PullRequest node ID.
      await runGraphqlMutation(
        mutationRunner,
        DEQUEUE_PULL_REQUEST_MUTATION,
        { id: mutationBefore.id },
        `dequeuing native PR #${parsedNumber}`
      );
    } catch (error) {
      mutationErrors.push(error);
    }
  }

  let current = await readPullRequestQueueState(stateOptions);
  if (
    expectedHead !== null &&
    String(current.headRefOid ?? '').toLowerCase() !== expectedHead
  ) {
    throw backendError(
      'dequeue_head_raced',
      `PR #${parsedNumber} head changed during expected-head dequeue`,
      { expectedHeadOid: expectedHead, guardedQueueEntry, state: current }
    );
  }
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

  if (
    expectedHead !== null &&
    String(current.headRefOid ?? '').toLowerCase() !== expectedHead
  ) {
    throw backendError(
      'dequeue_head_raced',
      `PR #${parsedNumber} head changed during expected-head dequeue`,
      { expectedHeadOid: expectedHead, guardedQueueEntry, state: current }
    );
  }

  if (dequeuePostcondition(current)) {
    return {
      backend: resolvedBackend,
      changed: true,
      mutationActor,
      ...(guardedQueueEntry === null ? {} : { guardedQueueEntry }),
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
  const resolvedMutationRunner =
    mutationRunner ??
    (typeof env.GH_MUTATION_TOKEN === 'string' &&
    env.GH_MUTATION_TOKEN.length > 0
      ? createGhRunner({
          env: { ...env, GH_TOKEN: env.GH_MUTATION_TOKEN },
        })
      : runner);
  const options = { backend, repository, rulesetId, baseBranch, runner };
  const preflightOptions = options;
  const commands = {
    preflight: () => preflightMergeQueue(preflightOptions),
    'list-state': () =>
      listPullRequestQueueStates({
        ...options,
        exactPullRequestNumber: args[0],
      }),
    'explain-selector': () =>
      explainExactHeadAdmissionSelector({
        snapshot: readStdinJson(),
        admissionPr: args[0],
        admissionHead: args[1],
        promotionMode: args[2],
        enrollSlots: Number.parseInt(String(args[3]), 10),
      }),
    'prove-admission': () =>
      proveCanonicalMembership({
        ...options,
        number: args[0],
        expectedHeadOid: args[1],
        expectedEntryId: args[2],
      }),
    'prove-receipt': () =>
      proveExactHeadQueueReceipt({
        ...options,
        number: args[0],
        expectedHeadOid: args[1],
        postconditionDelayMs: postconditionDelayFromEnv(env),
      }),
    enroll: () =>
      enrollPullRequest({
        ...preflightOptions,
        number: args[0],
        expectedHeadOid: args[1],
        flakeRerunReceipt: args[2] ?? '',
        mutationRunner: resolvedMutationRunner,
        postconditionDelayMs: postconditionDelayFromEnv(env),
      }),
    // Read-only; agents run it before `gh pr merge --auto` (JOV-6620).
    'check-reenroll': async () => {
      const number = parsePullRequestNumber(args[0]);
      await assertNotEjectedAtSameHead({ runner, repository, number });
      return { number, reenrollable: true };
    },
    dequeue: () =>
      dequeuePullRequest({
        ...options,
        number: args[0],
        mutationRunner: resolvedMutationRunner,
      }),
    'dequeue-ineligible': () =>
      dequeuePullRequest({
        ...options,
        number: args[0],
        expectedHeadOid: args[1],
        mutationRunner: resolvedMutationRunner,
      }),
  };
  const usage = {
    preflight: [0, 'preflight takes no arguments'],
    'list-state': [null, 'list-state takes no arguments or one PR number'],
    'explain-selector': [
      4,
      'explain-selector requires <number> <headSha> <promotionMode> <enrollSlots>',
    ],
    'prove-admission': [
      3,
      'prove-admission requires <number> <headSha> <entryId>',
    ],
    'prove-receipt': [2, 'prove-receipt requires <number> <headSha>'],
    enroll: [2, 'enroll requires <number> <headSha> [flakeRerunReceipt]'],
    'check-reenroll': [1, 'check-reenroll requires <number>'],
    dequeue: [1, 'dequeue requires <number>'],
    'dequeue-ineligible': [
      2,
      'dequeue-ineligible requires <number> <expectedHeadSha>',
    ],
  };
  if (!Object.hasOwn(commands, command)) {
    throw backendError(
      'usage',
      'Usage: merge-queue-backend.mjs <preflight|list-state|explain-selector|prove-receipt|prove-admission|enroll|check-reenroll|dequeue|dequeue-ineligible>'
    );
  }
  const [argumentCount, usageMessage] = usage[command];
  if (command === 'list-state') {
    if (args.length > 1) {
      throw backendError('usage', usageMessage);
    }
  } else if (
    args.length !== argumentCount &&
    !(command === 'enroll' && args.length === argumentCount + 1)
  ) {
    throw backendError('usage', usageMessage);
  }
  if (
    (command === 'enroll' ||
      command === 'dequeue' ||
      command === 'dequeue-ineligible') &&
    backend === 'native' &&
    !NATIVE_MUTATION_AUTHORIZATIONS.has(env.MERGE_QUEUE_NATIVE_AUTHORIZATION)
  ) {
    throw backendError(
      'native_mutation_unauthorized',
      'Native CLI mutation requires an active authorization; Merge Queue Auto-Enroll is retired'
    );
  }

  const result = await commands[command]();
  write(JSON.stringify(result));
  return result;
}

export function formatBackendFailure(error) {
  const message = error instanceof Error ? error.message : String(error);
  const evidence = error?.details?.membershipEvidence;
  return (
    `merge-queue-backend: ${message}\n` +
    (evidence?.schema === 'jovie-canonical-membership-failure/v1'
      ? `${JSON.stringify(evidence)}\n`
      : '')
  );
}

const isMain =
  process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isMain) {
  runCli(process.argv.slice(2)).catch(error => {
    process.stderr.write(formatBackendFailure(error));
    process.exitCode = 1;
  });
}
