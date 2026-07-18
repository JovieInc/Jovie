#!/usr/bin/env node

import { spawnSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import { NATIVE_QUEUE_POLICY } from './lib/merge-queue-guard.mjs';

export const DEFAULT_MERGE_QUEUE_BACKEND = 'graphite';
export const MERGE_QUEUE_BACKENDS = Object.freeze(['graphite', 'native']);

const DEFAULT_REPOSITORY = 'JovieInc/Jovie';
const DEFAULT_RULESET_ID = '10512119';
const DEFAULT_BASE_BRANCH = 'main';
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

const PULL_REQUEST_STATE_FIELDS = `id number state isDraft headRefOid isInMergeQueue mergeQueueEntry { id state } autoMergeRequest { enabledAt }`;
const REQUIRED_NATIVE_STATE_FIELDS =
  `id number state isDraft headRefOid isInMergeQueue mergeQueueEntry autoMergeRequest`.split(
    ' '
  );
const PULL_REQUEST_STATE_QUERY = `query MergeQueuePullRequestState($owner:String!,$name:String!,$number:Int!){repository(owner:$owner,name:$name){pullRequest(number:$number){${PULL_REQUEST_STATE_FIELDS}}}}`;
const OPEN_PULL_REQUEST_STATES_QUERY = `query MergeQueueOpenPullRequestStates($owner:String!,$name:String!,$endCursor:String){repository(owner:$owner,name:$name){pullRequests(first:100,after:$endCursor,states:OPEN){nodes{${PULL_REQUEST_STATE_FIELDS}} pageInfo{hasNextPage endCursor}}}}`;
const BRANCH_PROTECTION_QUERY = `query MergeQueueBranchProtection($owner:String!,$name:String!,$refName:String!){repository(owner:$owner,name:$name){ref(qualifiedName:$refName){name branchProtectionRule{pushAllowances(first:100){totalCount nodes{actor{__typename ... on App{id name slug} ... on User{id login name} ... on Team{id name slug}}}}}}}}`;
const DEQUEUE_PULL_REQUEST_MUTATION = `mutation DequeuePullRequest($id:ID!){dequeuePullRequest(input:{id:$id}){mergeQueueEntry{id}}}`;
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
  const backend = resolveMergeQueueBackend(value);
  if (backend !== 'native') {
    throw backendError(
      'unsupported_transport',
      'Legacy Graphite transport remains owned by drain-pr-queue.sh'
    );
  }
  return backend;
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

function prArgs(action, number, repository, ...flags) {
  return ['pr', action, String(number), '-R', repository, ...flags];
}

async function attemptGh(runner, args, description) {
  try {
    await runGh(runner, args, description);
    return null;
  } catch (error) {
    return error;
  }
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

export function validateNativePreflightEvidence({
  ruleset,
  repository,
  workflowYaml,
  branchProtectionRef,
  rulesetId = DEFAULT_RULESET_ID,
  baseBranch = DEFAULT_BASE_BRANCH,
} = {}) {
  const errors = [];
  const mergeQueueRule = ruleset?.rules?.find(
    rule => rule?.type === 'merge_queue'
  );
  const mergeQueue = mergeQueueRule?.parameters;
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
      !Array.isArray(branchProtectionRule));
  const hasExactBranchProtectionEvidence =
    hasBranchProtectionRef &&
    branchProtectionRef.name === baseBranch &&
    hasBranchProtectionRuleField &&
    hasBranchProtectionRuleShape;
  const pushAllowances =
    branchProtectionRule === null
      ? { totalCount: 0, nodes: [] }
      : branchProtectionRule?.pushAllowances;
  const allowanceCount = pushAllowances?.totalCount;
  const allowanceNodes = pushAllowances?.nodes;
  const allowanceActorIdentities = Array.isArray(allowanceNodes)
    ? allowanceNodes.map(({ actor } = {}) => {
        const type =
          typeof actor?.__typename === 'string' ? actor.__typename : 'Unknown';
        const identity =
          actor?.login ??
          actor?.slug ??
          actor?.name ??
          actor?.id ??
          'unidentified';
        return `${type}:${identity}`;
      })
    : [];
  const hasValidPushAllowances =
    hasExactBranchProtectionEvidence &&
    typeof pushAllowances === 'object' &&
    pushAllowances !== null &&
    !Array.isArray(pushAllowances) &&
    Number.isSafeInteger(allowanceCount) &&
    allowanceCount >= 0 &&
    Array.isArray(allowanceNodes) &&
    allowanceNodes.length === Math.min(allowanceCount, 100) &&
    allowanceNodes.every(({ actor } = {}) => {
      const identity = actor?.login ?? actor?.slug ?? actor?.name ?? actor?.id;
      return (
        typeof actor?.__typename === 'string' &&
        actor.__typename.length > 0 &&
        typeof identity === 'string' &&
        identity.length > 0
      );
    });
  const classicRestrictionDetails = allowanceActorIdentities.join(', ');
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
        mergeQueue?.[field] === expected,
      ])
    ),
    [`ruleset is missing required checks: ${missingChecks.join(', ')}`]:
      missingChecks.length === 0,
    'source required checks must be loose; merge_group validates latest main':
      ruleset?.rules?.find(rule => rule?.type === 'required_status_checks')
        ?.parameters?.strict_required_status_checks_policy === false,
    'ruleset bypass_actors must be an array': hasValidBypassActors,
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
    [`classic branch protection pushAllowances for refs/heads/${baseBranch} must include a non-negative integer totalCount and identified actor nodes`]:
      !hasExactBranchProtectionEvidence || hasValidPushAllowances,
    [`classic branch protection for refs/heads/${baseBranch} must not restrict pushes; found ${Number.isSafeInteger(allowanceCount) ? allowanceCount : 'unknown'} allowance(s): ${classicRestrictionDetails || 'unidentified'}`]:
      !hasValidPushAllowances || allowanceCount === 0,
  };
  for (const [message, condition] of Object.entries(validations)) {
    if (!condition) errors.push(message);
  }
  return {
    ok: errors.length === 0,
    errors,
    evidence: {
      baseBranch,
      mergeMethod: mergeQueue?.merge_method ?? null,
      requiredChecks,
      rulesetId: ruleset?.id ?? null,
      workflowHasMergeGroup,
      classicPushAllowanceCount: hasValidPushAllowances ? allowanceCount : null,
      classicPushAllowanceActors: allowanceActorIdentities,
    },
  };
}

export async function preflightMergeQueue({
  backend,
  repository = DEFAULT_REPOSITORY,
  rulesetId = DEFAULT_RULESET_ID,
  baseBranch = DEFAULT_BASE_BRANCH,
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
      'reading classic branch protection push allowances'
    ),
    'reading classic branch protection push allowances'
  );
  const branchProtectionRef = branchProtectionPayload?.data?.repository?.ref;
  const validation = validateNativePreflightEvidence({
    ruleset,
    repository: repositoryEvidence,
    workflowYaml,
    branchProtectionRef,
    rulesetId,
    baseBranch,
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
  if (
    pr.mergeQueueEntry !== null &&
    typeof pr.mergeQueueEntry?.id !== 'string'
  ) {
    throw backendError(
      'incomplete_queue_state',
      'Native mergeQueueEntry is missing its id'
    );
  }
  return {
    ...pr,
    backend: 'native',
    queued: Boolean(
      pr.isInMergeQueue || pr.mergeQueueEntry || pr.autoMergeRequest
    ),
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

export function enrollmentPostcondition(state, expectedHeadOid) {
  return Boolean(
    state?.state === 'OPEN' &&
      state?.isDraft === false &&
      state?.headRefOid?.toLowerCase() === expectedHeadOid.toLowerCase() &&
      state?.queued === true
  );
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
}

export async function enrollPullRequest({
  backend,
  repository = DEFAULT_REPOSITORY,
  rulesetId = DEFAULT_RULESET_ID,
  baseBranch = DEFAULT_BASE_BRANCH,
  number,
  expectedHeadOid,
  runner = createGhRunner(),
} = {}) {
  const resolvedBackend = requireNativeBackend(backend);
  const parsedNumber = parsePullRequestNumber(number);
  const expectedHead = parseExpectedHeadOid(expectedHeadOid);
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
    runner,
  });

  const before = await readPullRequestQueueState(stateOptions);
  assertEnrollCandidate(before, expectedHead);
  if (enrollmentPostcondition(before, expectedHead)) {
    return { backend: resolvedBackend, changed: false, state: before };
  }

  const args = prArgs(
    'merge',
    parsedNumber,
    repository,
    '--auto',
    '--squash',
    '--match-head-commit',
    expectedHead
  );
  const mutationError = await attemptGh(
    runner,
    args,
    `enrolling PR #${parsedNumber} with ${resolvedBackend}`
  );
  const after = await readPullRequestQueueState(stateOptions);
  if (enrollmentPostcondition(after, expectedHead)) {
    return {
      backend: resolvedBackend,
      changed: true,
      reconciledAfterCommandError: Boolean(mutationError),
      state: after,
    };
  }
  throw backendError(
    'enrollment_postcondition_failed',
    `Could not prove PR #${parsedNumber} is enrolled at ${expectedHead}`,
    { mutationError: mutationError?.message ?? null, state: after }
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
} = {}) {
  const resolvedBackend = requireNativeBackend(backend);
  const parsedNumber = parsePullRequestNumber(number);
  const stateOptions = {
    backend: resolvedBackend,
    repository,
    number: parsedNumber,
    runner,
  };
  const before = await readPullRequestQueueState(stateOptions);
  if (dequeuePostcondition(before)) {
    return { backend: resolvedBackend, changed: false, state: before };
  }

  const mutationErrors = [];
  if (before.isInMergeQueue || before.mergeQueueEntry !== null) {
    try {
      // GitHub's DequeuePullRequestInput.id is the PullRequest node ID.
      await runGraphqlMutation(
        runner,
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
        runner,
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

export async function runCli(
  argv,
  {
    env = process.env,
    runner = createGhRunner({ env }),
    write = value => process.stdout.write(`${value}\n`),
  } = {}
) {
  const backend = resolveMergeQueueBackend(
    env.MERGE_QUEUE_BACKEND ?? DEFAULT_MERGE_QUEUE_BACKEND
  );
  const repository = env.REPO ?? env.GITHUB_REPOSITORY ?? DEFAULT_REPOSITORY;
  const rulesetId = env.MERGE_QUEUE_RULESET_ID ?? DEFAULT_RULESET_ID;
  const baseBranch = env.MERGE_QUEUE_BASE_BRANCH ?? DEFAULT_BASE_BRANCH;
  const [command, ...args] = argv;
  const options = { backend, repository, rulesetId, baseBranch, runner };
  const commands = {
    preflight: () => preflightMergeQueue(options),
    'list-state': () => listPullRequestQueueStates(options),
    enroll: () =>
      enrollPullRequest({
        ...options,
        number: args[0],
        expectedHeadOid: args[1],
      }),
    dequeue: () => dequeuePullRequest({ ...options, number: args[0] }),
  };
  const usage = {
    preflight: [0, 'preflight takes no arguments'],
    'list-state': [0, 'list-state takes no arguments'],
    enroll: [2, 'enroll requires <number> <headSha>'],
    dequeue: [1, 'dequeue requires <number>'],
  };
  if (!Object.hasOwn(commands, command)) {
    throw backendError(
      'usage',
      'Usage: merge-queue-backend.mjs <preflight|list-state|enroll|dequeue>'
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
