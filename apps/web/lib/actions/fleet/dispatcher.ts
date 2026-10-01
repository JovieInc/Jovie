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
  fleetMissionSchema,
  fleetWorkerSchema,
  getActionDescriptor,
} from '@jovie/action-contracts';
import { z } from 'zod';

// One CAS document in Summer's existing operating store. PostgreSQL is the
// sole authority: no Redis failover/split-brain, no new dispatcher service.
export interface FleetBackend {
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
type Credential = {
  digest: string;
  scopes: string[];
  expiresAt: string;
  revokedAt?: string;
};
type Lease = {
  leaseId: string;
  workerId: string;
  mission: Mission;
  state: 'offered' | 'claimed' | 'reported';
  offeredAt: string;
  expiresAt: string;
  claimedAt?: string;
};
type TerminalReceipt = {
  receiptId: string;
  workerId: string;
  missionId: string;
  leaseId: string;
  outcome: string;
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
type InvocationRecord = { hash: string; result: FleetResult };
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
type FleetState = {
  schema: 'jovie.summer.fleet/v1';
  credentials: Record<string, Credential>;
  workers: Record<string, Worker>;
  missions: Record<string, Mission>;
  leases: Record<string, Lease>;
  receipts: Record<string, TerminalReceipt>;
  invocations: Record<string, InvocationRecord>;
  defects: Record<string, Issue>;
  pendingDefects: Record<string, DefectOperation>;
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
    receipts: {},
    invocations: {},
    defects: {},
    pendingDefects: {},
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
  return structuredClone(value as FleetState);
}
function uuidFrom(value: string): string {
  const h = digest(value);
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-4${h.slice(13, 16)}-a${h.slice(17, 20)}-${h.slice(20, 32)}`;
}
function capacity(records: Record<string, unknown>, limit: number) {
  if (Object.keys(records).length >= limit)
    throw new FleetError('QUOTA_EXHAUSTED');
}
function safeText(value: unknown): void {
  const text = stable(value);
  if (
    /(?:jovie-fleet-defect:|Bearer\s+[a-z0-9._-]+|jwf\.[a-z0-9.-]+|(?:api[_-]?key|password|access[_-]?token|secret)\s*[=:]\s*\S+|sk-[a-z0-9]{16,})/i.test(
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
    fn: (s: FleetState) => T
  ): Promise<T> {
    for (let attempt = 0; attempt < 12; attempt++) {
      const before = await this.deps.backend.get(key(profileId));
      const next = state(before),
        result = fn(next);
      const written =
        before === null || before === undefined
          ? await this.deps.backend.setIfAbsent(key(profileId), next, STORE_TTL)
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
    operation: 'provision' | 'revoke' | 'assign',
    input: unknown
  ): Promise<Record<string, unknown>> {
    if (!this.deps.enabled) throw new FleetError('FEATURE_DISABLED');
    const provisionSchema = z
      .object({
        workerId: z.string().regex(/^[a-z][a-z0-9-]{2,63}$/),
        scopes: z.array(z.enum(FLEET_SCOPES)).min(1).max(6),
        expiresAt: z.iso.datetime(),
      })
      .strict();
    const revokeSchema = z
      .object({ workerId: z.string().regex(/^[a-z][a-z0-9-]{2,63}$/) })
      .strict();
    const parsed = (
      operation === 'assign'
        ? fleetMissionSchema
        : operation === 'provision'
          ? provisionSchema
          : revokeSchema
    ).parse(input) as Record<string, unknown>;
    safeText(parsed);
    const token =
      operation === 'provision'
        ? `jwf.${profileId}.${parsed.workerId}.${randomBytes(32).toString('base64url')}`
        : undefined;
    return this.mutate(profileId, s => {
      const approval = s.approvals[approvalId];
      if (
        !approval ||
        approval.actor !== actor ||
        approval.consumed ||
        Date.parse(approval.expiresAt) <= this.now() ||
        approval.hash !== digest(stable({ profileId, operation, input }))
      )
        throw new FleetError('CONFIRMATION_REQUIRED');
      if (operation === 'provision') {
        const workerId = parsed.workerId as string;
        if (s.credentials[workerId]) throw new FleetError('CONFLICT');
        const expiry = Date.parse(parsed.expiresAt as string);
        if (expiry <= this.now() || expiry > this.now() + 30 * 24 * 60 * 60_000)
          throw new FleetError('VALIDATION_FAILED');
        capacity(s.credentials, CAPACITY.workers);
        s.credentials[workerId] = {
          digest: digest(token!),
          scopes: parsed.scopes as string[],
          expiresAt: parsed.expiresAt as string,
        };
      } else if (operation === 'revoke') {
        const credential = s.credentials[parsed.workerId as string];
        if (!credential) throw new FleetError('FORBIDDEN');
        credential.revokedAt = iso(this.now());
        const worker = s.workers[parsed.workerId as string];
        if (worker) worker.revoked = true;
        for (const lease of Object.values(s.leases))
          if (lease.workerId === parsed.workerId && lease.state !== 'reported')
            lease.expiresAt = iso(this.now());
      } else {
        const mission = parsed as Mission;
        if (
          Date.parse(mission.notAfter) <= this.now() ||
          (mission.command.startsWith('artist.') && !mission.argument)
        )
          throw new FleetError('VALIDATION_FAILED');
        if (s.missions[mission.missionId]) throw new FleetError('CONFLICT');
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
        capacity(s.missions, CAPACITY.missions);
        s.missions[mission.missionId] = mission;
      }
      approval.consumed = true;
      return operation === 'provision'
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
  async inspect(profileId: string) {
    const s = state(await this.deps.backend.get(key(profileId)));
    return {
      workers: Object.values(s.workers),
      missions: Object.values(s.missions),
      leases: Object.values(s.leases),
      receipts: Object.values(s.receipts),
      defects: Object.values(s.defects),
    };
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
          error instanceof FleetError ? error.code : 'TEMPORARILY_UNAVAILABLE',
        messageKey: `errors.actions.fleet.${error instanceof FleetError ? error.code : 'TEMPORARILY_UNAVAILABLE'}`,
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
      const result = await this.mutate(profileId, s => {
        operation = undefined;
        const workerId = authenticate(s, token, profileId, scope, this.now());
        const invocationId = digest(
          `${profileId}:${workerId}:${id}:${envelope.idempotencyKey}`
        );
        const replay = s.invocations[invocationId];
        if (replay) {
          if (replay.hash !== hash) throw new FleetError('CONFLICT');
          if (replay.result.status !== 'in_progress') return replay.result;
        }
        if (!replay) capacity(s.invocations, CAPACITY.invocations);
        safeText(input);
        let data: Record<string, unknown>;
        if (id === 'fleet.register') {
          if (input.workerId !== workerId) throw new FleetError('FORBIDDEN');
          const worker = {
            ...input,
            scopes: s.credentials[workerId].scopes,
            registeredAt: s.workers[workerId]?.registeredAt ?? iso(this.now()),
            updatedAt: iso(this.now()),
            revoked: false,
          } as Worker;
          s.workers[workerId] = worker;
          data = { worker };
        } else {
          const worker = s.workers[workerId];
          if (!worker) throw new FleetError('REQUIRES_INPUT');
          const current = Object.values(s.leases).find(
            l => l.workerId === workerId && active(l, this.now())
          );
          if (id === 'fleet.status')
            data = {
              worker,
              lease: current ?? null,
              receipts: Object.values(s.receipts).filter(
                r => r.workerId === workerId
              ),
            };
          else if (id === 'work.next') {
            if (current) data = { lease: current };
            else {
              const mission =
                worker.availability === 'available'
                  ? Object.values(s.missions).find(
                      m =>
                        Date.parse(m.notAfter) > this.now() &&
                        (!m.targetWorkerId || m.targetWorkerId === workerId) &&
                        worker.capabilities.includes(m.command) &&
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
                data = { lease };
              }
            }
          } else {
            const lease = s.leases[input.leaseId as string];
            if (!lease || lease.workerId !== workerId)
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
              const previous = Object.values(s.receipts).find(
                r => r.leaseId === lease.leaseId
              );
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
                  s.defects[fingerprint]?.issueId ??
                  uuidFrom(`jovie-fleet-defect:${fingerprint}`),
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
        s.invocations[invocationId] = {
          hash,
          result: structuredClone(complete),
        };
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
      return await this.mutate(profileId, s => {
        authenticate(s, token, profileId, scope, this.now());
        const pending = s.pendingDefects[op.fingerprint];
        if (pending?.attemptId !== op.attemptId)
          throw new FleetError('CONFLICT');
        const complete: FleetResult = {
          status: 'completed',
          receipt: op.receipt,
          data: { ...resolved },
        };
        s.defects[op.fingerprint] = resolved;
        s.invocations[op.invocationId] = { hash: op.hash, result: complete };
        delete s.pendingDefects[op.fingerprint];
        return complete;
      });
    } catch (error) {
      return fail(error, receipt);
    }
  }
}
