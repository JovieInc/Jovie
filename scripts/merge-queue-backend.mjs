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
import { classifyQueueCheckBlockerRecords } from './lib/pr-check-failures.mjs';

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

const INVENTORY_PAGE_SIZE = 30;
const MAX_SOURCE_CHECK_CONTEXT_PAGES = 20;
const PULL_REQUEST_INVENTORY_FIELDS = `id number state isDraft title body mergeable mergeStateStatus headRefName headRefOid baseRefName labels(first:100){nodes{name} pageInfo{hasNextPage}} isInMergeQueue mergeQueueEntry { id state position } autoMergeRequest { enabledAt } reviewDecision`;
const HUMAN_QUEUE_INTENT_FIELDS = `reviews(last:100){nodes{state submittedAt commit{oid} author{__typename}} pageInfo{hasPreviousPage}} timelineItems(last:100,itemTypes:[ADDED_TO_MERGE_QUEUE_EVENT,REMOVED_FROM_MERGE_QUEUE_EVENT]){nodes{__typename ... on AddedToMergeQueueEvent{createdAt actor{__typename}} ... on RemovedFromMergeQueueEvent{createdAt actor{__typename} reason}} pageInfo{hasPreviousPage}}`;
const PULL_REQUEST_STATE_FIELDS = `${PULL_REQUEST_INVENTORY_FIELDS} ${HUMAN_QUEUE_INTENT_FIELDS}`;
const SOURCE_CHECK_CONTEXT_FIELDS = `nodes{__typename ... on CheckRun{name status conclusion startedAt completedAt checkSuite{app{slug} workflowRun{workflow{databaseId name}}}} ... on StatusContext{context state createdAt}} pageInfo{hasNextPage endCursor}`;
const SOURCE_CHECK_STATE_FIELDS = `commits(last:1){nodes{commit{oid statusCheckRollup{contexts(first:100){${SOURCE_CHECK_CONTEXT_FIELDS}}}}}}`;
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
// JOV-INV-023 keeps review/taste labels advisory and observation gaps
// non-blocking. The explicit `hold` label is the founder-controlled exception:
// current queue reconciliation must preserve it rather than auto-admit it.
export const HARD_HOLD_LABELS = new Set([
  'hold',
  'queue-deferred',
  'needs-conflict-resolution',
  'fast',
  ...NO_AUTO_HOLD_LABELS,
]);

const QUEUE_RECONCILIATION_HOLD_LABELS = new Set([
  'hold',
  'queue-deferred',
  ...NO_AUTO_HOLD_LABELS,
]);
export const SELECTOR_BLOCKING_LABELS = new Set([
  'hold',
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
const PULL_REQUEST_STATE_WITH_CHECKS_QUERY = `query MergeQueuePullRequestState($owner:String!,$name:String!,$number:Int!){repository(owner:$owner,name:$name){pullRequest(number:$number){${PULL_REQUEST_STATE_FIELDS} ${SOURCE_CHECK_STATE_FIELDS}}}}`;
const COMMIT_CHECK_CONTEXTS_QUERY = `query MergeQueueCommitCheckContexts($owner:String!,$name:String!,$oid:GitObjectID!,$endCursor:String){repository(owner:$owner,name:$name){object(oid:$oid){... on Commit{oid statusCheckRollup{contexts(first:100,after:$endCursor){${SOURCE_CHECK_CONTEXT_FIELDS}}}}}}}`;
const OPEN_PULL_REQUEST_STATES_QUERY = `query MergeQueueOpenPullRequestStates($owner:String!,$name:String!,$endCursor:String){repository(owner:$owner,name:$name){pullRequests(first:${INVENTORY_PAGE_SIZE},after:$endCursor,states:OPEN){nodes{${PULL_REQUEST_INVENTORY_FIELDS}} pageInfo{hasNextPage endCursor}}}}`;
const BRANCH_PROTECTION_QUERY = `query MergeQueueBranchProtection($owner:String!,$name:String!,$refName:String!){repository(owner:$owner,name:$name){ref(qualifiedName:$refName){name branchProtectionRule{id}}}}`;
const LIVE_QUEUE_CONFIGURATION_QUERY = `query MergeQueueLiveConfiguration($owner:String!,$name:String!,$branch:String!){repository(owner:$owner,name:$name){mergeQueue(branch:$branch){configuration{checkResponseTimeout maximumEntriesToBuild maximumEntriesToMerge mergeMethod minimumEntriesToMerge minimumEntriesToMergeWaitTime}}}}`;
const NATIVE_MUTATION_ACTOR_QUERY =
  'query MergeQueueNativeMutationActor { viewer { login } }';
const DEQUEUE_PULL_REQUEST_MUTATION = `mutation DequeuePullRequest($id:ID!){dequeuePullRequest(input:{id:$id}){mergeQueueEntry{id}}}`;
const ENABLE_AUTO_MERGE_MUTATION = `mutation EnablePullRequestAutoMerge($pullRequestId:ID!,$mergeMethod:PullRequestMergeMethod!){enablePullRequestAutoMerge(input:{pullRequestId:$pullRequestId,mergeMethod:$mergeMethod}){pullRequest{id headRefOid autoMergeRequest{enabledAt}}}}`;
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

/**
 * @param {{
 *   backend?: string,
 *   repository?: string,
 *   rulesetId?: string,
 *   baseBranch?: string,
 *   allowUnavailableBypassActors?: boolean,
 *   runner?: (args: any) => Promise<{ code: number, stdout: string, stderr: string }>,
 * }} [input]
 */
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

function normalizeSourceCheckState(pr) {
  const commits = pr?.commits?.nodes;
  if (!Array.isArray(commits) || commits.length !== 1) {
    throw backendError(
      'incomplete_source_check_state',
      'Native queue state is missing the exact source commit check rollup'
    );
  }
  const commit = commits[0]?.commit;
  if (
    typeof commit?.oid !== 'string' ||
    commit.oid.toLowerCase() !== String(pr?.headRefOid ?? '').toLowerCase()
  ) {
    throw backendError(
      'incomplete_source_check_state',
      'Source check rollup is not bound to the current pull request head'
    );
  }
  const contexts = commit?.statusCheckRollup?.contexts;
  if (
    !Array.isArray(contexts?.nodes) ||
    contexts?.pageInfo?.hasNextPage !== false
  ) {
    throw backendError(
      'incomplete_source_check_state',
      'Source check rollup is missing or may be truncated'
    );
  }
  const bucketForState = state => {
    const normalized = String(state ?? '').toUpperCase();
    if (normalized === 'SUCCESS') return 'pass';
    if (normalized === 'SKIPPED' || normalized === 'NEUTRAL') {
      return 'skipping';
    }
    if (
      /^(FAILURE|ERROR|TIMED_OUT|ACTION_REQUIRED|STARTUP_FAILURE)$/.test(
        normalized
      )
    ) {
      return 'fail';
    }
    return 'pending';
  };
  const checks = contexts.nodes.map(context => {
    if (context?.__typename === 'CheckRun') {
      const state =
        context.status === 'COMPLETED' ? context.conclusion : context.status;
      return {
        name: context.name,
        state,
        bucket: bucketForState(state),
        workflow: context.checkSuite?.workflowRun?.workflow?.name ?? '',
        workflowDatabaseId:
          context.checkSuite?.workflowRun?.workflow?.databaseId ?? null,
        appSlug: context.checkSuite?.app?.slug ?? '',
        startedAt: context.startedAt,
        completedAt: context.completedAt,
      };
    }
    if (context?.__typename === 'StatusContext') {
      return {
        name: context.context,
        state: context.state,
        bucket: bucketForState(context.state),
        startedAt: context.createdAt,
        completedAt: context.createdAt,
      };
    }
    throw backendError(
      'incomplete_source_check_state',
      'Source check rollup contains an unknown context type'
    );
  });
  return classifyQueueCheckBlockerRecords(checks);
}

function sourceCheckContextDigest(nodes) {
  return JSON.stringify((nodes ?? []).map(node => JSON.stringify(node)).sort());
}

async function readCompleteCommitCheckContexts({
  runner,
  owner,
  name,
  head,
  description,
}) {
  const nodes = [];
  let endCursor = null;
  const seenCursors = new Set();
  for (let pageCount = 0; ; pageCount += 1) {
    if (pageCount > MAX_SOURCE_CHECK_CONTEXT_PAGES) {
      throw backendError(
        'incomplete_source_check_state',
        'Source check rollup verification exceeded its page limit'
      );
    }
    const pagePayload = assertGraphqlResponse(
      await runGhJson(
        runner,
        graphqlArgs(COMMIT_CHECK_CONTEXTS_QUERY, {
          owner,
          name,
          oid: head,
          endCursor,
        }),
        description
      ),
      description
    );
    const pageCommit = pagePayload?.data?.repository?.object;
    const page = pageCommit?.statusCheckRollup?.contexts;
    if (
      String(pageCommit?.oid ?? '').toLowerCase() !== head ||
      !Array.isArray(page?.nodes) ||
      typeof page?.pageInfo?.hasNextPage !== 'boolean'
    ) {
      throw backendError(
        'incomplete_source_check_state',
        'Source check rollup verification returned incomplete commit evidence'
      );
    }
    nodes.push(...page.nodes);
    if (page.pageInfo.hasNextPage !== true) return nodes;
    endCursor = page.pageInfo.endCursor;
    if (
      typeof endCursor !== 'string' ||
      endCursor.length === 0 ||
      seenCursors.has(endCursor)
    ) {
      throw backendError(
        'incomplete_source_check_state',
        'Source check rollup verification did not advance its cursor'
      );
    }
    seenCursors.add(endCursor);
  }
}

function humanQueueIntent(pr) {
  const labels = Array.isArray(pr?.labels?.nodes) ? pr.labels.nodes : [];
  if (!labels.some(label => label?.name === 'needs-human')) {
    return { approved: false, hold: false, unknown: false };
  }
  const reviews = pr?.reviews;
  const timeline = pr?.timelineItems;
  if (!Array.isArray(reviews?.nodes) || !Array.isArray(timeline?.nodes)) {
    return { approved: false, hold: false, unknown: true };
  }
  const head = String(pr?.headRefOid ?? '').toLowerCase();
  const decisions = [];
  if (pr?.reviewDecision === 'APPROVED') {
    for (const review of reviews.nodes) {
      if (
        review?.state === 'APPROVED' &&
        review?.author?.__typename === 'User' &&
        String(review?.commit?.oid ?? '').toLowerCase() === head
      ) {
        decisions.push({ type: 'approval', at: review.submittedAt });
      }
    }
  }
  for (const event of timeline.nodes) {
    if (event?.actor?.__typename !== 'User') continue;
    if (
      event?.__typename === 'RemovedFromMergeQueueEvent' &&
      event.reason === 'manual'
    ) {
      decisions.push({ type: 'manual-removal', at: event.createdAt });
    }
  }
  const timestamp = value => {
    const parsed = Date.parse(String(value ?? ''));
    return Number.isFinite(parsed) ? parsed : null;
  };
  const datedDecisions = decisions
    .map(decision => ({ ...decision, timestamp: timestamp(decision.at) }))
    .filter(decision => decision.timestamp !== null)
    .sort((left, right) => left.timestamp - right.timestamp);
  const latest = datedDecisions.at(-1);

  const hiddenHistoryCouldBeNewer = connection => {
    if (connection?.pageInfo?.hasPreviousPage !== true) return false;
    const visibleTimestamps = connection.nodes
      .map(node => timestamp(node?.submittedAt ?? node?.createdAt))
      .filter(value => value !== null);
    if (!latest || visibleTimestamps.length === 0) return true;
    return latest.timestamp < Math.min(...visibleTimestamps);
  };
  const unknown =
    decisions.length !== datedDecisions.length ||
    hiddenHistoryCouldBeNewer(reviews) ||
    hiddenHistoryCouldBeNewer(timeline);
  if (unknown || !latest) {
    return { approved: false, hold: false, unknown };
  }
  return {
    approved: latest.type === 'approval',
    hold: latest.type === 'manual-removal',
    unknown: false,
  };
}

function normalizeNativePullRequest(pr, { includeSourceChecks = false } = {}) {
  const missing = REQUIRED_NATIVE_STATE_FIELDS.filter(
    field => !Object.hasOwn(pr ?? {}, field)
  );
  if (missing.length > 0 || typeof pr?.isInMergeQueue !== 'boolean') {
    throw backendError(
      'incomplete_queue_state',
      `Native queue state is incomplete: ${missing.join(', ') || 'isInMergeQueue'}`
    );
  }
  if (
    !Array.isArray(pr.labels?.nodes) ||
    typeof pr.labels?.pageInfo?.hasNextPage !== 'boolean' ||
    pr.labels.pageInfo.hasNextPage
  ) {
    throw backendError(
      'incomplete_queue_state',
      'Native queue state is missing complete authoritative labels'
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
  const intent = humanQueueIntent(pr);
  const normalized = {
    ...pr,
    backend: 'native',
    autoMergeEnabled: pr.autoMergeRequest !== null,
    queued: hasAuthoritativeQueueEntry,
    exactHeadHumanApproved: intent.approved,
    humanQueueHold: intent.hold,
    humanQueueIntentUnknown: intent.unknown,
  };
  if (includeSourceChecks) {
    normalized.checkBlockers = normalizeSourceCheckState(pr);
    normalized.fail = normalized.checkBlockers.map(blocker => blocker.message);
  }
  return normalized;
}

async function readNativePullRequestState({
  runner,
  repository,
  number,
  includeSourceChecks = false,
}) {
  const { owner, name } = parseRepositorySlug(repository);
  const description = `reading native queue state for PR #${number}`;
  const payload = assertGraphqlResponse(
    await runGhJson(
      runner,
      graphqlArgs(
        includeSourceChecks
          ? PULL_REQUEST_STATE_WITH_CHECKS_QUERY
          : PULL_REQUEST_STATE_QUERY,
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
  if (
    includeSourceChecks &&
    pr?.commits?.nodes?.[0]?.commit?.statusCheckRollup?.contexts?.pageInfo
      ?.hasNextPage === true
  ) {
    const head = String(pr.headRefOid ?? '').toLowerCase();
    const commit = pr.commits.nodes[0]?.commit;
    if (String(commit?.oid ?? '').toLowerCase() !== head) {
      throw backendError(
        'incomplete_source_check_state',
        'Source check rollup is not bound to the current pull request head'
      );
    }
    const contexts = commit.statusCheckRollup.contexts;
    let endCursor = contexts.pageInfo.endCursor;
    const seenCursors = new Set();
    let pageCount = 0;
    while (contexts.pageInfo.hasNextPage === true) {
      if (typeof endCursor !== 'string' || endCursor.length === 0) {
        throw backendError(
          'incomplete_source_check_state',
          'Source check rollup pagination is missing its end cursor'
        );
      }
      if (
        seenCursors.has(endCursor) ||
        pageCount >= MAX_SOURCE_CHECK_CONTEXT_PAGES
      ) {
        throw backendError(
          'incomplete_source_check_state',
          'Source check rollup pagination did not terminate safely'
        );
      }
      seenCursors.add(endCursor);
      pageCount += 1;
      const pagePayload = assertGraphqlResponse(
        await runGhJson(
          runner,
          graphqlArgs(COMMIT_CHECK_CONTEXTS_QUERY, {
            owner,
            name,
            oid: head,
            endCursor,
          }),
          description
        ),
        description
      );
      const pageCommit = pagePayload?.data?.repository?.object;
      const page = pageCommit?.statusCheckRollup?.contexts;
      if (
        String(pageCommit?.oid ?? '').toLowerCase() !== head ||
        !Array.isArray(page?.nodes) ||
        typeof page?.pageInfo?.hasNextPage !== 'boolean'
      ) {
        throw backendError(
          'incomplete_source_check_state',
          'Source check rollup pagination returned incomplete commit evidence'
        );
      }
      contexts.nodes.push(...page.nodes);
      contexts.pageInfo = page.pageInfo;
      endCursor = page.pageInfo.endCursor;
    }

    const verifiedNodes = await readCompleteCommitCheckContexts({
      runner,
      owner,
      name,
      head,
      description,
    });
    if (
      sourceCheckContextDigest(contexts.nodes) !==
      sourceCheckContextDigest(verifiedNodes)
    ) {
      throw backendError(
        'incomplete_source_check_state',
        `PR #${number} source checks changed while their rollup was paginated`
      );
    }
    contexts.nodes = verifiedNodes;

    const latestPayload = assertGraphqlResponse(
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
    const latest = latestPayload?.data?.repository?.pullRequest;
    if (!latest || String(latest.headRefOid ?? '').toLowerCase() !== head) {
      throw backendError(
        'head_changed',
        `PR #${number} head changed while source checks were paginated`
      );
    }
    latest.commits = pr.commits;
    return normalizeNativePullRequest(latest, { includeSourceChecks: true });
  }
  return normalizeNativePullRequest(pr, { includeSourceChecks });
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
  includeSourceChecks = false,
} = {}) {
  requireNativeBackend(backend);
  const parsedNumber = parsePullRequestNumber(number);
  return readNativePullRequestState({
    runner,
    repository,
    number: parsedNumber,
    includeSourceChecks,
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
  for (const state of Object.values(states)) {
    const labels = state.labels.nodes.map(label => label?.name);
    if (labels.includes('needs-human')) {
      states[String(state.number)] = await readNativePullRequestState({
        runner,
        repository,
        number: state.number,
      });
    }
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

function sourceCheckBlockers(state) {
  return (Array.isArray(state?.fail) ? state.fail : []).filter(
    blocker => typeof blocker === 'string' && blocker.length > 0
  );
}

function sourceCheckBlockerRecords(state) {
  if (Array.isArray(state?.checkBlockers)) {
    return state.checkBlockers.filter(
      blocker =>
        blocker &&
        typeof blocker === 'object' &&
        typeof blocker.kind === 'string' &&
        typeof blocker.message === 'string'
    );
  }
  // Legacy snapshots carried only display strings. They cannot distinguish a
  // generated suffix from a literal check name, so fail closed as terminal.
  return sourceCheckBlockers(state).map(message => ({
    kind: 'terminal',
    name: message,
    message,
  }));
}

function hasHumanQueueBlocker(state) {
  return (
    state?.humanQueueHold === true || state?.humanQueueIntentUnknown === true
  );
}

function sourceRedBlockers(state) {
  return sourceCheckBlockerRecords(state)
    .filter(blocker => blocker.kind === 'terminal')
    .map(blocker => blocker.message);
}

export function isSourceRed(state) {
  return sourceRedBlockers(state).length > 0;
}

export function classifyQueueReconciliation(snapshot) {
  if (!Array.isArray(snapshot)) {
    throw backendError(
      'invalid_snapshot',
      'Queue reconciliation snapshot must be an array'
    );
  }

  const mainRows = snapshot.filter(row => row?.base === 'main');
  const queuedRows = mainRows.filter(row => row?.q === true);
  const hardGatedRows = mainRows.filter(row => {
    const labels = Array.isArray(row?.L) ? row.L : [];
    return (
      labels.some(name => HARD_HOLD_LABELS.has(name)) ||
      hasHumanQueueBlocker(row)
    );
  });

  const dequeue = queuedRows.flatMap(row => {
    const labels = Array.isArray(row?.L) ? row.L : [];
    const held = labels.filter(name =>
      QUEUE_RECONCILIATION_HOLD_LABELS.has(name)
    );
    const reasons = [];
    if (row?.draft === true) reasons.push('draft');
    if (held.length > 0) reasons.push(`held-by=${held.join(',')}`);
    if (row?.humanQueueHold === true) reasons.push('held-by=needs-human');
    if (row?.humanQueueIntentUnknown === true) {
      reasons.push('unknown-human-queue-intent=needs-human');
    }
    if (isSourceRed(row)) {
      reasons.push(`source-red=${sourceRedBlockers(row).join(',')}`);
    }
    return reasons.length === 0
      ? []
      : [
          {
            n: row?.n,
            t: row?.t ?? '',
            headOid: row?.headOid ?? '',
            reasons,
          },
        ];
  });

  const countState = state =>
    queuedRows.filter(row => (row?.ms ?? '') === state).length;

  return {
    summary: {
      CLEAN: countState('CLEAN'),
      UNSTABLE: countState('UNSTABLE'),
      BLOCKED: countState('BLOCKED'),
      DIRTY: countState('DIRTY'),
      hardGated: hardGatedRows.length,
      nonMain: snapshot.length - mainRows.length,
    },
    dequeue,
  };
}

export function canAcceptExactHeadQueueReceipt(state, expectedHeadOid) {
  return (
    hasAuthoritativeExactHeadQueueReceipt(state, expectedHeadOid) &&
    hardHoldLabels(state).length === 0 &&
    !hasHumanQueueBlocker(state) &&
    sourceCheckBlockers(state).length === 0
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
  if (isSourceRed(state)) {
    parts.push(`source-red=${sourceRedBlockers(state).join(',')}`);
  } else if (state?.humanQueueHold === true) {
    parts.push('human-queue-hold=needs-human');
  } else if (state?.humanQueueIntentUnknown === true) {
    parts.push('human-queue-intent-unknown=needs-human');
  } else if (sourceCheckBlockers(state).length > 0) {
    parts.push(`source-checks=${sourceCheckBlockers(state).join(',')}`);
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
  if (row.humanQueueHold === true) reasons.push('held-by=needs-human');
  if (row.humanQueueIntentUnknown === true) {
    reasons.push('unknown-human-queue-intent=needs-human');
  }
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
    includeSourceChecks: true,
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
      (hardHoldLabels(state).length > 0 || isSourceRed(state))
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
      `PR #${state.number} must be open and ready for review before enrollment`,
      { state }
    );
  }
  if (state.headRefOid.toLowerCase() !== expectedHeadOid) {
    throw backendError(
      'head_changed',
      `PR #${state.number} head changed from ${expectedHeadOid} to ${state.headRefOid}`,
      { state }
    );
  }
  const heldLabels = state.labels.nodes
    .map(label => label?.name)
    .filter(name => HARD_HOLD_LABELS.has(name));
  if (state.humanQueueHold === true) heldLabels.push('needs-human');
  if (state.humanQueueIntentUnknown === true) {
    heldLabels.push('needs-human-history-incomplete');
  }
  if (heldLabels.length > 0) {
    throw backendError(
      'held_pull_request',
      `PR #${state.number} is held by ${heldLabels.join(', ')}`,
      { labels: heldLabels, state }
    );
  }
  if (isSourceRed(state)) {
    throw backendError(
      'source_red_pull_request',
      `PR #${state.number} has terminal source blockers: ${sourceRedBlockers(state).join(', ')}`,
      { blockers: sourceRedBlockers(state), state }
    );
  }
  const checkBlockers = sourceCheckBlockers(state);
  if (checkBlockers.length > 0) {
    throw backendError(
      'source_checks_not_green',
      `PR #${state.number} does not have complete green source checks: ${checkBlockers.join(', ')}`,
      { blockers: checkBlockers, state }
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
    assertEnrollCandidate(state, expectedHeadOid);
    if (enrollmentPostcondition(state, expectedHeadOid)) {
      return { attempts: attempt, state };
    }
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
    includeSourceChecks: true,
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
  let createdAutoMergeIntent = null;
  const ownsCreatedAutoMergeIntent = state =>
    createdAutoMergeIntent !== null &&
    state?.id === createdAutoMergeIntent.pullRequestId &&
    state?.autoMergeRequest?.enabledAt === createdAutoMergeIntent.enabledAt;
  const disableCreatedAutoMergeIntent = async state => {
    if (!ownsCreatedAutoMergeIntent(state)) {
      return state;
    }
    await runGraphqlMutation(
      mutationRunner,
      DISABLE_AUTO_MERGE_MUTATION,
      { pullRequestId: state.id },
      `removing unproven auto-merge intent for PR #${parsedNumber}`
    );
    const cleaned = await readPullRequestQueueState(stateOptions);
    if (!dequeuePostcondition(cleaned)) {
      throw backendError(
        'enrollment_compensation_failed',
        `PR #${parsedNumber} retained unproven auto-merge intent after cleanup`,
        { state: cleaned }
      );
    }
    return cleaned;
  };

  let mutationError = null;
  try {
    const mutationPayload = await runGraphqlMutation(
      mutationRunner,
      ENABLE_AUTO_MERGE_MUTATION,
      { pullRequestId: before.id, mergeMethod: 'SQUASH' },
      `enrolling PR #${parsedNumber} with ${resolvedBackend}`
    );
    const mutationState =
      mutationPayload?.data?.enablePullRequestAutoMerge?.pullRequest;
    if (
      before.autoMergeRequest === null &&
      mutationState?.headRefOid?.toLowerCase() === expectedHead &&
      typeof mutationState?.autoMergeRequest?.enabledAt === 'string'
    ) {
      createdAutoMergeIntent = {
        pullRequestId: mutationState.id,
        enabledAt: mutationState.autoMergeRequest.enabledAt,
        headRefOid: mutationState.headRefOid.toLowerCase(),
      };
    }
  } catch (error) {
    mutationError = error;
  }
  let observation;
  try {
    observation = await pollEnrollmentPostcondition({
      stateOptions,
      expectedHeadOid: expectedHead,
      attempts: postconditionAttempts,
      delayMs: postconditionDelayMs,
      wait,
    });
  } catch (error) {
    const rejectedState = error?.details?.state;
    if (
      rejectedState?.isInMergeQueue === true ||
      rejectedState?.mergeQueueEntry != null ||
      ownsCreatedAutoMergeIntent(rejectedState)
    ) {
      let compensation;
      try {
        if (
          ownsCreatedAutoMergeIntent(rejectedState) &&
          rejectedState.headRefOid.toLowerCase() !== expectedHead
        ) {
          compensation = {
            changed: true,
            reason: 'stale-head-auto-merge-disabled',
            state: await disableCreatedAutoMergeIntent(rejectedState),
          };
        } else {
          compensation = await dequeuePullRequest({
            backend: resolvedBackend,
            repository,
            number: parsedNumber,
            runner,
            mutationRunner,
            expectedHeadOid: expectedHead,
            requireIneligible: true,
          });
          if (
            compensation.skipped === true &&
            compensation.reason === 'head-changed' &&
            ownsCreatedAutoMergeIntent(compensation.state)
          ) {
            compensation = {
              changed: true,
              reason: 'stale-head-auto-merge-disabled',
              state: await disableCreatedAutoMergeIntent(compensation.state),
            };
          }
        }
      } catch (compensationError) {
        throw backendError(
          'enrollment_compensation_failed',
          `PR #${parsedNumber} became ineligible during enrollment and could not be dequeued`,
          {
            cause: errorEvidence(error),
            compensationError: errorEvidence(compensationError),
            state: rejectedState,
          }
        );
      }
      if (
        compensation.skipped === true &&
        compensation.reason === 'eligibility-recovered' &&
        canAcceptExactHeadQueueReceipt(compensation.state, expectedHead)
      ) {
        return {
          backend: resolvedBackend,
          changed: true,
          mutationActor,
          postconditionAttempts: 1,
          reconciledAfterTransientIneligibility: true,
          state: compensation.state,
        };
      }
      throw backendError(error.code, error.message, {
        ...error.details,
        compensated: dequeuePostcondition(compensation.state),
        compensationSkipped: compensation.skipped === true,
        compensationReason: compensation.reason,
        compensationState: compensation.state,
      });
    }
    throw error;
  }
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
  let compensationState = null;
  if (
    ownsCreatedAutoMergeIntent(observation.state) &&
    observation.state?.autoMergeRequest != null &&
    observation.state?.isInMergeQueue !== true &&
    observation.state?.mergeQueueEntry == null
  ) {
    try {
      compensationState = await disableCreatedAutoMergeIntent(
        observation.state
      );
    } catch (error) {
      if (error?.code === 'enrollment_compensation_failed') throw error;
      throw backendError(
        'enrollment_compensation_failed',
        `PR #${parsedNumber} could not remove unproven auto-merge intent`,
        {
          cause: errorEvidence(error),
          state: observation.state,
        }
      );
    }
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
      compensated: compensationState
        ? dequeuePostcondition(compensationState)
        : false,
      compensationState,
      state: observation.state,
    }
  );
}

async function runGraphqlMutation(runner, query, variables, description) {
  return assertGraphqlResponse(
    await runGhJson(runner, graphqlArgs(query, variables), description),
    description
  );
}

export function currentQueueReconciliationReasons(state) {
  const reasons = [];
  if (state?.isDraft === true) reasons.push('draft');
  const held = hardHoldLabels(state).filter(label =>
    QUEUE_RECONCILIATION_HOLD_LABELS.has(label)
  );
  if (held.length > 0) reasons.push(`held-by=${held.join(',')}`);
  if (state?.humanQueueHold === true) reasons.push('held-by=needs-human');
  if (state?.humanQueueIntentUnknown === true) {
    reasons.push('unknown-human-queue-intent=needs-human');
  }
  if (isSourceRed(state)) {
    reasons.push(`source-red=${sourceRedBlockers(state).join(',')}`);
  }
  return reasons;
}

/**
 * @param {{
 *   backend?: string,
 *   repository?: string,
 *   number?: string | number,
 *   runner?: (args: any) => Promise<{ code: number, stdout: string, stderr: string }>,
 *   mutationRunner?: (args: any) => Promise<{ code: number, stdout: string, stderr: string }>,
 *   expectedHeadOid?: string,
 *   requireIneligible?: boolean,
 * }} [input]
 */
export async function dequeuePullRequest({
  backend,
  repository = DEFAULT_REPOSITORY,
  number,
  runner = createGhRunner(),
  mutationRunner = runner,
  expectedHeadOid,
  requireIneligible = false,
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
    includeSourceChecks: requireIneligible,
  };
  const expectedHead = requireIneligible
    ? parseExpectedHeadOid(expectedHeadOid)
    : null;
  const before = await readPullRequestQueueState(stateOptions);
  if (requireIneligible && before.headRefOid.toLowerCase() !== expectedHead) {
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
  if (requireIneligible) {
    const reasons = currentQueueReconciliationReasons(before);
    if (reasons.length === 0) {
      return {
        backend: resolvedBackend,
        changed: false,
        skipped: true,
        reason: 'eligibility-recovered',
        mutationActor,
        state: before,
      };
    }
  }

  const mutationErrors = [];
  const restoreQueueState = async state => {
    try {
      return {
        receipt: await enrollPullRequest({
          backend: resolvedBackend,
          repository,
          number: parsedNumber,
          expectedHeadOid: state.headRefOid,
          runner,
          mutationRunner,
        }),
      };
    } catch (error) {
      return { error: errorEvidence(error) };
    }
  };
  const assertExpectedHeadAfterMutation = async (state, phase) => {
    if (!requireIneligible || state.headRefOid.toLowerCase() === expectedHead) {
      return;
    }
    throw backendError(
      'head_changed_during_dequeue',
      `PR #${parsedNumber} head changed during ${phase}; exact-head dequeue cannot be proven`,
      { expectedHeadOid: expectedHead, state }
    );
  };

  let current = before;
  if (before.isInMergeQueue || before.mergeQueueEntry !== null) {
    if (requireIneligible) {
      current = await readPullRequestQueueState(stateOptions);
      if (current.headRefOid.toLowerCase() !== expectedHead) {
        return {
          backend: resolvedBackend,
          changed: false,
          skipped: true,
          reason: 'head-changed',
          mutationActor,
          state: current,
        };
      }
      const reasons = currentQueueReconciliationReasons(current);
      if (reasons.length === 0) {
        return {
          backend: resolvedBackend,
          changed: false,
          skipped: true,
          reason: 'eligibility-recovered',
          mutationActor,
          state: current,
        };
      }
    }
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

  current = await readPullRequestQueueState(stateOptions);
  await assertExpectedHeadAfterMutation(current, 'queue removal');
  if (requireIneligible) {
    const reasons = currentQueueReconciliationReasons(current);
    if (reasons.length === 0) {
      const restoration = await restoreQueueState(current);
      if (restoration.error) {
        throw backendError(
          'dequeue_compensation_failed',
          `PR #${parsedNumber} recovered eligibility after queue removal and could not be restored`,
          { state: current, restoration }
        );
      }
      return {
        backend: resolvedBackend,
        changed: false,
        skipped: true,
        reason: 'eligibility-recovered',
        mutationActor,
        state: restoration.receipt.state,
      };
    }
  }
  if (current.autoMergeRequest !== null) {
    if (requireIneligible) {
      current = await readPullRequestQueueState(stateOptions);
      await assertExpectedHeadAfterMutation(current, 'auto-merge revalidation');
    }
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
    await assertExpectedHeadAfterMutation(current, 'auto-merge disable');
  }

  if (
    dequeuePostcondition(current) &&
    (!requireIneligible || current.headRefOid.toLowerCase() === expectedHead)
  ) {
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
    command === 'explain-selector' || command === 'reconcile-snapshot'
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
    'reconcile-snapshot': () => classifyQueueReconciliation(readStdinJson()),
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
    'dequeue-ineligible': () =>
      dequeuePullRequest({
        ...options,
        number: args[0],
        expectedHeadOid: args[1],
        requireIneligible: true,
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
    'reconcile-snapshot': [0, 'reconcile-snapshot takes no arguments'],
    'prove-receipt': [2, 'prove-receipt requires <number> <headSha>'],
    enroll: [2, 'enroll requires <number> <headSha>'],
    dequeue: [1, 'dequeue requires <number>'],
    'dequeue-ineligible': [2, 'dequeue-ineligible requires <number> <headSha>'],
  };
  if (!Object.hasOwn(commands, command)) {
    throw backendError(
      'usage',
      'Usage: merge-queue-backend.mjs <preflight|list-state|explain-selector|reconcile-snapshot|prove-receipt|enroll|dequeue|dequeue-ineligible>'
    );
  }
  const [argumentCount, usageMessage] = usage[command];
  if (command === 'list-state') {
    if (args.length > 1) {
      throw backendError('usage', usageMessage);
    }
  } else if (args.length !== argumentCount) {
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
