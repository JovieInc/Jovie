/** The maintained Fleet exact-event writer. Native lanes retain all claims. */

import { createHash } from 'node:crypto';
import {
  closeSync,
  constants,
  fsyncSync,
  lstatSync,
  mkdirSync,
  openSync,
  readFileSync,
  writeFileSync,
} from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import {
  assertCurrentCohort,
  criticalPreimagesMatch,
  readBacklogCurrent,
} from './backlog-current-linear.mjs';
import {
  nativeObservationSummary,
  worldObservationSummary,
} from './backlog-observation-summary.mjs';
import { openNativeBacklogGuard } from './native-backlog-guard.mjs';
import {
  canonical,
  GEM_LINEAR_ADMISSION_CONTRACT,
  validLegacyGovernorFenceSet,
  validWorkflowDrainObservation,
} from './summer-triage-assessment-client.mjs';

const ORIGIN = 'https://summer.jov.ie';
const TODO = 'c6c00506-dc9f-4910-8ff7-3874dd77174c';
// Reviewed Node24/fluid deployment: even extended-duration HTTP is bounded by
// 1800s. World runs have no such bound and are censused independently.
// https://vercel.com/docs/functions/configuring-functions/duration (2026-10-16)
export const OLD_HTTP_MAX_MS = 1_800_000;
const OWNER = 'JOV-8022 Fleet admission owner';
/**
 * @typedef {import('./backlog-observation-summary.mjs').NativeObservationSummary} NativeObservationSummary
 * @typedef {import('./backlog-observation-summary.mjs').WorldObservationSummary} WorldObservationSummary
 * @typedef {{disposition?: 'held' | 'Todo', status?: 'observed', reason?: string,
 *   holds?: string[], owner?: string, mutations?: 0 | 1, wakeSymphony?: boolean,
 *   authorizesTransition?: false, authorizesDispatch: false,
 *   identity?: Record<string, string>, observedAt?: string, firstSourceObservedAt?: number,
 *   nextAction?: string, nextEligibleObservationAt?: string, gateCode?: string,
 *   nativeObservation?: NativeObservationSummary, worldObservation?: WorldObservationSummary,
 *   verified?: Record<string, unknown>}} AdmissionOutcome
 * @typedef {{issueIdentifier?: string, issueId?: string,
 *   authorizesDispatch?: boolean, acceptedInvestigation?: boolean,
 *   admissionDelegation?: {contract?: string, writer?: string, status?: string, authorizesTransition?: boolean},
 *   legacyGovernorFence?: {status?: string, authorizesTransition?: boolean},
 *   workflowDrainObservation?: {schema?: string, identity?: Record<string, string>, status?: string, complete?: boolean,
 *     holds?: unknown[], counts?: {oldDeployment?: number, unknownLineage?: number}, observedAt?: string}}} HandoffReceipt
 */
/** @returns {AdmissionOutcome} */
const hold = (reason, details = {}) => ({
  disposition: 'held',
  reason,
  holds: [reason],
  owner: OWNER,
  mutations: 0,
  wakeSymphony: false,
  authorizesTransition: false,
  authorizesDispatch: false,
  ...details,
});

/** Append-only intent/readback files; an unknown write is never retried. */
export function admissionJournal(
  directory = join(homedir(), '.local/state/jovie-lanes/backlog-admission')
) {
  const path = key => {
    if (!/^[A-Za-z0-9_-]{1,200}$/.test(key))
      throw new Error('admission-journal-key-invalid');
    return join(directory, `${key}.json`);
  };
  return {
    read(key) {
      try {
        const file = path(key),
          stat = lstatSync(file);
        if (!stat.isFile() || stat.size > 65_536)
          throw new Error('admission-journal-invalid');
        const fd = openSync(file, constants.O_RDONLY | constants.O_NOFOLLOW);
        try {
          return JSON.parse(readFileSync(fd, 'utf8'));
        } finally {
          closeSync(fd);
        }
      } catch (error) {
        if (error.code === 'ENOENT') return null;
        throw error;
      }
    },
    create(key, value) {
      mkdirSync(directory, { recursive: true, mode: 0o700 });
      if (
        !lstatSync(directory).isDirectory() ||
        lstatSync(directory).isSymbolicLink()
      )
        throw new Error('admission-journal-directory-invalid');
      const fd = openSync(
        path(key),
        constants.O_WRONLY |
          constants.O_CREAT |
          constants.O_EXCL |
          constants.O_NOFOLLOW,
        0o600
      );
      try {
        writeFileSync(fd, JSON.stringify(value));
        fsyncSync(fd);
      } finally {
        closeSync(fd);
      }
      const parent = openSync(directory, constants.O_RDONLY);
      try {
        fsyncSync(parent);
      } finally {
        closeSync(parent);
      }
      return value;
    },
  };
}

/** Scope is explicit urgency/P0 or the maintained operator designation. A
 * generic High label/keyword is not authority to expand this sweep. */
export function backlogEventInScope(issue) {
  const labels = (issue.labels?.nodes ?? []).map(row => row.name);
  return (
    issue.priority === 1 ||
    labels.some(name => name === 'P0') ||
    /^(?:P0(?:\s|[:—-])|\[P0\])/i.test(issue.title ?? '') ||
    (issue.priority === 2 &&
      labels.includes('agent-ready') &&
      labels.includes('dispatch-next'))
  );
}

function sameBinding(a, b) {
  return (
    a?.projectId === b?.projectId &&
    a?.teamId === b?.teamId &&
    a?.deploymentId === b?.deploymentId &&
    a?.sourceRevision === b?.sourceRevision &&
    a?.environment === 'production' &&
    b?.environment === 'production'
  );
}

async function productionIdentity(fetchImpl, signal) {
  const response = await fetchImpl(`${ORIGIN}/runtime/v1/identity`, {
    method: 'GET',
    redirect: 'error',
    headers: { accept: 'application/json' },
    signal: signal
      ? AbortSignal.any([signal, AbortSignal.timeout(5_000)])
      : AbortSignal.timeout(5_000),
  });
  const text = await response.text();
  if (!response.ok || text.length > 8192)
    throw new Error('summer-production-identity-unavailable');
  const value = JSON.parse(text);
  if (
    value.schema !== 'jovie.service-identity/v1' ||
    value.id !== 'company.summer' ||
    value.projectId !== 'prj_LaVQva346cjp5XfrbAIIQUln7tPH' ||
    value.teamId !== 'team_bpNDbti6srVLYPKdmQLu4UgT' ||
    value.environment !== 'production' ||
    (value.target != null && value.target !== 'production') ||
    value.status !== 'source-bound' ||
    value.productionOrigin !== ORIGIN ||
    value.blobAuth !== 'oidc' ||
    !/^[a-f0-9]{40}$/.test(value.sourceRevision) ||
    !/^dpl_[A-Za-z0-9]+$/.test(value.deploymentId)
  )
    throw new Error('summer-production-identity-invalid');
  return value;
}

/** First observation starts a conservative old HTTP window. Source changes
 * start another window; no deployment timestamp or supplied drain flag is used.
 * @param {HandoffReceipt} receipt
 * @param {{journal?: ReturnType<typeof admissionJournal>, now?: () => number,
 *   fetchImpl?: typeof globalThis.fetch, environment?: NodeJS.ProcessEnv, signal?: AbortSignal,
 *   issueIdentifier?: string, issueId?: string}} [options]
 * @returns {Promise<AdmissionOutcome>} */
export async function observeSummerWriterHandoff(
  receipt,
  {
    journal = admissionJournal(),
    now = Date.now,
    fetchImpl = globalThis.fetch,
    environment = process.env,
    signal,
    issueIdentifier = receipt?.issueIdentifier,
    issueId = receipt?.issueId,
  } = {}
) {
  if (environment.SUMMER_BOTTLENECK_ORIGIN !== ORIGIN)
    return hold('summer-production-origin-unverified');
  if (
    receipt?.issueIdentifier !== issueIdentifier ||
    receipt?.issueId !== issueId ||
    receipt?.authorizesDispatch !== false ||
    receipt?.acceptedInvestigation !== false ||
    !validLegacyGovernorFenceSet(
      receipt?.legacyGovernorFence,
      issueIdentifier,
      issueId
    )
  )
    return hold('summer-legacy-governor-fence-set-unverified');
  if (
    receipt?.admissionDelegation?.contract !== GEM_LINEAR_ADMISSION_CONTRACT ||
    receipt.admissionDelegation.writer !== 'gem-fleet-gate' ||
    receipt.admissionDelegation.status !== 'delegated' ||
    receipt.admissionDelegation.authorizesTransition !== false ||
    receipt?.legacyGovernorFence?.status !== 'fenced' ||
    receipt.legacyGovernorFence.authorizesTransition !== false
  )
    return hold('summer-single-writer-delegation-unverified');
  const world = receipt.workflowDrainObservation;
  if (!validWorkflowDrainObservation(world, now()))
    return hold('summer-world-observation-invalid');
  const identity = await productionIdentity(fetchImpl, signal);
  if (!sameBinding(identity, world.identity))
    return hold('summer-production-world-binding-mismatch');
  // Append-only observed identity edges, including A -> B -> A. Reusing an
  // earlier A window after rollback would leave B's old HTTP preimages alive.
  let prior,
    epoch = 0;
  for (; epoch < 1024; epoch++) {
    const next = journal.read(`summer-source-epoch-${epoch}`);
    if (!next) break;
    if (
      next.epoch !== epoch ||
      next.previousEpoch !== epoch - 1 ||
      next.schema !== 'jovie.summer-writer-handoff-observation/v1' ||
      next.contract !== GEM_LINEAR_ADMISSION_CONTRACT ||
      !Number.isSafeInteger(next.firstObservedAt) ||
      next.firstObservedAt < Date.parse('2026-10-16T00:00:00Z') ||
      next.firstObservedAt > now() ||
      (prior && next.firstObservedAt < prior.firstObservedAt)
    )
      return hold('summer-source-observation-conflict');
    prior = next;
  }
  if (epoch === 1024) return hold('summer-source-observation-bound');
  if (!sameBinding(prior?.identity, identity))
    prior = journal.create(`summer-source-epoch-${epoch}`, {
      schema: 'jovie.summer-writer-handoff-observation/v1',
      contract: GEM_LINEAR_ADMISSION_CONTRACT,
      epoch,
      previousEpoch: epoch - 1,
      firstObservedAt: now(),
      identity: world.identity,
    });
  if (
    prior.schema !== 'jovie.summer-writer-handoff-observation/v1' ||
    prior.contract !== GEM_LINEAR_ADMISSION_CONTRACT ||
    !sameBinding(prior.identity, identity) ||
    !Number.isSafeInteger(prior.firstObservedAt) ||
    prior.firstObservedAt > now()
  )
    return hold('summer-source-observation-conflict');
  if (
    world.status !== 'observed' ||
    !world.complete ||
    world.holds.length ||
    world.counts.oldDeployment !== 0 ||
    world.counts.unknownLineage !== 0
  )
    return hold('summer-old-world-writers-unverified', {
      worldObservation: worldObservationSummary(world, identity),
    });
  if (world.identity.latestDeploymentId !== identity.deploymentId)
    return hold('summer-provider-latest-mapping-unverified');
  if (now() - prior.firstObservedAt < OLD_HTTP_MAX_MS)
    return hold('summer-old-http-window-pending', {
      nextEligibleObservationAt: new Date(
        prior.firstObservedAt + OLD_HTTP_MAX_MS
      ).toISOString(),
    });
  return {
    status: 'observed',
    identity: world.identity,
    observedAt: world.observedAt,
    firstSourceObservedAt: prior.firstObservedAt,
    authorizesTransition: false,
    authorizesDispatch: false,
  };
}

/** Current signed Summer + private installed native fence -> one state-only
 * write. The journal, native guard and both current readbacks remain mandatory.
 * @returns {Promise<AdmissionOutcome>} */
export async function admitBacklogEvent(
  delivery,
  issue,
  firstReceipt,
  client,
  summer,
  {
    openGuard = openNativeBacklogGuard,
    journal = admissionJournal(),
    now = Date.now,
    fetchImpl = globalThis.fetch,
    environment = process.env,
  } = {}
) {
  if (!backlogEventInScope(issue))
    return hold('backlog-event-outside-authorized-tier');
  const intentKey = `intent-${delivery.issueId}`,
    resultKey = `readback-${delivery.issueId}`;
  let guard,
    intentStarted = false;
  try {
    if (journal.read(intentKey))
      return hold(
        journal.read(resultKey)
          ? 'backlog-admission-already-recorded'
          : 'backlog-admission-effect-unknown',
        {
          nextAction:
            'Preserve the intent; the incumbent admission/reentry owner must reconcile current Linear and native custody before any retry.',
        }
      );
    const first = await observeSummerWriterHandoff(firstReceipt, {
      journal,
      now,
      fetchImpl,
      environment,
      issueIdentifier: delivery.identifier,
      issueId: delivery.issueId,
    });
    if (first.status !== 'observed') return first;
    guard = await openGuard(delivery);
    if (
      guard.observation?.allowed !== true ||
      guard.issueId !== issue.id ||
      guard.priority !== issue.priority
    ) {
      const nativeObservation = nativeObservationSummary(guard.observation);
      return hold('native-backlog-admission-held', {
        nativeObservation,
        owner: nativeObservation?.holds[0]?.owner ?? OWNER,
      });
    }
    // Native lock preparation revalidates remote history before acquisition.
    // Its duration must not age the final World receipt out of the 15s window.
    await guard.lock();
    const secondReceipt = await summer(delivery, { signal: guard.signal });
    const second = await observeSummerWriterHandoff(secondReceipt, {
      journal,
      now,
      fetchImpl,
      environment,
      signal: guard.signal,
      issueIdentifier: delivery.identifier,
      issueId: delivery.issueId,
    });
    if (second.status !== 'observed') return second;
    if (
      !sameBinding(first.identity, second.identity) ||
      Date.parse(second.observedAt) <= Date.parse(first.observedAt)
    )
      return hold('summer-world-repeat-unverified');
    // Keep all network operations within the private child's bounded lease.
    // One attempt only: a timed-out write may already have reached Linear.
    const options = {
      timeoutMs: 4_000,
      maxAttempts: 1,
      rateLimitMaxAttempts: 1,
      rateLimitMaxTotalWaitMs: 0,
      fetchImpl: (url, init) =>
        fetchImpl(url, {
          ...init,
          signal: AbortSignal.any([
            ...(init?.signal ? [init.signal] : []),
            guard.signal,
          ]),
        }),
    };
    const expected = guard.observation.evidence.linearPreimages;
    if (
      expected?.[issue.id]?.updatedAt !== delivery.expectedLinearUpdatedAt ||
      expected[issue.id].identifier !== delivery.identifier ||
      expected[issue.id].priority !== issue.priority
    )
      return hold('native-linear-preimage-binding-invalid');
    const currentRows = await readBacklogCurrent(
      client,
      guard.observation.evidence,
      options
    );
    if (
      !criticalPreimagesMatch(currentRows, expected) ||
      !backlogEventInScope(currentRows[issue.id])
    )
      return hold('backlog-final-preimage-changed');
    await assertCurrentCohort(client, guard.observation.evidence, options);
    if (
      !validWorkflowDrainObservation(
        secondReceipt.workflowDrainObservation,
        now()
      )
    )
      return hold('summer-world-proof-expired-before-write');
    await guard.check();
    const intent = {
      schema: 'jovie.backlog-admission-intent/v1',
      issueId: issue.id,
      identifier: issue.identifier,
      expectedVersion: issue.updatedAt,
      priority: issue.priority,
      stateId: TODO,
      createdAt: new Date(now()).toISOString(),
      nativeEvidence: {
        observedAt: guard.observation.evidence.observedAt,
        cohortDigest: guard.observation.evidence.cohortDigest,
        cohortCount: guard.observation.evidence.cohortCount,
        criticalPreimageDigest: createHash('sha256')
          .update(canonical(expected))
          .digest('hex'),
        cohortPreimageDigest: createHash('sha256')
          .update(canonical(guard.observation.evidence.cohortMetadataPreimages))
          .digest('hex'),
      },
      summerIdentity: second.identity,
    };
    journal.create(intentKey, intent);
    intentStarted = true;
    await guard.check();
    const result = await client.updateIssue(
      issue.id,
      { stateId: TODO },
      options
    );
    if (result?.success !== true && result?.issueUpdate?.success !== true)
      throw new Error('backlog-write-unverified');
    await guard.check();
    const persistedRows = await readBacklogCurrent(
      client,
      guard.observation.evidence,
      options
    );
    const persisted = persistedRows[issue.id];
    if (
      !criticalPreimagesMatch(persistedRows, expected, {
        transitionedIssueId: issue.id,
      })
    )
      throw new Error('backlog-write-readback-unverified');
    await assertCurrentCohort(client, guard.observation.evidence, options, {
      transitionedIssueId: issue.id,
    });
    await guard.check();
    const verified = {
      schema: 'jovie.backlog-admission-readback/v1',
      issueId: issue.id,
      identifier: issue.identifier,
      state: 'Todo',
      priority: persisted.priority,
      updatedAt: persisted.updatedAt,
      verifiedAt: new Date(now()).toISOString(),
      nativeClaim: 'not-observed',
      usefulWork: 'not-observed',
    };
    await guard.finish('done');
    journal.create(resultKey, verified);
    return {
      disposition: 'Todo',
      reason: 'guarded-backlog-admission',
      mutations: 1,
      wakeSymphony: true,
      verified,
      nativeObservation: nativeObservationSummary(guard.observation),
      authorizesDispatch: false,
    };
  } catch (error) {
    const namedCode =
      typeof error?.code === 'string' && /^[a-z0-9-]{1,128}$/.test(error.code)
        ? error.code
        : undefined;
    const nativeObservation = nativeObservationSummary(error?.observation);
    return hold(
      intentStarted
        ? 'backlog-admission-effect-unknown'
        : 'backlog-admission-observation-unavailable',
      {
        ...(namedCode ? { gateCode: namedCode } : {}),
        ...(nativeObservation
          ? {
              nativeObservation,
              owner: nativeObservation.holds?.[0]?.owner ?? OWNER,
            }
          : {}),
        nextAction: intentStarted
          ? 'Reconcile the durable intent with current Linear/native custody; never retry an uncertain write.'
          : 'Refresh the named Summer/native evidence through its incumbent owner.',
      }
    );
  } finally {
    if (guard) await guard.close();
  }
}
