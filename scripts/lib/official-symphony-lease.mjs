/** Shared readback semantics: a queue entry or Linear state is not a worker. */
export function inspectOfficialLease(
  state,
  identifier,
  { nowMs, staleAfterMs, requireHeartbeat = false }
) {
  const observedAt = state?.observedAt ?? state?.generated_at;
  const observed = Date.parse(observedAt ?? '');
  const unknown = reason => ({ known: false, accepted: false, reason });
  if (!state) return unknown('symphony-state-missing');
  if (
    !Number.isFinite(observed) ||
    !['running', 'retrying', 'blocked'].every(k => Array.isArray(state[k]))
  )
    return unknown('symphony-state-malformed');
  if (nowMs - observed >= staleAfterMs || nowMs < observed - 30_000)
    return unknown('symphony-state-stale');
  const key = String(identifier ?? '').toUpperCase();
  const matches = ['running', 'retrying'].flatMap(kind =>
    state[kind]
      .filter(row => {
        const id =
          typeof row === 'string'
            ? row
            : [
                'issue',
                'identifier',
                'issueIdentifier',
                'issue_identifier',
                'linearIdentifier',
              ]
                .map(k => row?.[k])
                .find(Boolean);
        return String(id ?? '').toUpperCase() === key;
      })
      .map(row => ({ row, kind }))
  );
  if (matches.length > 1) return unknown('symphony-lease-conflict');
  const base = {
    known: true,
    accepted: false,
    reason: 'symphony-lease-readback-missing',
    source: state.source ?? 'official-symphony-state',
    observedAt,
  };
  const match = matches[0];
  if (!match) return base;
  const heartbeatAt = match.row?.last_event_at ?? match.row?.heartbeatAt;
  const heartbeat = Date.parse(heartbeatAt ?? '');
  const lease = match.row?.session_id ?? match.row?.leaseId;
  if (
    heartbeatAt &&
    (!Number.isFinite(heartbeat) ||
      nowMs - heartbeat >= staleAfterMs ||
      nowMs < heartbeat - 30_000)
  )
    return base;
  if (requireHeartbeat && (!lease || !Number.isFinite(heartbeat)))
    return unknown('worker-lease-unverified');
  return {
    ...base,
    accepted: true,
    reason: undefined,
    state: match.kind,
    owner: key,
    lease,
    heartbeatAt,
    expiresAt: Number.isFinite(heartbeat)
      ? new Date(heartbeat + staleAfterMs).toISOString()
      : null,
  };
}
