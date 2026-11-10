import type { MailboxStore } from './core.ts';

export type Liveness = {
  kind: string | null;
  connected: number;
  lastPingAt: number | null;
  lastActivityAt: number | null;
  /** Inbound poll, ack, receipt or stream sync; never sends or socket pings. */
  lastConsumerActivityAt: number | null;
  unhandled: number;
  oldestUnhandledAgeMs: number | null;
  lastProbe: { acceptedAt: number; receivedAt: number | null } | null;
};

/** Snapshot transport and consumer evidence without conflating the two. */
export function mailboxLiveness(
  ctx: DurableObjectState,
  store: MailboxStore,
  kind: string | null,
  now = Date.now()
): Liveness {
  let lastPingAt: number | null = null;
  const sockets = ctx.getWebSockets();
  for (const ws of sockets) {
    const at = ctx.getWebSocketAutoResponseTimestamp(ws)?.getTime() ?? null;
    if (at !== null && (lastPingAt === null || at > lastPingAt))
      lastPingAt = at;
  }
  const oldest = store.oldestUnacked();
  const activity = store.getMeta('lastActivityAt');
  const consumerActivity = store.getMeta('lastConsumerActivityAt');
  return {
    kind: kind,
    connected: sockets.length,
    lastPingAt,
    lastActivityAt: activity ? Number(activity) : null,
    lastConsumerActivityAt: consumerActivity ? Number(consumerActivity) : null,
    unhandled: store.unackedCount(),
    oldestUnhandledAgeMs: oldest ? now - oldest.acceptedAt : null,
    lastProbe: store.lastProbe(),
  };
}
