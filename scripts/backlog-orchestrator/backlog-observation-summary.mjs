/** Output summaries only. These projections never replace private admission proof. */
import { createHash } from 'node:crypto';
import { canonical } from './summer-triage-assessment-client.mjs';

/**
 * @typedef {{schema: 'jovie.backlog-admission-observation-summary/v1', sourceSchema: string,
 *   issue: string, allowed: boolean, authorizesTransition: false, authorizesDispatch: false,
 *   holds: {code: string, owner: string, nextAction: string, evidence: {sha256: string, references: string[]}}[],
 *   evidence: Record<string, string | number | boolean | null>}} NativeObservationSummary
 * @typedef {{schema: 'summer.workflow-drain-observation-summary/v1', sourceSchema: string,
 *   status: string, complete: boolean, observedAt: string, authorizesTransition: false,
 *   authorizesDispatch: false, genericWriterDrain: 'unverified', identity: Record<string, string>,
 *   counts: Record<string, number>, holds: string[], evidenceDigest: string}} WorldObservationSummary
 */
/** Full preimages remain private to the guard and its current-read comparisons.
 * @returns {NativeObservationSummary | undefined} */
export function nativeObservationSummary(value) {
  if (
    value?.schema !== 'jovie.backlog-admission-observation/v1' ||
    !/^JOV-[1-9][0-9]*$/.test(value.issue ?? '') ||
    typeof value.allowed !== 'boolean' ||
    value.authorizesTransition !== false ||
    value.authorizesDispatch !== false ||
    !Array.isArray(value.holds) ||
    !value.evidence ||
    typeof value.evidence !== 'object' ||
    Array.isArray(value.evidence)
  )
    return undefined;
  try {
    const digest = data =>
      createHash('sha256').update(canonical(data)).digest('hex');
    const holds = Array.from(value.holds, row => {
      if (
        typeof row?.code !== 'string' ||
        !/^[a-z0-9-]{1,128}$/.test(row.code) ||
        typeof row.owner !== 'string' ||
        typeof row.nextAction !== 'string' ||
        !Object.hasOwn(row, 'evidence')
      )
        throw Error('native-summary-hold-invalid');
      const references = [];
      const payload = row.evidence;
      if (
        typeof payload === 'string' &&
        (/^JOV-[1-9][0-9]*$/.test(payload) ||
          /^[a-f0-9]{64}$/.test(payload) ||
          /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
            payload
          ))
      )
        references.push(`evidence:${payload}`);
      for (const key of [
        'issue',
        'identifier',
        'dependency',
        'issueId',
        'id',
        'commentId',
        'statusId',
        'pr',
        'number',
      ]) {
        const ref = payload?.[key];
        if (
          typeof ref === 'string' &&
          (/^JOV-[1-9][0-9]*$/.test(ref) ||
            /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
              ref
            ))
        )
          references.push(`${key}:${ref}`);
        else if (
          ['statusId', 'pr', 'number'].includes(key) &&
          Number.isSafeInteger(ref) &&
          ref > 0
        )
          references.push(`${key}:${ref}`);
      }
      return {
        code: row.code,
        owner: row.owner,
        nextAction: row.nextAction,
        evidence: { sha256: digest(payload), references },
      };
    });
    if (value.allowed ? holds.length !== 0 : holds.length === 0)
      return undefined;
    const source = value.evidence;
    /** @type {Record<string, string | number | boolean | null>} */
    const evidence = {};
    for (const key of [
      'observedAt',
      'completedAt',
      'revalidatedAt',
      'localBoundAt',
      'linearPreimagesObservedAt',
      'prObservedAt',
      'historyObservedAt',
    ])
      if (
        typeof source[key] === 'number' &&
        Number.isFinite(source[key]) &&
        source[key] > 0
      )
        evidence[key] = source[key];
    for (const key of ['sourceHash', 'policyHash', 'cohortDigest'])
      if (typeof source[key] === 'string' && /^[a-f0-9]{64}$/.test(source[key]))
        evidence[key] = source[key];
    if (
      typeof source.releaseTree === 'string' &&
      /^[a-f0-9]{40}$/.test(source.releaseTree)
    )
      evidence.releaseTree = source.releaseTree;
    if (Number.isSafeInteger(source.cohortCount) && source.cohortCount >= 0)
      evidence.cohortCount = source.cohortCount;
    if (
      Number.isInteger(source.priority) &&
      source.priority >= 0 &&
      source.priority <= 4
    )
      evidence.priority = source.priority;
    if (source.readOnly === true) evidence.readOnly = true;
    for (const [key, prefix] of [
      ['linearPreimages', 'criticalPreimage'],
      ['cohortMetadataPreimages', 'cohortPreimage'],
    ])
      if (
        source[key] &&
        typeof source[key] === 'object' &&
        !Array.isArray(source[key])
      ) {
        evidence[`${prefix}Count`] = Object.keys(source[key]).length;
        evidence[`${prefix}Digest`] = digest(source[key]);
      }
    return {
      schema: 'jovie.backlog-admission-observation-summary/v1',
      sourceSchema: value.schema,
      issue: value.issue,
      allowed: value.allowed,
      authorizesTransition: false,
      authorizesDispatch: false,
      holds,
      evidence,
    };
  } catch {
    return undefined;
  }
}

/** The caller validates World freshness and production identity before projection.
 * No run payload or ignored source field is returned.
 * @param {{schema?: string, status?: string, complete?: boolean, observedAt?: string,
 *   counts?: Record<string, unknown>, holds?: unknown[]}} world
 * @param {Record<string, string>} identity
 * @returns {WorldObservationSummary} */
export function worldObservationSummary(world, identity) {
  /** @type {Record<string, number>} */
  const counts = {};
  for (const key of [
    'pending',
    'running',
    'currentDeployment',
    'oldDeployment',
    'unknownLineage',
  ]) {
    const value = world.counts?.[key];
    if (typeof value === 'number' && Number.isSafeInteger(value) && value >= 0)
      counts[key] = value;
  }
  /** @type {string[]} */
  const holds = [];
  for (const code of Array.isArray(world.holds) ? world.holds : [])
    if (
      typeof code === 'string' &&
      /^workflow-world-[a-z0-9-]{1,96}$/.test(code)
    )
      holds.push(code);
  return {
    schema: 'summer.workflow-drain-observation-summary/v1',
    sourceSchema: world.schema,
    status: world.status,
    complete: world.complete,
    observedAt: world.observedAt,
    authorizesTransition: false,
    authorizesDispatch: false,
    genericWriterDrain: 'unverified',
    identity: Object.fromEntries(
      [
        'projectId',
        'teamId',
        'deploymentId',
        'sourceRevision',
        'environment',
      ].map(key => [key, identity[key]])
    ),
    counts,
    holds,
    evidenceDigest: createHash('sha256').update(canonical(world)).digest('hex'),
  };
}
