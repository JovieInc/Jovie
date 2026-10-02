import { createHash, randomUUID } from 'node:crypto';
import {
  fleetMissionSchema,
  fleetRequestSchema,
  fleetWorkerSchema,
  workerIdSchema,
} from '@jovie/action-contracts';
import { z } from 'zod';
import { SUMMER_PRODUCTION } from '@/lib/ovie/summer-production-identity';

const commands = fleetMissionSchema.shape.command;
const reference = z
  .string()
  .min(1)
  .max(500)
  .refine(value => {
    try {
      const url = new URL(value);
      return (
        ['https:', 'urn:'].includes(url.protocol) &&
        !url.username &&
        !url.password &&
        !url.search &&
        !url.hash
      );
    } catch {
      return false;
    }
  });
export const summerDelegationInputSchema = z
  .object({
    workerIds: z.array(workerIdSchema).min(2).max(100),
    issueIds: z
      .array(z.string().regex(/^JOV-(?:[1-9][0-9]*)$/))
      .min(1)
      .max(50),
    allowedCommands: z.array(commands).min(1).max(4),
    maxDurationSeconds: z.number().int().min(30).max(3600),
    maxAdmissions: z.number().int().min(1).max(200),
    spendUsd: z.literal(0),
    expiresAt: z.iso.datetime(),
    owner: z.string().trim().min(1).max(100),
    founderIntentRef: reference,
  })
  .strict();
export const summerUndelegationInputSchema = z.object({}).strict();
type Worker = z.infer<typeof fleetWorkerSchema>;
type Request = z.infer<typeof fleetRequestSchema>;
type Mission = z.infer<typeof fleetMissionSchema>;
export type FleetSummerDelegation = z.infer<
  typeof summerDelegationInputSchema
> & {
  delegationId: string;
  profileId: string;
  principal: typeof SUMMER_PRODUCTION.serviceId;
  projectId: typeof SUMMER_PRODUCTION.projectId;
  grantedBy: string;
  grantedAt: string;
  admissions: number;
  revokedAt?: string;
};
export type FleetSummerReceipt = {
  receiptId: string;
  authority: 'delegated-summer';
  principal: typeof SUMMER_PRODUCTION.serviceId;
  projectId: typeof SUMMER_PRODUCTION.projectId;
  profileId: string;
  delegationId: string;
  founderIntentRef: string;
  /** Immutable authority snapshot survives later renewal/revocation. */
  delegation: FleetSummerDelegation;
  eventId: string;
  requestId: string;
  requestHash: string;
  outcome: 'accepted' | 'rejected' | 'canceled';
  reason?: string;
  missionId?: string;
  targetWorkerId?: string;
  decidedAt: string;
};
export type FleetSummerEvent = {
  eventId: string;
  requestId: string;
  delegationId: string;
  requestHash: string;
  state: 'pending' | 'completed' | 'canceled';
  createdAt: string;
  expiresAt: string;
  lastAttemptAt?: string;
  receipt?: FleetSummerReceipt;
};
export type FleetSummerState = {
  delegation?: FleetSummerDelegation;
  events: Record<string, FleetSummerEvent>;
};
export interface FleetSummerSnapshot {
  summer?: FleetSummerState;
  workers: Record<string, Worker>;
  credentials: Record<
    string,
    {
      scopes: string[];
      expiresAt: string;
      revokedAt?: string;
      authority?: Worker['authority'];
    }
  >;
  requests: Record<string, Request>;
  missions: Record<string, Mission>;
  leases: Record<
    string,
    { workerId: string; state: string; expiresAt: string }
  >;
  receipts: Record<string, { missionId: string }>;
}
export class FleetSummerError extends Error {
  constructor(
    readonly code:
      | 'FORBIDDEN'
      | 'CONFLICT'
      | 'VALIDATION_FAILED'
      | 'REQUIRES_INPUT'
  ) {
    super(code);
  }
}
function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  if (value && typeof value === 'object')
    return `{${Object.entries(value)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, child]) => `${JSON.stringify(key)}:${canonical(child)}`)
      .join(',')}}`;
  return JSON.stringify(value) ?? 'null';
}
function hash(value: unknown) {
  return createHash('sha256').update(canonical(value)).digest('hex');
}
function requestHash(request: Request) {
  return hash({
    requestId: request.requestId,
    requesterWorkerId: request.requesterWorkerId,
    kind: request.kind,
    proposal: request.proposal,
  });
}
function operator(
  s: FleetSummerSnapshot,
  workerId: string,
  now: number
): Worker | undefined {
  const worker = s.workers[workerId];
  const credential = s.credentials[workerId];
  return worker &&
    !worker.revoked &&
    credential &&
    !credential.revokedAt &&
    Date.parse(credential.expiresAt) > now &&
    credential.authority?.identity.role === 'operator' &&
    worker.authority?.identity.role === 'operator'
    ? worker
    : undefined;
}
function activeGrant(s: FleetSummerSnapshot, profileId: string, now: number) {
  const grant = s.summer?.delegation;
  return grant &&
    grant.profileId === profileId &&
    !grant.revokedAt &&
    grant.principal === SUMMER_PRODUCTION.serviceId &&
    grant.projectId === SUMMER_PRODUCTION.projectId &&
    Date.parse(grant.expiresAt) > now
    ? grant
    : undefined;
}
function within(worker: Worker, mission: Request['proposal']) {
  const authority = worker.authority;
  return (
    !!authority &&
    authority.allowedCommands.includes(mission.command) &&
    mission.maxDurationSeconds <= authority.maxDurationSeconds &&
    mission.requiredTools.every(tool =>
      authority.allowedTools.includes(tool)
    ) &&
    mission.requiredConnectors.every(connector =>
      authority.allowedConnectors.includes(connector)
    )
  );
}
function eligibleRequest(
  s: FleetSummerSnapshot,
  grant: FleetSummerDelegation,
  request: Request,
  now: number
) {
  const worker = operator(s, request.requesterWorkerId, now);
  return (
    !!worker &&
    grant.workerIds.includes(worker.workerId) &&
    within(worker, request.proposal) &&
    s.credentials[worker.workerId].scopes.includes('work:request') &&
    grant.issueIds.includes(request.proposal.issueId) &&
    grant.allowedCommands.includes(request.proposal.command) &&
    request.proposal.maxDurationSeconds <= grant.maxDurationSeconds &&
    (!request.proposal.targetWorkerId ||
      grant.workerIds.includes(request.proposal.targetWorkerId))
  );
}
/** Called only within the founder-approved profile CAS. No principal comes from input. */
export function installSummerDelegation(
  s: FleetSummerSnapshot,
  profileId: string,
  actor: string,
  raw: unknown,
  now: number
): FleetSummerDelegation {
  const input = summerDelegationInputSchema.parse(raw);
  if (
    Date.parse(input.expiresAt) <= now ||
    Date.parse(input.expiresAt) > now + 30 * 86400000 ||
    new Set(input.workerIds).size !== input.workerIds.length ||
    input.workerIds.some(id => !operator(s, id, now))
  )
    throw new FleetSummerError('FORBIDDEN');
  const grant: FleetSummerDelegation = {
    ...input,
    delegationId: randomUUID(),
    profileId,
    principal: SUMMER_PRODUCTION.serviceId,
    projectId: SUMMER_PRODUCTION.projectId,
    grantedBy: actor,
    grantedAt: new Date(now).toISOString(),
    admissions: 0,
  };
  s.summer ??= { events: {} };
  revokeSummerDelegation(s, profileId, now);
  s.summer.delegation = grant;
  for (const request of Object.values(s.requests))
    enqueueSummerRequest(s, profileId, request, now);
  return grant;
}
export function revokeSummerDelegation(
  s: FleetSummerSnapshot,
  profileId: string,
  now: number
) {
  const summer = s.summer;
  if (!summer) return;
  if (summer.delegation)
    summer.delegation.revokedAt = new Date(now).toISOString();
  for (const event of Object.values(summer.events)) {
    if (event.state !== 'pending') continue;
    settle(s, profileId, event, 'canceled', now, 'delegation-revoked');
  }
}
/** Request and wake are committed together. Customer requests cannot wake Summer. */
export function enqueueSummerRequest(
  s: FleetSummerSnapshot,
  profileId: string,
  request: Request,
  now: number
) {
  const grant = activeGrant(s, profileId, now);
  if (
    !grant ||
    request.state !== 'pending' ||
    Date.parse(request.proposal.notAfter) <= now ||
    !eligibleRequest(s, grant, request, now)
  )
    return;
  const events = s.summer!.events;
  const previous = events[request.requestId];
  // Keep the original decision audit. Replacing a delegation never silently
  // reopens a canceled or completed event under broader authority.
  if (previous) return;
  if (!previous && Object.keys(events).length >= 200)
    throw new FleetSummerError('CONFLICT');
  events[request.requestId] = {
    eventId: request.requestId,
    requestId: request.requestId,
    delegationId: grant.delegationId,
    requestHash: requestHash(request),
    state: 'pending',
    createdAt: new Date(now).toISOString(),
    expiresAt: new Date(
      Math.min(
        Date.parse(grant.expiresAt),
        Date.parse(request.proposal.notAfter)
      )
    ).toISOString(),
  };
}
export function pendingSummerEvents(
  s: FleetSummerSnapshot,
  limit = 5
): FleetSummerEvent[] {
  return Object.values(s.summer?.events ?? {})
    .filter(event => event.state === 'pending')
    .sort(
      (a, b) =>
        (a.lastAttemptAt ?? '').localeCompare(b.lastAttemptAt ?? '') ||
        a.createdAt.localeCompare(b.createdAt) ||
        a.eventId.localeCompare(b.eventId)
    )
    .slice(0, Math.min(5, Math.max(0, limit)));
}
export type SummerDecisionPlan =
  | { kind: 'terminal'; receipt: FleetSummerReceipt }
  | { kind: 'cancel'; proof: string; reason: string }
  | { kind: 'blocked'; reason: string }
  | { kind: 'accept'; proof: string; mission: Mission };
/** A wake carries IDs only; every authority and proposal is re-read here. */
export function planSummerDecision(
  s: FleetSummerSnapshot,
  profileId: string,
  eventId: string,
  now: number
): SummerDecisionPlan {
  const event = s.summer?.events[eventId];
  if (!event) throw new FleetSummerError('REQUIRES_INPUT');
  if (event.receipt) {
    const receipt = event.receipt;
    if (
      receipt.profileId !== profileId ||
      receipt.eventId !== eventId ||
      receipt.requestId !== event.requestId ||
      event.requestId !== eventId ||
      receipt.delegationId !== event.delegationId ||
      receipt.requestHash !== event.requestHash ||
      receipt.authority !== 'delegated-summer' ||
      receipt.principal !== SUMMER_PRODUCTION.serviceId ||
      receipt.projectId !== SUMMER_PRODUCTION.projectId
    )
      throw new FleetSummerError('FORBIDDEN');
    return { kind: 'terminal', receipt: event.receipt };
  }
  const grant = activeGrant(s, profileId, now);
  const request = s.requests[event.requestId];
  const proof = hash({
    event: { ...event, lastAttemptAt: undefined },
    grant,
    request,
  });
  if (!grant || grant.delegationId !== event.delegationId)
    return { kind: 'cancel', proof, reason: 'delegation-unavailable' };
  if (Date.parse(event.expiresAt) <= now)
    return { kind: 'cancel', proof, reason: 'event-expired' };
  if (
    !request ||
    request.state !== 'pending' ||
    requestHash(request) !== event.requestHash
  )
    return { kind: 'cancel', proof, reason: 'request-changed' };
  if (!eligibleRequest(s, grant, request, now))
    return { kind: 'cancel', proof, reason: 'request-outside-delegation' };
  if (grant.admissions >= grant.maxAdmissions)
    return { kind: 'blocked', reason: 'admission-budget' };
  const proposal = request.proposal;
  const worker = grant.workerIds
    .map(id => operator(s, id, now))
    .filter((value): value is Worker => !!value)
    .filter(value => value.workerId !== request.requesterWorkerId)
    .sort((a, b) => a.workerId.localeCompare(b.workerId))
    .find(
      value =>
        (!proposal.targetWorkerId ||
          proposal.targetWorkerId === value.workerId) &&
        value.availability === 'available' &&
        Date.parse(value.updatedAt) > now - 300000 &&
        within(value, proposal) &&
        value.capabilities.includes(proposal.command) &&
        proposal.requiredTools.every(tool => value.tools.includes(tool)) &&
        proposal.requiredConnectors.every(connector =>
          value.connectors.includes(connector)
        ) &&
        ['work:next', 'work:claim', 'work:report'].every(scope =>
          s.credentials[value.workerId].scopes.includes(scope)
        ) &&
        !Object.values(s.leases).some(
          lease =>
            lease.workerId === value.workerId &&
            lease.state !== 'reported' &&
            Date.parse(lease.expiresAt) > now
        )
    );
  if (!worker) return { kind: 'blocked', reason: 'worker-unavailable' };
  if (
    Object.values(s.missions).some(
      mission =>
        mission.issueId === proposal.issueId &&
        Date.parse(mission.notAfter) > now &&
        !Object.values(s.receipts).some(
          receipt => receipt.missionId === mission.missionId
        )
    )
  )
    return { kind: 'blocked', reason: 'existing-admission' };
  const mission = fleetMissionSchema.parse({
    ...proposal,
    missionId: request.requestId,
    owner: grant.owner,
    founderIntentRef: grant.founderIntentRef,
    targetWorkerId: worker.workerId,
    notAfter: new Date(
      Math.min(Date.parse(proposal.notAfter), Date.parse(grant.expiresAt))
    ).toISOString(),
  });
  return { kind: 'accept', proof: hash({ proof, mission }), mission };
}
function settle(
  s: FleetSummerSnapshot,
  profileId: string,
  event: FleetSummerEvent,
  outcome: FleetSummerReceipt['outcome'],
  now: number,
  reason?: string,
  mission?: Mission
) {
  const grant = s.summer?.delegation;
  if (!grant || grant.profileId !== profileId)
    throw new FleetSummerError('FORBIDDEN');
  const receipt: FleetSummerReceipt = {
    receiptId: randomUUID(),
    authority: 'delegated-summer',
    principal: SUMMER_PRODUCTION.serviceId,
    projectId: SUMMER_PRODUCTION.projectId,
    profileId,
    delegationId: event.delegationId,
    founderIntentRef: grant.founderIntentRef,
    delegation: structuredClone(grant),
    eventId: event.eventId,
    requestId: event.requestId,
    requestHash: event.requestHash,
    outcome,
    ...(reason ? { reason } : {}),
    ...(mission
      ? { missionId: mission.missionId, targetWorkerId: mission.targetWorkerId }
      : {}),
    decidedAt: new Date(now).toISOString(),
  };
  event.state = outcome === 'canceled' ? 'canceled' : 'completed';
  event.receipt = receipt;
  return receipt;
}
/** Final CAS revalidates scope, expiry, credentials, availability and exact plan. */
export function applySummerDecision(
  s: FleetSummerSnapshot,
  profileId: string,
  eventId: string,
  expectedProof: string,
  canonicalWorkValid: boolean,
  now: number
): FleetSummerReceipt {
  const plan = planSummerDecision(s, profileId, eventId, now);
  if (plan.kind === 'terminal') return plan.receipt;
  if (plan.kind === 'blocked' || plan.proof !== expectedProof)
    throw new FleetSummerError('CONFLICT');
  const event = s.summer!.events[eventId];
  if (plan.kind === 'cancel')
    return settle(s, profileId, event, 'canceled', now, plan.reason);
  const request = s.requests[event.requestId];
  if (!canonicalWorkValid) {
    request.state = 'rejected';
    request.reason = 'scope';
    return settle(
      s,
      profileId,
      event,
      'rejected',
      now,
      'canonical-work-invalid'
    );
  }
  if (
    s.missions[plan.mission.missionId] ||
    Object.keys(s.missions).length >= 200
  )
    throw new FleetSummerError('CONFLICT');
  s.missions[plan.mission.missionId] = plan.mission;
  request.state = 'accepted';
  s.summer!.delegation!.admissions++;
  return settle(s, profileId, event, 'accepted', now, undefined, plan.mission);
}
