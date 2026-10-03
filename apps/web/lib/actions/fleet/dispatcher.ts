import {
  createHash,
  randomBytes,
  randomUUID,
  timingSafeEqual,
} from 'node:crypto';
import {
  type ActionChannel,
  type ActionErrorCode,
  type ActionReceipt,
  actionInvocationSchema,
  FLEET_ACTION_IDS,
  FLEET_SCOPES,
  type FleetActionId,
  fleetAuthoritySchema,
  fleetHistoryEntrySchema,
  fleetMissionSchema,
  fleetRequestSchema,
  fleetWorkerSchema,
  getActionDescriptor,
} from '@jovie/action-contracts';
import { z } from 'zod';
import {
  type ArchivedInvocation,
  type ArchivedLease,
  type ArchiveKind,
  compactFleetState,
  fleetArchiveKey,
  fleetHistoryKey,
  fleetHistoryPrefix,
  readArchiveValue,
} from './retention';
import {
  applySummerDecision,
  enqueueSummerRequest,
  FleetSummerError,
  type FleetSummerEvent,
  type FleetSummerState,
  installSummerDelegation,
  pendingSummerEvents,
  planSummerDecision,
  revokeSummerDelegation,
  summerDelegationInputSchema,
  summerUndelegationInputSchema,
} from './summer';

// One CAS document in Summer's existing operating store. PostgreSQL is the
// sole authority: no Redis failover/split-brain, no new dispatcher service.
export interface FleetBackend {
  compareAndSetWithRecords?(
    key: string,
    before: unknown,
    after: unknown,
    records: { key: string; value: unknown }[],
    ttlSeconds: number
  ): Promise<boolean>;
  listRecords?(
    prefix: string,
    after: string | undefined,
    limit: number
  ): Promise<{ key: string; value: unknown }[]>;
  get(key: string): Promise<unknown>;
  setIfAbsent(
    key: string,
    value: unknown,
    ttlSeconds: number
  ): Promise<boolean>;
  compareAndSet(
    key: string,
    before: unknown,
    after: unknown,
    ttlSeconds: number
  ): Promise<boolean>;
}
type Worker = z.infer<typeof fleetWorkerSchema>;
type Mission = z.infer<typeof fleetMissionSchema>;
type Authority = z.infer<typeof fleetAuthoritySchema>;
export type HelpRequest = z.infer<typeof fleetRequestSchema>;
export type FleetControlOperation =
  | 'provision'
  | 'rotate'
  | 'delegate'
  | 'undelegate'
  | 'revoke'
  | 'assign'
  | 'accept'
  | 'reject';
type Credential = {
  /** Absent only on credentials issued before rotation support. */
  credentialId?: string;
  digest: string;
  scopes: string[];
  expiresAt: string;
  revokedAt?: string;
  authority?: Authority;
};
export type Lease = {
  leaseId: string;
  workerId: string;
  mission: Mission;
  state: 'offered' | 'claimed' | 'reported';
  offeredAt: string;
  expiresAt: string;
  claimedAt?: string;
};
export type TerminalReceipt = {
  receiptId: string;
  workerId: string;
  missionId: string;
  leaseId: string;
  outcome: 'completed' | 'failed' | 'blocked';
  summary: string;
  evidence: Evidence[];
  reportedAt: string;
  durationMs: number;
};
type Evidence = { ref: string; summary: string };
export type FleetResult =
  | {
      status: 'completed';
      receipt: ActionReceipt;
      data: Record<string, unknown>;
    }
  | {
      status: 'unavailable' | 'failed';
      receipt: ActionReceipt;
      error: { code: ActionErrorCode; messageKey: string; retryable: boolean };
    }
  | { status: 'in_progress'; receipt: ActionReceipt; retryAfterMs: number };
export type InvocationRecord = {
  hash: string;
  result?: FleetResult;
  refresh?: true;
};
type DefectOperation = {
  attemptId: string;
  fingerprint: string;
  issueId: string;
  input: Record<string, unknown>;
  leaseId: string;
  workerId: string;
  startedAt: string;
  invocationId: string;
  hash: string;
  receipt: ActionReceipt;
};
export type FleetState = {
  schema: 'jovie.summer.fleet/v1';
  summer?: FleetSummerState;
  credentials: Record<string, Credential>;
  workers: Record<string, Worker>;
  missions: Record<string, Mission>;
  leases: Record<string, Lease>;
  /** Private issuance binding, never included in the public lease contract. */
  leaseCredentials: Record<string, string>;
  historySequences: Record<string, number>;
  requestWorkers: Record<string, string[]>;
  receiptHistoryRecorded: Record<string, boolean>;
  // Pending Summer deliveries pin their source until authoritative resolution.
  receipts: Record<string, TerminalReceipt>;
  invocations: Record<string, InvocationRecord>;
  defects: Record<string, Issue>;
  pendingDefects: Record<string, DefectOperation>;
  requests: Record<string, HelpRequest>;
  approvals: Record<
    string,
    { actor: string; hash: string; expiresAt: string; consumed?: boolean }
  >;
};
export type Issue = {
  issueId: string;
  identifier: string;
  url: string;
  fingerprint: string;
};
export interface FleetLinear {
  /** Search the configured team for the exact server-generated marker. */
  find(fingerprint: string, deterministicId: string): Promise<Issue | null>;
  /** Must use deterministicId as Linear's issueCreate input.id. */
  create(input: {
    id: string;
    fingerprint: string;
    title: string;
    description: string;
    authorize?: () => Promise<void>;
  }): Promise<Issue>;
  /** Append evidence with deterministic comment input.id; verify readback. */
  append(input: {
    id: string;
    issueId: string;
    body: string;
    authorize?: () => Promise<void>;
  }): Promise<void>;
  /** Read-only proof of this invocation's exact comment or original create body.
   * Adapters without this capability cannot acknowledge expired recovery.
   */
  verifyEvidence?(input: {
    id: string;
    issueId: string;
    fingerprint: string;
    body: string;
  }): Promise<boolean>;
}
export interface FleetDependencies {
  backend: FleetBackend;
  linear?: FleetLinear;
  now?: () => number;
  enabled: boolean;
}
class FleetError extends Error {
  constructor(
    readonly code: ActionErrorCode,
    readonly retryable = false
  ) {
    super(code);
  }
}
const CAPACITY = {
  workers: 100,
  missions: 200,
  receipts: 1000,
  invocations: 4000,
  approvals: 100,
  requests: 200,
};
const CLAIM_WINDOW_MS = 60_000;
const OPERATION_RETRY_MS = 30_000;
const STORE_TTL = 365 * 24 * 60 * 60;
function digest(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}
function stable(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stable).join(',')}]`;
  if (value && typeof value === 'object')
    return `{${Object.entries(value)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([k, v]) => `${JSON.stringify(k)}:${stable(v)}`)
      .join(',')}}`;
  return JSON.stringify(value) ?? 'null';
}
function equal(a: string, b: string): boolean {
  return (
    a.length === b.length && timingSafeEqual(Buffer.from(a), Buffer.from(b))
  );
}
function iso(ms: number) {
  return new Date(ms).toISOString();
}
function key(profileId: string) {
  return `ovie:mcp:v1:fleet:${profileId}`;
}
function empty(): FleetState {
  return {
    schema: 'jovie.summer.fleet/v1',
    credentials: {},
    workers: {},
    missions: {},
    leases: {},
    leaseCredentials: {},
    historySequences: {},
    requestWorkers: {},
    receiptHistoryRecorded: {},
    receipts: {},
    invocations: {},
    defects: {},
    pendingDefects: {},
    requests: {},
    approvals: {},
  };
}
function state(value: unknown): FleetState {
  if (value === null || value === undefined) return empty();
  if (
    typeof value !== 'object' ||
    (value as FleetState).schema !== 'jovie.summer.fleet/v1'
  )
    throw new FleetError('INTERNAL');
  const result = structuredClone(value as FleetState);
  result.requests ??= {};
  result.leaseCredentials ??= {};
  result.historySequences ??= {};
  result.requestWorkers ??= {};
  result.receiptHistoryRecorded ??= {};
  return result;
}
const acceptSchema = z
  .object({
    requestId: z.uuid(),
    owner: z.string().trim().min(1).max(100),
    founderIntentRef: z.string().min(1).max(500),
  })
  .strict();
const rejectSchema = z
  .object({
    requestId: z.uuid(),
    reason: z.enum([
      'capacity',
      'scope',
      'identity',
      'duplicate',
      'unavailable',
      'declined',
    ]),
  })
  .strict();
function liveCredential(c: Credential | undefined, now: number) {
  return !!c && !c.revokedAt && Date.parse(c.expiresAt) > now;
}
function fresh(worker: Worker, now: number) {
  return !worker.revoked && Date.parse(worker.updatedAt) > now - 300_000;
}
function within(
  authority: Authority,
  mission: Pick<
    Mission,
    'command' | 'maxDurationSeconds' | 'requiredTools' | 'requiredConnectors'
  >
) {
  return (
    authority.allowedCommands.includes(mission.command) &&
    mission.maxDurationSeconds <= authority.maxDurationSeconds &&
    mission.requiredTools.every(t => authority.allowedTools.includes(t)) &&
    mission.requiredConnectors.every(t =>
      authority.allowedConnectors.includes(t)
    )
  );
}
function visible(requester: Worker, peer: Worker) {
  return (
    !!peer.authority &&
    (requester.authority?.identity.role === 'operator' ||
      peer.authority.visibility === 'fleet')
  );
}
function compatible(
  s: FleetState,
  request: HelpRequest,
  peer: Worker,
  now: number
) {
  const requester = s.workers[request.requesterWorkerId];
  return (
    !!requester?.authority &&
    liveCredential(s.credentials[requester.workerId], now) &&
    !!peer.authority &&
    liveCredential(s.credentials[peer.workerId], now) &&
    fresh(peer, now) &&
    peer.workerId !== requester.workerId &&
    visible(requester, peer) &&
    within(peer.authority, request.proposal) &&
    peer.capabilities.includes(request.proposal.command) &&
    request.proposal.requiredTools.every(t => peer.tools.includes(t)) &&
    request.proposal.requiredConnectors.every(t =>
      peer.connectors.includes(t)
    ) &&
    peer.availability === 'available' &&
    ['work:next', 'work:claim', 'work:report'].every(scope =>
      s.credentials[peer.workerId].scopes.includes(scope)
    ) &&
    (!request.proposal.targetWorkerId ||
      request.proposal.targetWorkerId === peer.workerId)
  );
}
function requestView(
  s: FleetState,
  request: HelpRequest,
  now: number
): HelpRequest {
  const receipt =
    request.state === 'accepted'
      ? Object.values(s.receipts).find(r => r.missionId === request.requestId)
      : undefined;
  if (receipt)
    return {
      ...request,
      state: receipt.outcome as 'completed' | 'failed' | 'blocked',
      receipt: receipt as HelpRequest['receipt'],
    };
  if (
    ['rejected', 'completed', 'failed', 'blocked', 'expired'].includes(
      request.state
    )
  )
    return request;
  if (!liveCredential(s.credentials[request.requesterWorkerId], now))
    return { ...request, state: 'unavailable', reason: 'identity' };
  const target = request.proposal.targetWorkerId;
  if (target && !liveCredential(s.credentials[target], now))
    return { ...request, state: 'unavailable', reason: 'identity' };
  if (Date.parse(request.proposal.notAfter) <= now)
    return { ...request, state: 'expired' };
  if (
    target &&
    s.workers[target] &&
    (!fresh(s.workers[target], now) ||
      s.workers[target].availability === 'offline')
  )
    return { ...request, state: 'unavailable', reason: 'unavailable' };
  return request;
}
function admission(s: FleetState, input: unknown): Mission {
  const accepted = acceptSchema.parse(input);
  const request = s.requests[accepted.requestId];
  if (!request || request.state !== 'pending') throw new FleetError('CONFLICT');
  return fleetMissionSchema.parse({
    ...request.proposal,
    missionId: request.requestId,
    owner: accepted.owner,
    founderIntentRef: accepted.founderIntentRef,
  });
}
function uuidFrom(value: string): string {
  const h = digest(value);
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-4${h.slice(13, 16)}-a${h.slice(17, 20)}-${h.slice(20, 32)}`;
}
function boundedProjection<T>(items: T[], maxBytes: number): T[] {
  const result: T[] = [];
  let bytes = 2;
  for (const item of items) {
    const size = Buffer.byteLength(JSON.stringify(item)) + 1;
    if (bytes + size > maxBytes) break;
    result.push(item);
    bytes += size;
  }
  if (items.length && !result.length) throw new FleetError('INTERNAL');
  return result;
}
function capacity(records: Record<string, unknown>, limit: number) {
  if (Object.keys(records).length >= limit)
    throw new FleetError('QUOTA_EXHAUSTED');
}
function safeText(value: unknown): void {
  const text = stable(value);
  if (
    /(?:jovie-fleet-defect:|Bearer\s+[a-z0-9._-]+|jwf\.[a-z0-9.-]+|(?:api[_-]?key|password|access[_-]?token|secret)\s*[=:]\s*\S+|sk-(?:[a-z0-9]){16,})/i.test(
      text
    )
  )
    throw new FleetError('VALIDATION_FAILED');
}
function evidenceSafe(evidence: Evidence[]): void {
  safeText(evidence);
  for (const e of evidence) {
    let url: URL;
    try {
      url = new URL(e.ref);
    } catch {
      throw new FleetError('VALIDATION_FAILED');
    }
    if (
      !['https:', 'urn:'].includes(url.protocol) ||
      url.username ||
      url.password ||
      url.search ||
      url.hash
    )
      throw new FleetError('VALIDATION_FAILED');
  }
}
function active(lease: Lease, now: number): boolean {
  return lease.state !== 'reported' && Date.parse(lease.expiresAt) > now;
}
function authenticate(
  s: FleetState,
  token: string | undefined,
  profileId: string,
  scope: string | undefined,
  now: number
): string {
  const parts = token?.split('.');
  if (
    !parts ||
    parts.length !== 4 ||
    parts[0] !== 'jwf' ||
    parts[1] !== profileId ||
    !/^[a-z][a-z0-9-]{2,63}$/.test(parts[2]) ||
    !/^[A-Za-z0-9_-]{43}$/.test(parts[3])
  )
    throw new FleetError('AUTH_REQUIRED');
  const workerId = parts[2],
    credential = s.credentials[workerId];
  if (
    !credential ||
    !equal(credential.digest, digest(token!)) ||
    credential.revokedAt ||
    Date.parse(credential.expiresAt) <= now
  )
    throw new FleetError('AUTH_REQUIRED');
  if (scope && !credential.scopes.includes(scope))
    throw new FleetError('FORBIDDEN');
  return workerId;
}
export class FleetDispatcher {
  constructor(private readonly deps: FleetDependencies) {}
  private now() {
    return this.deps.now?.() ?? Date.now();
  }
  private async mutate<T>(
    profileId: string,
    fn: (s: FleetState) => T | Promise<T>
  ): Promise<T> {
    for (let attempt = 0; attempt < 12; attempt++) {
      const before = await this.deps.backend.get(key(profileId));
      const next = state(before),
        result = await fn(next);
      const archived = this.archival()
        ? compactFleetState(profileId, next, this.now())
        : [];
      const written =
        before === null || before === undefined
          ? await this.deps.backend.setIfAbsent(key(profileId), next, STORE_TTL)
          : archived.length > 0
            ? await this.deps.backend.compareAndSetWithRecords!(
                key(profileId),
                before,
                next,
                archived,
                STORE_TTL
              )
            : await this.deps.backend.compareAndSet(
                key(profileId),
                before,
                next,
                STORE_TTL
              );
      if (written) return result;
    }
    throw new FleetError('TEMPORARILY_UNAVAILABLE', true);
  }
  private archival() {
    return (
      !!this.deps.backend.compareAndSetWithRecords &&
      !!this.deps.backend.listRecords
    );
  }
  /** Called only inside an authenticated/approved CAS attempt. */
  private async archived<T>(
    profileId: string,
    kind: ArchiveKind,
    id: string
  ): Promise<T | undefined> {
    if (!this.archival()) return undefined;
    return readArchiveValue<T>(
      await this.deps.backend.get(fleetArchiveKey(profileId, kind, id)),
      kind,
      id
    );
  }
  private async history(
    profileId: string,
    workerId: string,
    after: number,
    limit: number
  ) {
    if (!this.archival()) return undefined;
    const rows = await this.deps.backend.listRecords!(
      fleetHistoryPrefix(profileId, workerId),
      fleetHistoryKey(profileId, workerId, after),
      limit + 1
    );
    const entries = boundedProjection(
      rows.slice(0, limit).map(row => fleetHistoryEntrySchema.parse(row.value)),
      256 * 1024
    );
    return {
      entries,
      nextCursor:
        rows.length > entries.length ? entries.at(-1)!.sequence : null,
    };
  }
  private async prepareInvocation(
    profileId: string,
    token: string | undefined,
    scope: string
  ) {
    if (!this.archival()) return;
    for (let attempt = 0; attempt < 12; attempt++) {
      const before = await this.deps.backend.get(key(profileId));
      const next = state(before);
      authenticate(next, token, profileId, scope, this.now());
      const rows = compactFleetState(profileId, next, this.now());
      if (rows.length === 0) return;
      if (
        await this.deps.backend.compareAndSetWithRecords!(
          key(profileId),
          before,
          next,
          rows,
          STORE_TTL
        )
      )
        return;
    }
    throw new FleetError('TEMPORARILY_UNAVAILABLE', true);
  }
  private receipt(
    id: FleetActionId,
    channel: ActionChannel,
    requestId: string
  ): ActionReceipt {
    return {
      executionId: randomUUID(),
      requestId,
      actionId: id,
      schemaVersion: 1,
      channel,
      status: 'completed',
      startedAt: iso(this.now()),
      completedAt: iso(this.now()),
    };
  }
  /** Internal control is only called after the existing founder session gate.
   * A short-lived approval binds actor, profile, operation and exact input.
   * Provisioning is never reachable with a worker bearer.
   */
  async approve(
    profileId: string,
    actor: string,
    operation: string,
    input: unknown
  ): Promise<string> {
    if (!this.deps.enabled) throw new FleetError('FEATURE_DISABLED');
    const id = randomUUID();
    await this.mutate(profileId, s => {
      for (const [k, a] of Object.entries(s.approvals))
        if (Date.parse(a.expiresAt) <= this.now()) delete s.approvals[k];
      capacity(s.approvals, CAPACITY.approvals);
      s.approvals[id] = {
        actor,
        hash: digest(stable({ profileId, operation, input })),
        expiresAt: iso(this.now() + 120_000),
      };
    });
    return id;
  }
  async control(
    profileId: string,
    actor: string,
    approvalId: string,
    operation: FleetControlOperation,
    input: unknown
  ): Promise<Record<string, unknown>> {
    if (!this.deps.enabled) throw new FleetError('FEATURE_DISABLED');
    const provisionSchema = z
      .object({
        workerId: z.string().regex(/^[a-z][a-z0-9-]{2,63}$/),
        scopes: z.array(z.enum(FLEET_SCOPES)).min(1).max(FLEET_SCOPES.length),
        expiresAt: z.iso.datetime(),
        authority: fleetAuthoritySchema.optional(),
      })
      .strict();
    const revokeSchema = z
      .object({ workerId: z.string().regex(/^[a-z][a-z0-9-]{2,63}$/) })
      .strict();
    const parsed = (
      operation === 'delegate'
        ? summerDelegationInputSchema
        : operation === 'undelegate'
          ? summerUndelegationInputSchema
          : operation === 'assign'
            ? fleetMissionSchema
            : operation === 'accept'
              ? acceptSchema
              : operation === 'reject'
                ? rejectSchema
                : operation === 'provision' || operation === 'rotate'
                  ? provisionSchema
                  : revokeSchema
    ).parse(input) as Record<string, unknown>;
    safeText(parsed);
    const token =
      operation === 'provision' || operation === 'rotate'
        ? `jwf.${profileId}.${parsed.workerId}.${randomBytes(32).toString('base64url')}`
        : undefined;
    return this.mutate(profileId, async s => {
      const approval = s.approvals[approvalId];
      if (
        !approval ||
        approval.actor !== actor ||
        approval.consumed ||
        Date.parse(approval.expiresAt) <= this.now() ||
        approval.hash !== digest(stable({ profileId, operation, input }))
      )
        throw new FleetError('CONFIRMATION_REQUIRED');
      if (operation === 'delegate') {
        const delegation = installSummerDelegation(
          s,
          profileId,
          actor,
          parsed,
          this.now()
        );
        approval.consumed = true;
        return { delegation };
      } else if (operation === 'undelegate') {
        revokeSummerDelegation(s, profileId, this.now());
      } else if (operation === 'provision' || operation === 'rotate') {
        const workerId = parsed.workerId as string;
        const previous = s.credentials[workerId];
        if (operation === 'provision' ? !!previous : !previous)
          throw new FleetError('CONFLICT');
        const expiry = Date.parse(parsed.expiresAt as string);
        if (expiry <= this.now() || expiry > this.now() + 30 * 24 * 60 * 60_000)
          throw new FleetError('VALIDATION_FAILED');
        if (operation === 'provision')
          capacity(s.credentials, CAPACITY.workers);
        const authority =
          (parsed.authority as Authority | undefined) ?? previous?.authority;
        // Rotating credentials cannot relabel another account/runtime as this
        // stable worker, nor erase an existing identity attestation.
        if (
          previous?.authority &&
          (!authority ||
            authority.identity.provider !==
              previous.authority.identity.provider ||
            authority.identity.accountRef !==
              previous.authority.identity.accountRef ||
            authority.identity.runtimeRef !==
              previous.authority.identity.runtimeRef)
        )
          throw new FleetError('FORBIDDEN');
        if (authority) {
          evidenceSafe([
            {
              ref: authority.identity.attestationRef,
              summary: 'Founder identity attestation',
            },
          ]);
          if (
            Object.entries(s.credentials).some(
              ([id, c]) =>
                id !== workerId &&
                liveCredential(c, this.now()) &&
                c.authority &&
                c.authority.identity.provider === authority.identity.provider &&
                c.authority.identity.accountRef ===
                  authority.identity.accountRef &&
                c.authority.identity.runtimeRef ===
                  authority.identity.runtimeRef
            )
          )
            throw new FleetError('CONFLICT');
        }
        s.credentials[workerId] = {
          credentialId: randomUUID(),
          digest: digest(token!),
          scopes: parsed.scopes as string[],
          expiresAt: parsed.expiresAt as string,
          ...(authority ? { authority } : {}),
        };
        if (operation === 'rotate') {
          const worker = s.workers[workerId];
          if (worker) {
            worker.scopes = parsed.scopes as Worker['scopes'];
            worker.authority = authority;
            worker.capabilities = [];
            worker.tools = [];
            worker.connectors = [];
            worker.availability = 'offline';
            worker.revoked = false;
            worker.updatedAt = iso(this.now());
          }
          for (const lease of Object.values(s.leases))
            if (lease.workerId === workerId && lease.state !== 'reported')
              lease.expiresAt = iso(this.now());
        }
      } else if (operation === 'revoke') {
        const credential = s.credentials[parsed.workerId as string];
        if (!credential) throw new FleetError('FORBIDDEN');
        credential.revokedAt = iso(this.now());
        const worker = s.workers[parsed.workerId as string];
        if (worker) worker.revoked = true;
        for (const lease of Object.values(s.leases))
          if (lease.workerId === parsed.workerId && lease.state !== 'reported')
            lease.expiresAt = iso(this.now());
      } else if (operation === 'reject') {
        const request = s.requests[parsed.requestId as string];
        if (!request || request.state !== 'pending')
          throw new FleetError('CONFLICT');
        request.state = 'rejected';
        request.reason = parsed.reason as HelpRequest['reason'];
      } else {
        const mission =
          operation === 'accept' ? admission(s, parsed) : (parsed as Mission);
        if (
          operation === 'accept' &&
          !Object.values(s.workers).some(w =>
            compatible(s, s.requests[mission.missionId], w, this.now())
          )
        )
          throw new FleetError('CONFLICT');
        if (
          Date.parse(mission.notAfter) <= this.now() ||
          (mission.command.startsWith('artist.') && !mission.argument)
        )
          throw new FleetError('VALIDATION_FAILED');
        if (
          s.missions[mission.missionId] ||
          (await this.archived(profileId, 'missions', mission.missionId))
        )
          throw new FleetError('CONFLICT');
        if (
          operation === 'assign' &&
          (s.requests[mission.missionId] ||
            (await this.archived(profileId, 'requests', mission.missionId)))
        )
          throw new FleetError('CONFLICT');
        // One active admission per canonical Linear issue avoids duplicate work.
        if (
          Object.values(s.missions).some(
            m =>
              m.issueId === mission.issueId &&
              Date.parse(m.notAfter) > this.now() &&
              !Object.values(s.receipts).some(r => r.missionId === m.missionId)
          )
        )
          throw new FleetError('CONFLICT');
        if (mission.targetWorkerId && !s.credentials[mission.targetWorkerId])
          throw new FleetError('FORBIDDEN');
        const targetAuthority = mission.targetWorkerId
          ? s.credentials[mission.targetWorkerId]?.authority
          : undefined;
        if (targetAuthority && !within(targetAuthority, mission))
          throw new FleetError('FORBIDDEN');
        capacity(s.missions, CAPACITY.missions);
        s.missions[mission.missionId] = mission;
        if (operation === 'accept')
          s.requests[mission.missionId].state = 'accepted';
      }
      approval.consumed = true;
      return operation === 'provision' || operation === 'rotate'
        ? {
            workerId: parsed.workerId,
            scopes: parsed.scopes,
            expiresAt: parsed.expiresAt,
            token,
          }
        : { operation, ...parsed };
    });
  }
  /** Founder-only projection reads the same state used by workers, no second fleet. */
  async inspect(
    profileId: string,
    history?: { workerId: string; after?: number; limit?: number }
  ) {
    const s = state(await this.deps.backend.get(key(profileId)));
    if (history && !s.credentials[history.workerId])
      throw new FleetError('FORBIDDEN');
    return {
      historyWorkers: Object.entries(s.historySequences).map(
        ([workerId, latestSequence]) => ({ workerId, latestSequence })
      ),
      ...(history
        ? {
            history: await this.history(
              profileId,
              history.workerId,
              history.after ?? 0,
              history.limit ?? 50
            ),
          }
        : {}),
      summer: s.summer ?? null,
      workers: Object.values(s.workers),
      missions: Object.values(s.missions),
      leases: Object.values(s.leases),
      receipts: Object.values(s.receipts),
      defects: Object.values(s.defects),
      requests: Object.values(s.requests).map(r =>
        requestView(s, r, this.now())
      ),
    };
  }
  /** Founder HTTP admission validates the exact immutable proposal with Linear. */
  async requestMission(profileId: string, input: unknown) {
    return admission(state(await this.deps.backend.get(key(profileId))), input);
  }
  /** OIDC route calls these methods only after exact founder-profile binding. */
  async pendingSummerEvents(profileId: string) {
    if (!this.deps.enabled) throw new FleetError('FEATURE_DISABLED');
    return pendingSummerEvents(
      state(await this.deps.backend.get(key(profileId)))
    );
  }
  async processSummerEvent(
    profileId: string,
    eventId: string,
    validateMission: (mission: unknown) => Promise<boolean>
  ) {
    if (!this.deps.enabled) throw new FleetError('FEATURE_DISABLED');
    const archivedDecision = async (s: FleetState) => {
      if (s.summer?.events[eventId]) return;
      const archived = await this.archived<FleetSummerEvent>(
        profileId,
        'summerEvents',
        eventId
      );
      if (!archived) return;
      if (!archived.receipt || archived.state === 'pending')
        throw new FleetSummerError('CONFLICT');
      // Reuse binding checks without restoring archived work to hot state.
      const replay = planSummerDecision(
        { ...s, summer: { events: { [eventId]: archived } } },
        profileId,
        eventId,
        this.now()
      );
      if (replay.kind !== 'terminal') throw new FleetSummerError('CONFLICT');
      return replay;
    };
    // Stamp before any provider read so one unavailable canonical issue cannot
    // monopolize repair. Attempt metadata is deliberately outside plan authority.
    const plan = await this.mutate(profileId, async s => {
      const replay = await archivedDecision(s);
      if (replay) return replay;
      const event = s.summer?.events[eventId];
      if (event?.state === 'pending') event.lastAttemptAt = iso(this.now());
      return planSummerDecision(s, profileId, eventId, this.now());
    });
    if (plan.kind === 'terminal')
      return { status: 'completed' as const, receipt: plan.receipt };
    if (plan.kind === 'blocked')
      return { status: 'blocked' as const, reason: plan.reason };
    // Provider reads are bounded by the existing Linear adapter. The exact plan
    // is rechecked in the final CAS; an OIDC wake never grants arbitrary work.
    const valid =
      plan.kind === 'accept' ? await validateMission(plan.mission) : false;
    const receipt = await this.mutate(
      profileId,
      async s =>
        (await archivedDecision(s))?.receipt ??
        applySummerDecision(
          s,
          profileId,
          eventId,
          plan.proof,
          valid,
          this.now()
        )
    );
    return { status: 'completed' as const, receipt };
  }
  async invoke(
    id: FleetActionId,
    raw: unknown,
    token: string | undefined
  ): Promise<FleetResult> {
    const descriptor = getActionDescriptor(id),
      parsed = actionInvocationSchema(descriptor.inputSchema).safeParse(raw);
    const fallback = this.receipt(id, 'cli', randomUUID());
    const fail = (error: unknown, receipt = fallback): FleetResult => ({
      status: 'unavailable',
      receipt: { ...receipt, status: 'unavailable' },
      error: {
        code:
          error instanceof FleetError || error instanceof FleetSummerError
            ? error.code
            : 'TEMPORARILY_UNAVAILABLE',
        messageKey: `errors.actions.fleet.${error instanceof FleetError || error instanceof FleetSummerError ? error.code : 'TEMPORARILY_UNAVAILABLE'}`,
        retryable: error instanceof FleetError ? error.retryable : true,
      },
    });
    if (!parsed.success) return fail(new FleetError('VALIDATION_FAILED'));
    const envelope = parsed.data,
      { profileId, channel } = envelope.context;
    const receipt = this.receipt(id, channel, envelope.idempotencyKey);
    if (!this.deps.enabled)
      return fail(new FleetError('FEATURE_DISABLED'), receipt);
    if (
      envelope.schemaVersion !== 1 ||
      !descriptor.supportedChannels.includes(channel)
    )
      return fail(new FleetError('VALIDATION_FAILED'), receipt);
    const scope = FLEET_SCOPES[FLEET_ACTION_IDS.indexOf(id)];
    const input = envelope.input as Record<string, unknown>,
      hash = digest(stable({ id, input }));
    let operation: DefectOperation | undefined;
    try {
      await this.prepareInvocation(profileId, token, scope);
      const result = await this.mutate(profileId, async s => {
        operation = undefined;
        const workerId = authenticate(s, token, profileId, scope, this.now());
        const credentialId = s.credentials[workerId].credentialId;
        // Preserve legacy replay IDs, but isolate every new credential issuance.
        // A narrowed credential must never inherit earlier successful responses.
        const invocationId = digest(
          `${profileId}:${workerId}:${id}:${envelope.idempotencyKey}${credentialId ? `:${credentialId}` : ''}`
        );
        const replay: ArchivedInvocation | undefined =
          s.invocations[invocationId] ??
          (await this.archived<ArchivedInvocation>(
            profileId,
            'invocations',
            invocationId
          )) ??
          (await this.archived<ArchivedInvocation>(
            profileId,
            'invocationRetries',
            invocationId
          ));
        if (replay) {
          if (replay.hash !== hash) throw new FleetError('CONFLICT');
          if (
            replay.result &&
            replay.result.status !== 'in_progress' &&
            id !== 'fleet.directory' &&
            id !== 'fleet.status'
          )
            return replay.result;
        }
        if (!s.invocations[invocationId])
          capacity(s.invocations, CAPACITY.invocations);
        safeText(input);
        let data: Record<string, unknown>;
        if (id === 'fleet.register') {
          if (input.workerId !== workerId) throw new FleetError('FORBIDDEN');
          const authority = s.credentials[workerId].authority;
          if (
            authority &&
            (!(input.capabilities as string[]).every(t =>
              authority.allowedCommands.includes(t as Mission['command'])
            ) ||
              !(input.tools as string[]).every(t =>
                authority.allowedTools.includes(t)
              ) ||
              !(input.connectors as string[]).every(t =>
                authority.allowedConnectors.includes(t)
              ))
          )
            throw new FleetError('FORBIDDEN');
          const worker = {
            ...input,
            scopes: s.credentials[workerId].scopes,
            registeredAt: s.workers[workerId]?.registeredAt ?? iso(this.now()),
            updatedAt: iso(this.now()),
            revoked: false,
            ...(authority ? { authority } : {}),
          } as Worker;
          s.workers[workerId] = worker;
          data = { worker };
        } else {
          const worker = s.workers[workerId];
          if (!worker) throw new FleetError('REQUIRES_INPUT');
          const current = Object.values(s.leases).find(
            l => l.workerId === workerId && active(l, this.now())
          );
          if (id === 'fleet.status') {
            const requests = Object.values(s.requests)
              .filter(
                r =>
                  r.requesterWorkerId === workerId ||
                  s.requestWorkers[r.requestId]?.includes(workerId) ||
                  Object.values(s.leases).some(
                    l =>
                      l.workerId === workerId &&
                      l.mission.missionId === r.requestId
                  )
              )
              .sort((a, b) =>
                a.requestId < b.requestId
                  ? -1
                  : a.requestId > b.requestId
                    ? 1
                    : 0
              );
            const remaining = requests.filter(
              r =>
                !input.requestsAfter ||
                r.requestId > String(input.requestsAfter)
            );
            const requestPage = boundedProjection(
              remaining.map(r => requestView(s, r, this.now())),
              128 * 1024
            );
            const receipts = Object.values(s.receipts)
              .filter(r => r.workerId === workerId)
              .sort((a, b) => b.reportedAt.localeCompare(a.reportedAt));
            const history = await this.history(
              profileId,
              workerId,
              Number(input.historyAfter ?? 0),
              Number(input.historyLimit ?? 50)
            );
            const historicalRequests =
              history?.entries.flatMap(entry =>
                entry.kind === 'request' ? [entry.request] : []
              ) ?? [];
            data = {
              worker,
              lease: current ?? null,
              receipts: boundedProjection(receipts, 128 * 1024),
              requests: boundedProjection(
                [...requestPage, ...historicalRequests],
                128 * 1024
              ),
              requestsNextCursor:
                requestPage.length < remaining.length
                  ? requestPage.at(-1)!.requestId
                  : null,
              ...(this.archival()
                ? {
                    history: {
                      ...history,
                      pending:
                        Object.values(s.receipts).some(
                          r =>
                            r.workerId === workerId &&
                            !s.receiptHistoryRecorded[r.receiptId]
                        ) ||
                        requests.some(r =>
                          [
                            'completed',
                            'failed',
                            'blocked',
                            'expired',
                            'rejected',
                          ].includes(requestView(s, r, this.now()).state)
                        ),
                    },
                  }
                : {}),
            };
          } else if (id === 'fleet.directory') {
            if (!worker.authority) throw new FleetError('REQUIRES_INPUT');
            data = {
              workers: Object.values(s.workers).filter(
                w =>
                  liveCredential(s.credentials[w.workerId], this.now()) &&
                  fresh(w, this.now()) &&
                  visible(worker, w)
              ),
              refreshedAt: iso(this.now()),
              limits: {
                maxPendingRequests: 5,
                maxRequestHorizonSeconds: 86400,
                heartbeatMaxAgeSeconds: 300,
              },
            };
          } else if (id === 'work.request') {
            if (!worker.authority) throw new FleetError('REQUIRES_INPUT');
            const proposal = input.proposal as HelpRequest['proposal'];
            if (
              !within(worker.authority, proposal) ||
              Date.parse(proposal.notAfter) <= this.now() ||
              Date.parse(proposal.notAfter) >
                Math.min(
                  this.now() + 86400000,
                  Date.parse(s.credentials[workerId].expiresAt)
                ) ||
              (proposal.command.startsWith('artist.') && !proposal.argument)
            )
              throw new FleetError('FORBIDDEN');
            evidenceSafe(
              proposal.existingWorkRefs.map(ref => ({
                ref,
                summary: 'Shared public work reference',
              }))
            );
            if (proposal.targetWorkerId) {
              const peer = s.workers[proposal.targetWorkerId];
              if (!peer || peer.workerId === workerId || !visible(worker, peer))
                throw new FleetError('FORBIDDEN');
            }
            const requestId = input.requestId as string;
            const previous =
              s.requests[requestId] ??
              (await this.archived<HelpRequest>(
                profileId,
                'requests',
                requestId
              ));
            if (previous) {
              if (
                previous.requesterWorkerId !== workerId ||
                stable({
                  requestId,
                  kind: previous.kind,
                  proposal: previous.proposal,
                }) !== stable(input)
              )
                throw new FleetError('CONFLICT');
              data = { request: requestView(s, previous, this.now()) };
            } else {
              if (
                s.missions[requestId] ||
                (await this.archived(profileId, 'missions', requestId)) ||
                Object.values(s.receipts).some(r => r.missionId === requestId)
              )
                throw new FleetError('CONFLICT');
              capacity(s.requests, CAPACITY.requests);
              if (
                Object.values(s.requests).filter(
                  r =>
                    r.requesterWorkerId === workerId &&
                    ['pending', 'accepted'].includes(r.state) &&
                    Date.parse(r.proposal.notAfter) > this.now() &&
                    !Object.values(s.receipts).some(
                      receipt => receipt.missionId === r.requestId
                    )
                ).length >= 5
              )
                throw new FleetError('QUOTA_EXHAUSTED');
              const request = fleetRequestSchema.parse({
                ...input,
                requesterWorkerId: workerId,
                createdAt: iso(this.now()),
                state: 'pending',
              });
              s.requests[requestId] = request;
              enqueueSummerRequest(s, profileId, request, this.now());
              data = { request };
            }
          } else if (id === 'work.next') {
            if (current) data = { lease: current };
            else {
              const mission =
                worker.availability === 'available'
                  ? Object.values(s.missions).find(
                      m =>
                        Date.parse(m.notAfter) > this.now() &&
                        (!m.targetWorkerId || m.targetWorkerId === workerId) &&
                        worker.capabilities.includes(m.command) &&
                        (!worker.authority ||
                          (fresh(worker, this.now()) &&
                            within(worker.authority, m))) &&
                        (!s.requests[m.missionId] ||
                          compatible(
                            s,
                            s.requests[m.missionId],
                            worker,
                            this.now()
                          )) &&
                        m.requiredTools.every(t => worker.tools.includes(t)) &&
                        m.requiredConnectors.every(t =>
                          worker.connectors.includes(t)
                        ) &&
                        ['work:claim', 'work:report'].every(t =>
                          s.credentials[workerId].scopes.includes(t)
                        ) &&
                        !Object.values(s.receipts).some(
                          r => r.missionId === m.missionId
                        ) &&
                        !Object.values(s.leases).some(
                          l =>
                            l.mission.missionId === m.missionId &&
                            active(l, this.now())
                        )
                    )
                  : undefined;
              if (!mission) data = { lease: null };
              else {
                const lease: Lease = {
                  leaseId: randomUUID(),
                  workerId,
                  mission,
                  state: 'offered',
                  offeredAt: iso(this.now()),
                  expiresAt: iso(
                    Math.min(
                      this.now() + CLAIM_WINDOW_MS,
                      Date.parse(mission.notAfter)
                    )
                  ),
                };
                capacity(s.leases, CAPACITY.receipts);
                s.leases[lease.leaseId] = lease;
                if (s.requests[mission.missionId])
                  s.requestWorkers[mission.missionId] = [
                    ...new Set([
                      ...(s.requestWorkers[mission.missionId] ?? []),
                      workerId,
                    ]),
                  ];
                if (credentialId)
                  s.leaseCredentials[lease.leaseId] = credentialId;
                data = { lease };
              }
            }
          } else {
            const leaseId = input.leaseId as string;
            const historic = s.leases[leaseId]
              ? undefined
              : await this.archived<ArchivedLease>(
                  profileId,
                  'leases',
                  leaseId
                );
            const lease = s.leases[leaseId] ?? historic?.lease;
            if (
              !lease ||
              lease.workerId !== workerId ||
              (historic
                ? historic.credentialId
                : s.leaseCredentials[lease.leaseId]) !== credentialId
            )
              throw new FleetError('FORBIDDEN');
            if (id === 'work.claim') {
              if (lease.state === 'reported' || !active(lease, this.now()))
                throw new FleetError('CONFLICT');
              if (lease.state === 'offered') {
                lease.state = 'claimed';
                lease.claimedAt = iso(this.now());
                lease.expiresAt = iso(
                  Math.min(
                    this.now() + lease.mission.maxDurationSeconds * 1000,
                    Date.parse(lease.mission.notAfter)
                  )
                );
              }
              data = { lease };
            } else if (id === 'work.report') {
              evidenceSafe(input.evidence as Evidence[]);
              const previous =
                Object.values(s.receipts).find(
                  r => r.leaseId === lease.leaseId
                ) ??
                (await this.archived<TerminalReceipt>(
                  profileId,
                  'receipts',
                  lease.leaseId
                ));
              if (previous) {
                if (
                  stable({
                    outcome: previous.outcome,
                    summary: previous.summary,
                    evidence: previous.evidence,
                  }) !==
                  stable({
                    outcome: input.outcome,
                    summary: input.summary,
                    evidence: input.evidence,
                  })
                )
                  throw new FleetError('CONFLICT');
                data = { receipt: previous };
              } else {
                if (lease.state !== 'claimed' || !active(lease, this.now()))
                  throw new FleetError('CONFLICT');
                capacity(s.receipts, CAPACITY.receipts);
                const terminal: TerminalReceipt = {
                  ...(input as Omit<
                    TerminalReceipt,
                    | 'receiptId'
                    | 'workerId'
                    | 'missionId'
                    | 'reportedAt'
                    | 'durationMs'
                  >),
                  receiptId: randomUUID(),
                  workerId,
                  missionId: lease.mission.missionId,
                  reportedAt: iso(this.now()),
                  durationMs: Math.max(
                    0,
                    this.now() - Date.parse(lease.claimedAt!)
                  ),
                };
                s.receipts[terminal.receiptId] = terminal;
                lease.state = 'reported';
                data = { receipt: terminal };
              }
            } else {
              if (!this.deps.linear)
                throw new FleetError('PROVIDER_UNAVAILABLE', true);
              evidenceSafe(input.evidence as Evidence[]);
              const fingerprint = digest(
                stable({
                  profileId,
                  command: String(input.command).trim().toLowerCase(),
                  apiCode: String(input.apiCode).trim().toUpperCase(),
                  title: String(input.title)
                    .trim()
                    .toLowerCase()
                    .replace(/\s+/g, ' '),
                })
              );
              const pending = s.pendingDefects[fingerprint];
              // New effects need a current lease. A previously admitted operation
              // may reconcile its deterministic provider ID after expiry, read-only.
              if (
                lease.state === 'offered' ||
                (Date.parse(lease.expiresAt) <= this.now() &&
                  pending?.invocationId !== invocationId)
              )
                throw new FleetError('CONFLICT');
              if (
                pending &&
                this.now() - Date.parse(pending.startedAt) < OPERATION_RETRY_MS
              ) {
                if (
                  pending.invocationId === invocationId &&
                  pending.hash !== hash
                )
                  throw new FleetError('CONFLICT');
                const waiting: FleetResult = {
                  status: 'in_progress',
                  receipt: { ...receipt, status: 'in_progress' },
                  retryAfterMs: OPERATION_RETRY_MS,
                };
                s.invocations[invocationId] = { hash, result: waiting };
                return waiting;
              }
              // Fence abandoned attempts and give the previous caller a terminal
              // answer. The replacement uses the same deterministic issue ID.
              if (pending && pending.invocationId !== invocationId)
                s.invocations[pending.invocationId] = {
                  hash: pending.hash,
                  result: fail(new FleetError('CONFLICT'), pending.receipt),
                };
              operation = {
                attemptId: randomUUID(),
                fingerprint,
                issueId:
                  (
                    s.defects[fingerprint] ??
                    (await this.archived<Issue>(
                      profileId,
                      'defects',
                      fingerprint
                    ))
                  )?.issueId ?? uuidFrom(`jovie-fleet-defect:${fingerprint}`),
                input,
                leaseId: lease.leaseId,
                workerId,
                startedAt: iso(this.now()),
                invocationId,
                hash,
                receipt:
                  pending?.invocationId === invocationId
                    ? pending.receipt
                    : receipt,
              };
              s.pendingDefects[fingerprint] = operation;
              const waiting: FleetResult = {
                status: 'in_progress',
                receipt: { ...operation.receipt, status: 'in_progress' },
                retryAfterMs: OPERATION_RETRY_MS,
              };
              // Bind worker/action/key to the exact canonical payload before effects.
              s.invocations[invocationId] = { hash, result: waiting };
              return waiting;
            }
          }
        }
        const complete: FleetResult = { status: 'completed', receipt, data };
        // Store cloned data: later lease transitions must not mutate old receipts.
        s.invocations[invocationId] =
          id === 'fleet.status' || id === 'fleet.directory'
            ? { hash, refresh: true }
            : { hash, result: structuredClone(complete) };
        return complete;
      });
      if (!operation) return result;
      const op = operation as DefectOperation;
      // Revocation is checked again before external effects. Linear IDs are
      // deterministic so a crash/timeout can reconcile without another issue.
      const authorize = async (write = false) => {
        const current = state(await this.deps.backend.get(key(profileId)));
        authenticate(current, token, profileId, scope, this.now());
        if (current.pendingDefects[op.fingerprint]?.attemptId !== op.attemptId)
          throw new FleetError('CONFLICT');
        const lease = current.leases[op.leaseId];
        if (
          !lease ||
          lease.workerId !== op.workerId ||
          lease.state === 'offered'
        )
          throw new FleetError('FORBIDDEN');
        const writable = Date.parse(lease.expiresAt) > this.now();
        if (write && !writable) throw new FleetError('CONFLICT');
        return writable;
      };
      await authorize();
      let issue = await this.deps.linear!.find(op.fingerprint, op.issueId);
      const writable = await authorize();
      const evidence = op.input.evidence as Evidence[];
      const body = `${op.input.details}\n\nWorker: ${op.workerId}\nLease: ${op.leaseId}\n${evidence.map(e => `${e.ref}: ${e.summary}`).join('\n')}`;
      if (!issue && !writable)
        return this.mutate(profileId, s => {
          authenticate(s, token, profileId, scope, this.now());
          if (s.pendingDefects[op.fingerprint]?.attemptId !== op.attemptId)
            throw new FleetError('CONFLICT');
          const terminal = fail(new FleetError('CONFLICT'), op.receipt);
          s.invocations[op.invocationId] = { hash: op.hash, result: terminal };
          delete s.pendingDefects[op.fingerprint];
          return terminal;
        });
      if (!issue) {
        await authorize(true);
        issue = await this.deps.linear!.create({
          id: op.issueId,
          fingerprint: op.fingerprint,
          title: String(op.input.title),
          description: body,
          authorize: async () => {
            await authorize(true);
          },
        });
      }
      if (issue.fingerprint !== op.fingerprint)
        throw new FleetError('CONFLICT');
      if (!writable) {
        const proven = await this.deps.linear!.verifyEvidence?.({
          id: uuidFrom(`jovie-fleet-comment:${op.invocationId}`),
          issueId: issue.issueId,
          fingerprint: op.fingerprint,
          body,
        });
        await authorize();
        if (proven !== true)
          return this.mutate(profileId, s => {
            authenticate(s, token, profileId, scope, this.now());
            if (s.pendingDefects[op.fingerprint]?.attemptId !== op.attemptId)
              throw new FleetError('CONFLICT');
            const terminal = fail(new FleetError('CONFLICT'), op.receipt);
            s.invocations[op.invocationId] = {
              hash: op.hash,
              result: terminal,
            };
            delete s.pendingDefects[op.fingerprint];
            return terminal;
          });
      }
      // Expired admissions only acknowledge already persisted evidence. They
      // cannot create a fresh issue or append evidence outside their work bound.
      if (writable) {
        await authorize(true);
        await this.deps.linear!.append({
          id: uuidFrom(`jovie-fleet-comment:${op.invocationId}`),
          issueId: issue.issueId,
          body,
          authorize: async () => {
            await authorize(true);
          },
        });
      }
      const resolved = issue;
      return await this.mutate(profileId, async s => {
        authenticate(s, token, profileId, scope, this.now());
        const pending = s.pendingDefects[op.fingerprint];
        if (pending?.attemptId !== op.attemptId)
          throw new FleetError('CONFLICT');
        const archived = await this.archived<Issue>(
          profileId,
          'defects',
          op.fingerprint
        );
        if (archived && archived.issueId !== resolved.issueId)
          throw new FleetError('CONFLICT');
        const complete: FleetResult = {
          status: 'completed',
          receipt: op.receipt,
          data: { ...resolved },
        };
        // Linear display metadata can change. Keep the immutable dedupe binding
        // archived; the new invocation receipt records the current projection.
        if (!archived) s.defects[op.fingerprint] = resolved;
        s.invocations[op.invocationId] = { hash: op.hash, result: complete };
        delete s.pendingDefects[op.fingerprint];
        return complete;
      });
    } catch (error) {
      return fail(error, receipt);
    }
  }
}
