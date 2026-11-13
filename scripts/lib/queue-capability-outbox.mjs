/** Capability delivery state lives in the existing recovery incident + alert artifact. */
import { createCapabilityRequest } from './capability-request.mjs';

export function queueCapabilityHold({
  state,
  prior,
  durable,
  localRequests = [],
  row,
  issue,
  blockers,
  head,
  nowMs,
}) {
  if (!head)
    return {
      status: 'unknown',
      nextAction: 'restore-capability-source-binding',
      capabilityEvidence: blockers,
      owner: prior?.owner ?? null,
      lease: prior?.lease ?? null,
    };
  const byId = new Map();
  for (const candidate of [
    ...(prior?.capabilityRequests ?? []),
    ...(durable?.capabilityRequests ?? []),
    ...localRequests,
  ]) {
    const request = structuredClone(candidate);
    const existing = byId.get(request.id);
    if (existing) {
      if (Date.parse(existing.expiresAt) < Date.parse(request.expiresAt))
        request.expiresAt = existing.expiresAt;
      if (Date.parse(existing.createdAt) < Date.parse(request.createdAt))
        request.createdAt = existing.createdAt;
      request.delivery.attempts = Math.max(
        existing.delivery.attempts,
        request.delivery.attempts
      );
      if (existing.status === 'denied' || request.status === 'denied')
        request.status = 'denied';
      else if (existing.status === 'expired' || request.status === 'expired')
        request.status = 'expired';
      request.delivery.status =
        ['denied', 'confirmed', 'unknown', 'pending'].find(status =>
          [existing.delivery.status, request.delivery.status].includes(status)
        ) ?? request.delivery.status;
      if (existing.resolution && !request.resolution)
        request.resolution = existing.resolution;
    }
    byId.set(request.id, request);
  }
  const requests = [...byId.values()];
  // Moving source never borrows a previous approval or creates a second job.
  const required = [
    ...blockers,
    ...requests
      .filter(
        request =>
          request.binding.head !== head && request.status !== 'resolved'
      )
      .map(request => request.evidence),
  ];
  for (const blocker of required) {
    const request = createCapabilityRequest(
      {
        id: issue?.identifier ?? 'github:jovie:merge-queue-progress',
        head,
        action: 'reattach-remediation-lane',
        principal: 'gem-ci-repair',
        environment: 'official-symphony',
        owner: row.escalationOwner ?? 'gem-ci-repair',
      },
      blocker,
      nowMs,
      new Date(nowMs + row.budgetMinutes * 60_000).toISOString()
    );
    const priorScope = requests.filter(
      existing =>
        existing.binding.capability === request.binding.capability &&
        existing.binding.scope === request.binding.scope
    );
    const barred = priorScope.find(
      existing =>
        existing.delivery.status === 'denied' ||
        ['denied', 'expired'].includes(existing.status)
    );
    if (barred) continue; // a new head is not new permission to retry denied delivery
    request.delivery.attempts = Math.max(
      0,
      ...priorScope.map(existing => existing.delivery.attempts)
    );
    if (priorScope.some(existing => existing.delivery.status === 'unknown'))
      request.delivery.status = 'unknown';
    if (!requests.some(existing => existing.id === request.id))
      requests.push(request);
  }
  for (const request of requests) {
    if (
      request.binding.head !== head &&
      !['denied', 'expired'].includes(request.status) &&
      request.delivery.status !== 'denied'
    )
      request.status = 'superseded';
    else if (
      Date.parse(request.expiresAt) <= nowMs &&
      request.status !== 'denied'
    )
      request.status = 'expired';
    const delivered = durable?.capabilityRequests?.some(
      stored => stored.id === request.id && stored.binding.head === head
    );
    if (delivered && request.delivery.status !== 'denied')
      request.delivery = {
        ...request.delivery,
        status: 'confirmed',
        receipt: issue.identifier,
        destination: 'canonical-incident',
      };
  }
  const current = requests.filter(request => request.binding.head === head);
  const writable =
    !requests.some(request => request.delivery.status === 'denied') &&
    current.some(
      request =>
        request.status === 'pending' &&
        request.delivery.status === 'pending' &&
        request.delivery.attempts < 2
    );
  return {
    status: 'capability-blocked',
    custodyStatus: 'retained-unverified',
    nextAction: requests.some(request => request.status === 'expired')
      ? 'escalate-expired-capability-request'
      : requests.some(
            request =>
              request.delivery.status === 'denied' ||
              request.status === 'denied'
          )
        ? 'respect-request-delivery-denial'
        : 'resolve-required-capability-through-trusted-adapter',
    capabilityRequests: requests,
    owner: state.owner ?? prior?.owner ?? null,
    lease: state.lease ?? prior?.lease ?? null,
    leaseExpiresAt: state.leaseExpiresAt ?? prior?.leaseExpiresAt ?? null,
    writable,
  };
}

/** A failed intake keeps the request and its bounded delivery history in the existing artifact. */
export function retainQueueCapabilityOutbox(
  previous,
  recovery,
  result,
  action
) {
  const state = structuredClone(recovery);
  if (!['hold', 'green'].includes(action))
    for (const request of state.capabilityRequests ?? []) {
      if (
        ['confirmed', 'denied'].includes(request.delivery.status) ||
        request.status !== 'pending'
      )
        continue;
      request.delivery.attempts += 1;
      const errors = Array.isArray(result.body)
        ? result.body
        : (result.body?.errors ?? []);
      const denied =
        /(?:^|_)(401|403)$/.test(result.reason ?? '') ||
        errors.some(error =>
          [
            'FORBIDDEN',
            'UNAUTHORIZED',
            'AUTHENTICATION_ERROR',
            'PERMISSION_DENIED',
          ].includes(error?.extensions?.code)
        );
      request.delivery.status = denied ? 'denied' : 'unknown';
    }
  return {
    status:
      result.ok && action !== 'hold'
        ? action === 'green'
          ? 'green'
          : 'red'
        : (previous?.status ??
          (typeof previous === 'string' ? previous : 'unknown')),
    recovery: state,
  };
}
