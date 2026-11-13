/** Adapters reuse the caller's incident/outbox and claim transaction. No store or loop here. */

import { digestCanonicalJson } from '../summer-commissioning/receipt-trust.mjs';
import {
  advanceCapabilityRequest,
  apiClientCapabilityFailure,
  capabilityBinding,
  classifyCapabilityFailure,
  createCapabilityRequest,
} from './capability-request.mjs';

/** Cheap read-only checks precede expensive dispatch; one failed job does not stop others. */
export async function preflightRequiredCapabilities({
  job,
  requirements,
  probe,
  nowMs,
  expiresAt,
}) {
  const requests = [];
  if (!Array.isArray(requirements) || requirements.length > 16)
    throw new Error('capability-requirements-invalid');
  for (const requirement of requirements) {
    let observation;
    try {
      observation = await probe(requirement, job);
    } catch (error) {
      observation = apiClientCapabilityFailure(error, requirement) ?? {
        ...requirement,
        code: 'probe-unavailable',
      };
    }
    // Availability must be observed for this source and executor, never inferred from configuration.
    const required = classifyCapabilityFailure(requirement);
    if (!required) throw new Error('required-capability-unclassified');
    const expected = capabilityBinding(job, required);
    if (
      job.bindingVerified !== false &&
      observation?.available === true &&
      digestCanonicalJson(observation.binding ?? null) ===
        digestCanonicalJson(expected) &&
      Number.isFinite(Date.parse(observation.observedAt)) &&
      nowMs >= Date.parse(observation.observedAt) &&
      nowMs - Date.parse(observation.observedAt) < 300_000
    )
      continue;
    const blocker = classifyCapabilityFailure({
      ...requirement,
      ...observation,
      capability: required.capability,
      scope: required.scope,
    });
    if (!blocker)
      throw new Error('required-capability-observation-unclassified');
    requests.push(createCapabilityRequest(job, blocker, nowMs, expiresAt));
  }
  return { ready: requests.length === 0, requests };
}

/**
 * Transaction is the EXISTING job/claim journal, with compare-and-swap semantics.
 * Returning an idempotency key does not execute or authorize a provider action.
 * The caller must reconcile the same reserved job after a disconnect, never allocate anew.
 */
export async function reserveCapabilityResume({
  job,
  transaction,
  nowMs,
  resolution,
  probe,
  trustedKeys,
}) {
  return transaction(job.id, record => {
    if (
      !record ||
      ['id', 'head', 'action', 'principal', 'environment', 'owner'].some(
        field => record.job?.[field] !== job[field]
      ) ||
      (record.job?.policyRevision ?? record.job?.head) !==
        (job.policyRevision ?? job.head)
    )
      return { allowed: false, reason: 'current-job-binding-unverified' };
    if (
      !record.custody?.accepted ||
      record.custody.owner !== job.owner ||
      !record.custody.lease ||
      record.custody.head !== job.head ||
      !(Date.parse(record.custody.expiresAt) > nowMs) ||
      !Number.isFinite(Date.parse(record.custody.observedAt)) ||
      Date.parse(record.custody.observedAt) > nowMs ||
      nowMs - Date.parse(record.custody.observedAt) >= 300_000
    )
      return { allowed: false, reason: 'accepted-custody-required' };
    if (record.resume)
      return {
        allowed: false,
        reason: 'resume-already-reserved',
        resume: record.resume,
      };
    if (!['paused', 'not-started'].includes(record.execution?.outcome))
      return { allowed: false, reason: 'execution-readback-required' };
    if (
      !Array.isArray(record.capabilityRequests) ||
      !record.capabilityRequests.length
    )
      return { allowed: false, reason: 'capability-request-state-missing' };
    const results = record.capabilityRequests.map(request =>
      advanceCapabilityRequest(request, {
        job,
        nowMs,
        resolution: resolution?.[request.id],
        probe: probe?.[request.id],
        trustedKeys,
      })
    );
    record.capabilityRequests = results.map(result => result.request);
    const blocked = results.find(result => !result.allowed);
    if (blocked) return { allowed: false, reason: blocked.nextAction };
    // Reserve the same accepted job and all resolution generations in ONE caller transaction.
    record.resume = {
      jobId: job.id,
      head: job.head,
      keys: results.map(result => result.resumeKey),
      reservedAt: new Date(nowMs).toISOString(),
      status: 'reserved',
    };
    record.execution = { ...record.execution, outcome: 'resume-reserved' };
    for (const request of record.capabilityRequests)
      request.resume = record.resume;
    return { allowed: true, resume: record.resume };
  });
}

/**
 * Bounded outbox delivery. Unknown send outcomes only read back; never resend.
 * The caller's existing outbox supplies pacing/retry time; request delivery cannot approve it.
 */
export async function deliverCapabilityRequest({
  jobId,
  requestId,
  transaction,
  send,
  readback,
  nowMs,
}) {
  const selected = await transaction(jobId, record =>
    selectCapabilityDelivery(record, requestId, nowMs)
  );
  if (!selected.request) return { delivered: false, reason: selected.reason };
  let sent;
  if (!selected.readOnly) {
    try {
      sent = await send(selected.request);
    } catch {
      sent = { status: 'unknown' };
    }
  }
  let receipt;
  try {
    receipt = await readback(selected.request, sent?.receipt);
  } catch {
    receipt = null;
  }
  return transaction(jobId, record =>
    settleCapabilityDelivery(record, requestId, selected, sent, receipt, nowMs)
  );
}

export function selectCapabilityDelivery(record, requestId, nowMs) {
  const request = record?.capabilityRequests?.find(row => row.id === requestId);
  if (!request) return { reason: 'request-missing' };
  if (nowMs >= Date.parse(request.expiresAt) && request.status !== 'denied')
    request.status = 'expired';
  if (['denied', 'expired', 'superseded'].includes(request.status))
    return { reason: 'request-not-deliverable' };
  const delivery = request.delivery;
  if (delivery.status === 'confirmed')
    return { reason: 'delivery-already-confirmed' };
  if (['sending', 'checking'].includes(delivery.status)) {
    const age = nowMs - Date.parse(delivery.startedAt);
    if (Number.isFinite(age) && age >= 0 && age < 300_000)
      return { reason: 'delivery-in-flight' };
    delivery.status = 'unknown'; // crashed sender: read back only, never blindly replay
  }
  if (delivery.status === 'denied') return { reason: 'delivery-denied' };
  if (delivery.nextAttemptAt && nowMs < Date.parse(delivery.nextAttemptAt))
    return { reason: 'outbox-backoff' };
  const readOnly = delivery.status === 'unknown';
  if (!readOnly && delivery.attempts >= 2)
    return { reason: 'delivery-attempts-exhausted' };
  delivery.status = readOnly ? 'checking' : 'sending';
  if (!readOnly) delivery.attempts += 1;
  delivery.generation = (delivery.generation ?? 0) + 1;
  delivery.startedAt = new Date(nowMs).toISOString();
  return {
    request: structuredClone(request),
    readOnly,
    generation: delivery.generation,
  };
}

export function settleCapabilityDelivery(
  record,
  requestId,
  selected,
  sent,
  receipt,
  nowMs
) {
  const request = record?.capabilityRequests?.find(row => row.id === requestId);
  if (!request) return { delivered: false, reason: 'request-changed' };
  if (request.delivery.generation !== selected.generation)
    return {
      delivered: request.delivery.status === 'confirmed',
      reason: 'stale-delivery-result',
    };
  const confirmed =
    receipt?.requestId === request.id &&
    receipt?.bindingDigest === request.id &&
    typeof receipt?.id === 'string' &&
    receipt.id.length > 0;
  if (confirmed)
    request.delivery = {
      ...request.delivery,
      status: 'confirmed',
      receipt: receipt.id,
    };
  else if (sent?.status === 'denied') {
    request.delivery.status = 'denied';
    request.delivery.mutationOutcome = 'unknown';
  } else if (
    sent?.status === 'not-sent' &&
    Number.isFinite(Date.parse(sent.nextAttemptAt)) &&
    Date.parse(sent.nextAttemptAt) > nowMs
  )
    request.delivery = {
      ...request.delivery,
      status: 'failed',
      nextAttemptAt: sent.nextAttemptAt,
    };
  else request.delivery.status = 'unknown';
  return {
    delivered: confirmed,
    reason: confirmed
      ? 'delivery-readback-confirmed'
      : `delivery-${request.delivery.status}`,
  };
}
