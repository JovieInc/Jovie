import { createHash, createPrivateKey, sign as nodeSign } from 'node:crypto';
import { isIP } from 'node:net';

export const TRIAGE_ASSESSMENT_DOMAIN =
  'jovie.linear-triage-assessment-request/v1';

/** Byte-stable canonical JSON; Summer verifies the signed request with the same form. */
export function canonical(value) {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  if (value !== null && typeof value === 'object') {
    return `{${Object.entries(value)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, child]) => `${JSON.stringify(key)}:${canonical(child)}`)
      .join(',')}}`;
  }
  return JSON.stringify(value);
}
const ROUTE = '/summer/v1/symphony/triage-assessments';
export const GEM_LINEAR_ADMISSION_CONTRACT =
  'gem-linear-admission/2026-10-16.1';
export const LEGACY_GOVERNOR_FENCE_SET_CONTRACT =
  'summer.legacy-governor-fence-set/2026-10-16.1';
const LEGACY_GOVERNOR_FAMILIES = [
  ['agent-ready', 'summer-backlog-governor:agent-ready:'],
  ['unscoped', 'summer-backlog-governor:'],
  ['devin', 'summer-backlog-governor:devin:'],
];
const exactKeys = (value, keys) =>
  value !== null &&
  typeof value === 'object' &&
  !Array.isArray(value) &&
  Object.keys(value).length === keys.length &&
  keys.every(key => Object.hasOwn(value, key));

/** Exact negative acknowledgments only; this never proves generic writer drain. */
export function validLegacyGovernorFenceSet(fence, issueIdentifier, issueId) {
  if (
    typeof issueIdentifier !== 'string' ||
    typeof issueId !== 'string' ||
    !/^JOV-[1-9][0-9]{0,6}$/.test(issueIdentifier) ||
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
      issueId ?? ''
    ) ||
    !exactKeys(fence, [
      'status',
      'contract',
      'issueIdentifier',
      'issueId',
      'idempotencyKey',
      'dispatchPath',
      'authorizesTransition',
      'fenceSetContract',
      'families',
    ]) ||
    fence.status !== 'fenced' ||
    fence.contract !== GEM_LINEAR_ADMISSION_CONTRACT ||
    fence.issueIdentifier !== issueIdentifier ||
    fence.issueId !== issueId ||
    fence.authorizesTransition !== false ||
    fence.fenceSetContract !== LEGACY_GOVERNOR_FENCE_SET_CONTRACT ||
    !Array.isArray(fence.families) ||
    fence.families.length !== LEGACY_GOVERNOR_FAMILIES.length
  )
    return false;
  return LEGACY_GOVERNOR_FAMILIES.every(([family, prefix], index) => {
    const entry = fence.families[index];
    const key = createHash('sha256')
      .update(prefix + issueIdentifier)
      .digest('hex');
    const path = `summer-company/linear-transitions/${key}/dispatch.json`;
    return (
      exactKeys(entry, [
        'family',
        'status',
        'idempotencyKey',
        'dispatchPath',
        'authorizesTransition',
      ]) &&
      entry.family === family &&
      entry.status === 'fenced' &&
      entry.authorizesTransition === false &&
      entry.idempotencyKey === key &&
      entry.dispatchPath === path &&
      (index !== 0 ||
        (fence.idempotencyKey === key && fence.dispatchPath === path))
    );
  });
}

/** This is a current storage observation, never an admission grant or a proof
 * that generic HTTP writers have drained. Held/partial observations stay held. */
export function validWorkflowDrainObservation(value, nowMs = Date.now()) {
  if (
    !value ||
    value.schema !== 'summer.workflow-drain-observation/v1' ||
    value.api !== 'eve0.47.7:world.runs.list:canonical-storage' ||
    value.authorizesTransition !== false ||
    value.authorizesDispatch !== false ||
    value.genericWriterDrain !== 'unverified' ||
    !['observed', 'held'].includes(value.status) ||
    typeof value.complete !== 'boolean' ||
    typeof value.observedAt !== 'string' ||
    !Number.isFinite(Date.parse(value.observedAt)) ||
    nowMs - Date.parse(value.observedAt) < -1000 ||
    nowMs - Date.parse(value.observedAt) > 15_000
  )
    return false;
  if (value.status === 'held') return value.complete === false;
  const identity = value.identity,
    counts = value.counts,
    pages = value.pagination;
  if (
    value.complete !== true ||
    identity?.projectId !== 'prj_LaVQva346cjp5XfrbAIIQUln7tPH' ||
    identity?.teamId !== 'team_bpNDbti6srVLYPKdmQLu4UgT' ||
    identity?.environment !== 'production' ||
    !/^[a-f0-9]{40}$/.test(identity?.sourceRevision ?? '') ||
    !/^dpl_[A-Za-z0-9_-]{1,160}$/.test(identity?.deploymentId ?? '') ||
    identity?.providerOwnerReadback !== 'separate-required' ||
    !Array.isArray(value.holds) ||
    value.holds.length !== 0 ||
    !Array.isArray(value.runs) ||
    ![
      'pending',
      'running',
      'currentDeployment',
      'oldDeployment',
      'unknownLineage',
    ].every(key => Number.isInteger(counts?.[key]) && counts[key] >= 0) ||
    counts.oldDeployment !== 0 ||
    counts.unknownLineage !== 0 ||
    counts.pending + counts.running !== value.runs.length ||
    counts.currentDeployment !== value.runs.length ||
    pages?.complete !== true ||
    pages.maxPagesPerStatus !== 4 ||
    ![100, 1000].includes(pages.pageSize) ||
    !['pendingPages', 'runningPages'].every(
      key => Number.isInteger(pages[key]) && pages[key] >= 1 && pages[key] <= 4
    ) ||
    !['not-reported', 'reported'].includes(value.retention?.status) ||
    value.retention?.basis !==
      'pinned-canonical-current-nonterminal-storage-contract' ||
    value.retention?.scope !== 'current-nonterminal-storage' ||
    value.retention?.historicalCoverage !== 'not-claimed' ||
    !Array.isArray(value.retention?.windows)
  )
    return false;
  const seen = new Set();
  for (const run of value.runs) {
    if (
      !/^wrun_[A-Za-z0-9_-]{1,160}$/.test(run?.runId ?? '') ||
      seen.has(run.runId) ||
      !['pending', 'running'].includes(run.status) ||
      run.deploymentId !== identity.deploymentId ||
      typeof run.workflowName !== 'string' ||
      !run.workflowName ||
      !Number.isFinite(Date.parse(run.createdAt)) ||
      !Number.isFinite(Date.parse(run.updatedAt))
    )
      return false;
    seen.add(run.runId);
  }
  return (
    value.runs.filter(run => run.status === 'pending').length ===
      counts.pending &&
    value.runs.filter(run => run.status === 'running').length === counts.running
  );
}

/**
 * @typedef {{
 *   schema: 'summer.linear-triage-assessment/v1',
 *   issueIdentifier: string,
 *   issueId: string,
 *   deliveryId: string,
 *   linearUpdatedAt: string,
 *   decision: 'stale-event' | 'urgent-investigation-required' | 'existing-intake-reconcile',
 *   authorizesDispatch: false,
 *   acceptedInvestigation: false,
 *   state?: 'Backlog',
 *   priority?: number,
 *   backlogIntake?: {
 *     schema: 'summer.guarded-backlog-intake/v1', status: 'observed',
 *     policy: 'existing-guarded-admission', authorizesTransition: false,
 *   },
 *   admissionDelegation?: {
 *     contract: string, writer: 'gem-fleet-gate', status: 'delegated', authorizesTransition: false,
 *   },
 *   legacyGovernorFence?: {
 *     status: 'fenced', contract: string, issueId: string, issueIdentifier: string,
 *     idempotencyKey: string, dispatchPath: string, authorizesTransition: false,
 *     fenceSetContract: string, families: {family: string, status: 'fenced', idempotencyKey: string,
 *       dispatchPath: string, authorizesTransition: false}[],
 *   },
 *   workflowDrainObservation?: Record<string, any>,
 *   assessment?: {
 *     schema: 'summer.jev-triage/v1', model: 'typesafe-ai/jev',
 *     status: 'decided' | 'ambiguous' | 'unavailable',
 *     destination: 'Todo' | 'Backlog' | null, priority: number | null,
 *     category: string, confidence: number, reason: string, assessmentKey: string,
 *   },
 * }} SummerTriageAssessmentReceipt
 */

export function validJevTriageAssessment(value) {
  return Boolean(
    value &&
      value.schema === 'summer.jev-triage/v1' &&
      value.model === 'typesafe-ai/jev' &&
      ['decided', 'ambiguous', 'unavailable'].includes(value.status) &&
      typeof value.category === 'string' &&
      value.category.length > 0 &&
      value.category.length <= 128 &&
      typeof value.reason === 'string' &&
      value.reason.length > 0 &&
      value.reason.length <= 2000 &&
      typeof value.assessmentKey === 'string' &&
      value.assessmentKey.length > 0 &&
      value.assessmentKey.length <= 200 &&
      typeof value.confidence === 'number' &&
      Number.isFinite(value.confidence) &&
      value.confidence >= 0 &&
      value.confidence <= 1 &&
      (value.status === 'decided'
        ? ['Todo', 'Backlog'].includes(value.destination) &&
          Number.isInteger(value.priority) &&
          value.priority >= 1 &&
          value.priority <= 4
        : value.destination === null && value.priority === null)
  );
}

export function summerAssessmentConfig(environment = process.env) {
  const origin = new URL(environment.SUMMER_BOTTLENECK_ORIGIN ?? '');
  if (
    origin.protocol !== 'https:' ||
    origin.pathname !== '/' ||
    origin.search ||
    origin.hash ||
    origin.username ||
    origin.password ||
    origin.port ||
    origin.hostname === 'localhost' ||
    isIP(origin.hostname) !== 0
  )
    throw new Error('summer-triage-origin-invalid');
  const keyId = environment.SUMMER_BOTTLENECK_SYMPHONY_OUTCOME_SIGNING_KEY_ID;
  if (!/^[A-Za-z0-9][A-Za-z0-9._-]{2,63}$/.test(keyId ?? ''))
    throw new Error('summer-triage-key-id-invalid');
  const privateKey = createPrivateKey(
    environment.SUMMER_BOTTLENECK_SYMPHONY_OUTCOME_SIGNING_PRIVATE_KEY ?? ''
  );
  if (privateKey.asymmetricKeyType !== 'ed25519')
    throw new Error('summer-triage-signing-key-invalid');
  return { origin: origin.origin, keyId, privateKey };
}

/**
 * @param {{identifier: string, issueId: string, deliveryId: string,
 *   expectedState?: unknown, expectedLinearUpdatedAt?: unknown,
 *   fenceLegacyGovernor?: unknown, observeLegacyWorkflowDrain?: unknown}} delivery
 * @param {{environment?: NodeJS.ProcessEnv, fetchImpl?: typeof globalThis.fetch,
 *   now?: () => number, signal?: AbortSignal}} [options]
 * @returns {Promise<SummerTriageAssessmentReceipt>}
 */
export async function requestSummerAssessment(
  delivery,
  {
    environment = process.env,
    fetchImpl = globalThis.fetch,
    now = Date.now,
    signal,
  } = {}
) {
  // Backlog is an explicit, issue-version-bound observation. Never silently
  // send a Triage request when either half of the binding is missing.
  const backlogBound =
    delivery.expectedState !== undefined ||
    delivery.expectedLinearUpdatedAt !== undefined ||
    delivery.fenceLegacyGovernor !== undefined ||
    delivery.observeLegacyWorkflowDrain !== undefined;
  if (
    backlogBound &&
    (delivery.expectedState !== 'Backlog' ||
      typeof delivery.expectedLinearUpdatedAt !== 'string' ||
      !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,9})?(?:Z|[+-]\d{2}:\d{2})$/.test(
        delivery.expectedLinearUpdatedAt
      ) ||
      !Number.isFinite(Date.parse(delivery.expectedLinearUpdatedAt)) ||
      (delivery.fenceLegacyGovernor !== undefined &&
        typeof delivery.fenceLegacyGovernor !== 'boolean') ||
      (delivery.observeLegacyWorkflowDrain !== undefined &&
        typeof delivery.observeLegacyWorkflowDrain !== 'boolean'))
  )
    throw new Error('summer-backlog-binding-invalid');
  const config = summerAssessmentConfig(environment);
  const unsigned = {
    schema: TRIAGE_ASSESSMENT_DOMAIN,
    issueIdentifier: delivery.identifier,
    issueId: delivery.issueId,
    deliveryId: delivery.deliveryId,
    requestedAt: new Date(now()).toISOString(),
    signatureKeyId: config.keyId,
    ...(backlogBound
      ? {
          expectedState: delivery.expectedState,
          expectedLinearUpdatedAt: delivery.expectedLinearUpdatedAt,
          ...(delivery.fenceLegacyGovernor !== undefined
            ? { fenceLegacyGovernor: delivery.fenceLegacyGovernor }
            : {}),
          ...(delivery.observeLegacyWorkflowDrain !== undefined
            ? {
                observeLegacyWorkflowDrain: delivery.observeLegacyWorkflowDrain,
              }
            : {}),
        }
      : {}),
  };
  const signature = nodeSign(
    null,
    Buffer.from(`${TRIAGE_ASSESSMENT_DOMAIN}\0${canonical(unsigned)}`),
    config.privateKey
  ).toString('base64url');
  const response = await fetchImpl(`${config.origin}${ROUTE}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ ...unsigned, signature: `ed25519=${signature}` }),
    signal: signal
      ? AbortSignal.any([signal, AbortSignal.timeout(10_000)])
      : AbortSignal.timeout(10_000),
    redirect: 'error',
  });
  if (!response.ok)
    throw new Error(`summer-triage-assessment-http-${response.status}`);
  const receipt = /** @type {SummerTriageAssessmentReceipt} */ (
    await response.json()
  );
  const fence = receipt?.legacyGovernorFence;
  const delegation = receipt?.admissionDelegation;
  if (
    receipt?.schema !== 'summer.linear-triage-assessment/v1' ||
    receipt.issueIdentifier !== delivery.identifier ||
    receipt.issueId !== delivery.issueId ||
    receipt.deliveryId !== delivery.deliveryId ||
    typeof receipt.linearUpdatedAt !== 'string' ||
    !Number.isFinite(Date.parse(receipt.linearUpdatedAt)) ||
    receipt.authorizesDispatch !== false ||
    receipt.acceptedInvestigation !== false ||
    (backlogBound &&
      (receipt.state !== 'Backlog' ||
        !Number.isInteger(receipt.priority) ||
        receipt.priority < 0 ||
        receipt.priority > 4 ||
        receipt.linearUpdatedAt !== delivery.expectedLinearUpdatedAt ||
        ![
          'existing-intake-reconcile',
          'urgent-investigation-required',
        ].includes(receipt.decision) ||
        receipt.backlogIntake?.schema !== 'summer.guarded-backlog-intake/v1' ||
        receipt.backlogIntake?.status !== 'observed' ||
        receipt.backlogIntake?.policy !== 'existing-guarded-admission' ||
        receipt.backlogIntake?.authorizesTransition !== false ||
        receipt.assessment !== undefined ||
        Reflect.has(receipt, 'assessmentCost'))) ||
    (delivery.fenceLegacyGovernor === true &&
      (delegation?.contract !== GEM_LINEAR_ADMISSION_CONTRACT ||
        delegation?.writer !== 'gem-fleet-gate' ||
        delegation?.status !== 'delegated' ||
        delegation?.authorizesTransition !== false ||
        !validLegacyGovernorFenceSet(
          fence,
          delivery.identifier,
          delivery.issueId
        ) ||
        Reflect.has(receipt, 'escalation'))) ||
    (delivery.fenceLegacyGovernor !== true && fence !== undefined) ||
    (delivery.observeLegacyWorkflowDrain === true
      ? !validWorkflowDrainObservation(receipt.workflowDrainObservation, now())
      : receipt.workflowDrainObservation !== undefined) ||
    (receipt.assessment !== undefined &&
      !validJevTriageAssessment(receipt.assessment)) ||
    ![
      'stale-event',
      'urgent-investigation-required',
      'existing-intake-reconcile',
    ].includes(receipt.decision)
  )
    throw new Error('summer-triage-assessment-invalid');
  return receipt;
}
