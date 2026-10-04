import type {
  FleetResult,
  FleetState,
  HelpRequest,
  Lease,
  TerminalReceipt,
} from './dispatcher';

export type FleetArchiveWrite = { key: string; value: unknown };
export type FleetHistoryEntry =
  | { sequence: number; kind: 'receipt'; receipt: TerminalReceipt }
  | { sequence: number; kind: 'request'; request: HelpRequest };
export type ArchivedInvocation = {
  hash: string;
  result?: FleetResult;
  refresh?: true;
};
export type ArchivedLease = { lease: Lease; credentialId?: string };
export type ArchiveKind =
  | 'invocations'
  | 'invocationRetries'
  | 'missions'
  | 'requests'
  | 'leases'
  | 'receipts'
  | 'defects'
  | 'summerEvents';
const ARCHIVE_SCHEMA = 'jovie.summer.fleet.archive/v1';
const MAX_ARCHIVE_BATCH = 250;
export function fleetArchiveKey(
  profileId: string,
  kind: ArchiveKind,
  id: string
) {
  return `ovie:mcp:v1:fleet:${profileId}:archive:${kind}:${id}`;
}
export function fleetHistoryPrefix(profileId: string, workerId: string) {
  return `ovie:mcp:v1:fleet:${profileId}:history:${workerId}:`;
}
export function fleetHistoryKey(
  profileId: string,
  workerId: string,
  sequence: number
) {
  return `${fleetHistoryPrefix(profileId, workerId)}${String(sequence).padStart(16, '0')}`;
}
export function readArchiveValue<T>(
  value: unknown,
  kind: ArchiveKind,
  id: string
): T | undefined {
  if (value === null || value === undefined) return undefined;
  const record = value as {
    schema: string;
    kind: string;
    id: string;
    value: T;
  };
  if (
    record.schema !== ARCHIVE_SCHEMA ||
    record.kind !== kind ||
    record.id !== id
  )
    throw new Error('invalid_fleet_archive');
  return record.value;
}

/** Only committed, immutable outcomes leave the bounded operational document.
 * The returned rows and this document MUST commit in the same CAS transaction.
 * No TTL deletion, credential reset, or pending provider operation is cleanup.
 */
export function compactFleetState(
  profileId: string,
  s: FleetState,
  now: number
): FleetArchiveWrite[] {
  const rows: FleetArchiveWrite[] = [];
  const pendingLeases = new Set(
    Object.values(s.pendingDefects).map(p => p.leaseId)
  );
  const pendingInvocations = new Set(
    Object.values(s.pendingDefects).map(p => p.invocationId)
  );
  const pinnedRequests = new Set(
    Object.values(s.summer?.events ?? {})
      .filter(event => event.state === 'pending')
      .map(event => event.requestId)
  );
  for (const lease of Object.values(s.leases)) {
    const id = lease.mission.missionId;
    if (s.requests[id])
      s.requestWorkers[id] = [
        ...new Set([...(s.requestWorkers[id] ?? []), lease.workerId]),
      ];
  }
  const save = (
    kind: ArchiveKind,
    id: string,
    value: unknown,
    histories: {
      workerId: string;
      entry:
        | { kind: 'receipt'; receipt: TerminalReceipt }
        | { kind: 'request'; request: HelpRequest };
    }[] = []
  ) => {
    if (rows.length + 1 + histories.length > MAX_ARCHIVE_BATCH) return false;
    if (!rows.some(row => row.key === fleetArchiveKey(profileId, kind, id)))
      rows.push({
        key: fleetArchiveKey(profileId, kind, id),
        value: { schema: ARCHIVE_SCHEMA, kind, id, value },
      });
    for (const { workerId, entry } of histories) {
      const sequence = (s.historySequences[workerId] ?? 0) + 1;
      if (!Number.isSafeInteger(sequence))
        throw new Error('fleet_history_sequence_exhausted');
      s.historySequences[workerId] = sequence;
      rows.push({
        key: fleetHistoryKey(profileId, workerId, sequence),
        value: { ...entry, sequence },
      });
    }
    return true;
  };
  if (Object.keys(s.invocations).length >= 3000) {
    let archived = 0;
    for (const [id, invocation] of Object.entries(s.invocations)) {
      if (pendingInvocations.has(id)) continue;
      const retry = invocation.result?.status === 'in_progress';
      // Status/directory keys keep their exact payload binding, while invoke()
      // continues their existing refresh-on-replay semantics.
      if (
        !save(
          retry ? 'invocationRetries' : 'invocations',
          id,
          retry
            ? { hash: invocation.hash }
            : invocation.refresh ||
                ['fleet.status', 'fleet.directory'].includes(
                  invocation.result?.receipt.actionId ?? ''
                )
              ? { hash: invocation.hash, refresh: true }
              : invocation
        )
      )
        break;
      delete s.invocations[id];
      if (++archived >= 100) break;
    }
  }
  // Publish each receipt once even while its unexpired lease remains hot. All
  // outcomes are cursor-addressable; status need not return an unbounded list.
  for (const receipt of Object.values(s.receipts)) {
    if (s.receiptHistoryRecorded[receipt.receiptId]) continue;
    if (
      !save('receipts', receipt.leaseId, receipt, [
        { workerId: receipt.workerId, entry: { kind: 'receipt', receipt } },
      ])
    )
      break;
    s.receiptHistoryRecorded[receipt.receiptId] = true;
  }
  const workPressure =
    Object.keys(s.leases).length >= 750 ||
    Object.keys(s.receipts).length >= 750;
  {
    for (const [id, request] of Object.entries(s.requests)) {
      if (pinnedRequests.has(id)) continue;
      const leases = Object.values(s.leases).filter(
        l => l.mission.missionId === id
      );
      if (
        leases.some(
          l =>
            pendingLeases.has(l.leaseId) ||
            (l.state !== 'reported' && Date.parse(l.expiresAt) > now)
        )
      )
        continue;
      const receipt = Object.values(s.receipts).find(r => r.missionId === id);
      const terminal =
        request.state === 'accepted' && receipt
          ? {
              ...request,
              state: receipt.outcome as HelpRequest['state'],
              receipt,
            }
          : request.state === 'rejected'
            ? request
            : Date.parse(request.proposal.notAfter) <= now
              ? { ...request, state: 'expired' as const }
              : undefined;
      if (!terminal) continue;
      const audience = new Set([
        request.requesterWorkerId,
        ...(s.requestWorkers[id] ?? []),
        ...leases.map(l => l.workerId),
      ]);
      const summerEvent = s.summer?.events[id];
      if (
        rows.length + 1 + audience.size + (summerEvent ? 1 : 0) >
        MAX_ARCHIVE_BATCH
      )
        break;
      if (
        !save(
          'requests',
          id,
          terminal,
          [...audience].map(workerId => ({
            workerId,
            entry: { kind: 'request', request: terminal },
          }))
        )
      )
        break;
      if (summerEvent) {
        save('summerEvents', id, summerEvent);
        delete s.summer!.events[id];
      }
      delete s.requests[id];
      delete s.requestWorkers[id];
    }
  }
  {
    for (const [id, mission] of Object.entries(s.missions)) {
      if (pinnedRequests.has(id)) continue;
      if (
        Object.values(s.leases).some(
          l =>
            l.mission.missionId === id &&
            (pendingLeases.has(l.leaseId) ||
              (l.state !== 'reported' && Date.parse(l.expiresAt) > now))
        )
      )
        continue;
      if (
        Date.parse(mission.notAfter) > now &&
        !Object.values(s.receipts).some(r => r.missionId === id)
      )
        continue;
      if (!save('missions', id, mission)) break;
      delete s.missions[id];
    }
  }
  if (workPressure) {
    for (const [id, lease] of Object.entries(s.leases)) {
      if (pendingLeases.has(id) || pinnedRequests.has(lease.mission.missionId))
        continue;
      if (Date.parse(lease.expiresAt) > now) continue;
      // A receipt is still needed to suppress redispatch / project requester
      // completion until its mission and request have themselves been archived.
      const receipt = Object.values(s.receipts).find(r => r.leaseId === id);
      if (
        receipt &&
        (s.missions[lease.mission.missionId] ||
          s.requests[lease.mission.missionId])
      )
        continue;
      if (rows.length + (receipt ? 3 : 1) > MAX_ARCHIVE_BATCH) break;
      save('leases', id, {
        lease,
        ...(s.leaseCredentials[id]
          ? { credentialId: s.leaseCredentials[id] }
          : {}),
      } satisfies ArchivedLease);
      if (receipt) {
        save('receipts', id, receipt, [
          ...(s.receiptHistoryRecorded[receipt.receiptId]
            ? []
            : [
                {
                  workerId: receipt.workerId,
                  entry: { kind: 'receipt' as const, receipt },
                },
              ]),
        ]);
        delete s.receipts[receipt.receiptId];
        delete s.receiptHistoryRecorded[receipt.receiptId];
      }
      delete s.leases[id];
      delete s.leaseCredentials[id];
    }
  }
  if (Object.keys(s.defects).length >= 150) {
    for (const [fingerprint, issue] of Object.entries(s.defects)) {
      if (s.pendingDefects[fingerprint]) continue;
      if (!save('defects', fingerprint, issue)) break;
      delete s.defects[fingerprint];
    }
  }
  return rows;
}
