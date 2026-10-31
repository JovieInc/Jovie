import { DurableObject } from 'cloudflare:workers';
import {
  type Delivered,
  type EnqueueResult,
  type Envelope,
  LIMITS,
  MailboxStore,
  project,
  sha256Hex,
} from './core.ts';
import type { Env } from './env.ts';
import { backoffFor, isOpen, Outbox, type RecipientStatus } from './outbox.ts';

const SWEEP_MS = 5 * 60_000;
/** Only statuses that mean "this message is bad", never "the route is not ready". */
const WEBHOOK_TERMINAL = new Set([400, 409, 413, 422]);
/** Webhook retry ladder for pushes to Summer (serverless, cannot hold a socket). */
const WEBHOOK_BACKOFF_MS = [5_000, 15_000, 60_000, 300_000, 900_000] as const;

export type MailboxConfig = {
  kind: string;
  fallback: string | null;
  deadAfterMs: number;
};

export type Liveness = {
  kind: string | null;
  connected: number;
  lastPingAt: number | null;
  lastActivityAt: number | null;
  unhandled: number;
  oldestUnhandledAgeMs: number | null;
  lastProbe: { acceptedAt: number; receivedAt: number | null } | null;
};

/**
 * One Durable Object per agent kind: its inbox, its send intents (outbox), its
 * sockets and its timers. All state is in DO SQLite; in-memory state (waiters)
 * is an optimisation that a restart may drop without losing any message.
 */
export class Mailbox extends DurableObject<Env> {
  private readonly store: MailboxStore;
  private readonly outbox: Outbox;
  private readonly waiters = new Set<() => void>();

  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
    this.store = new MailboxStore(ctx.storage.sql);
    this.outbox = new Outbox(ctx.storage.sql);
    // App-level "ping" text frames are answered without waking the DO; the
    // per-socket auto-response timestamp is the liveness signal.
    ctx.setWebSocketAutoResponse(
      new WebSocketRequestResponsePair('ping', 'pong')
    );
  }

  private config(): MailboxConfig | null {
    const raw = this.store.getMeta('config');
    return raw ? (JSON.parse(raw) as MailboxConfig) : null;
  }

  async configure(config: MailboxConfig): Promise<void> {
    this.store.setMeta('config', JSON.stringify(config));
    this.outbox.schedule('sweep', Date.now() + SWEEP_MS);
    await this.arm();
  }

  private touch(now = Date.now()) {
    this.store.setMeta('lastActivityAt', String(now));
  }

  private async arm(): Promise<void> {
    const due = this.outbox.nextDue();
    if (due === null) return;
    const current = await this.ctx.storage.getAlarm();
    if (current === null || current > due) await this.ctx.storage.setAlarm(due);
  }

  /** Recipient side: store one message, then push it to open sockets. */
  async enqueue(envelope: Envelope): Promise<EnqueueResult> {
    const result = this.store.enqueue(envelope);
    if (result.ok && !result.replay) {
      this.push();
      for (const wake of this.waiters) wake();
      if (this.isWebhookTarget()) this.outbox.schedule('webhook', Date.now());
      this.outbox.schedule('sweep', Date.now() + SWEEP_MS);
      await this.arm();
    }
    return result;
  }

  /**
   * Sender side: commit the intent once, attempt the fan-out now, and leave
   * anything unfinished to the alarm. 202 means durably committed.
   */
  async submit(
    envelope: Envelope,
    recipients: readonly string[]
  ): Promise<
    | { ok: true; replay: boolean; recipients: RecipientStatus[] }
    | { ok: false; status: number; code: string }
  > {
    const now = Date.now();
    this.touch(now);
    const committed = this.outbox.commit(envelope, recipients, now);
    if (!committed.ok) return committed;
    const intent = await this.fanOut(committed.intent.id);
    return {
      ok: true,
      replay: committed.replay,
      recipients: intent?.recipients ?? committed.intent.recipients,
    };
  }

  private async fanOut(id: string) {
    const intent = this.outbox.get(id);
    if (!intent) return null;
    const now = Date.now();
    await Promise.all(
      intent.recipients.filter(isOpen).map(async status => {
        status.attempts++;
        try {
          const stub = this.env.MAILBOX.get(
            this.env.MAILBOX.idFromName(status.to)
          );
          const result = await stub.enqueue({
            ...intent.envelope,
            to: status.to,
          });
          if (result.ok) {
            status.state = result.replay ? 'replay' : 'stored';
            status.seq = result.seq;
          } else if (result.status === 409) status.state = 'conflict';
          else if (result.status === 507) status.state = 'full';
        } catch {
          // Transport/DO error: stays pending; the alarm retries with backoff.
        }
      })
    );
    this.outbox.update(intent, now);
    const open = intent.recipients.filter(isOpen);
    if (open.length) {
      const attempts = Math.max(...open.map(status => status.attempts));
      this.outbox.schedule('fanout', now + backoffFor(attempts));
      await this.arm();
    }
    return intent;
  }

  /** Agent read (`mesh read`/long-poll): claim unhandled messages, waiting up to `wait` s. */
  async poll(waitSeconds: number, limit: number) {
    this.touch();
    let messages = this.store.claim(Date.now(), limit);
    const wait = Math.min(Math.max(waitSeconds, 0), LIMITS.longPollMaxSeconds);
    if (!messages.length && wait > 0) {
      await new Promise<void>(resolve => {
        const done = () => {
          clearTimeout(timer);
          this.waiters.delete(done);
          resolve();
        };
        const timer = setTimeout(done, wait * 1000);
        this.waiters.add(done);
      });
      messages = this.store.claim(Date.now(), limit);
    }
    return messages.map(project);
  }

  async history(since: number, limit: number) {
    this.touch();
    return this.store.history(since, limit).map(project);
  }

  async ack(ids: string[]) {
    this.touch();
    return this.store.ack(ids, Date.now());
  }

  async receipt(ids: string[]) {
    this.touch();
    return this.store.receipt(ids, Date.now());
  }

  async metrics(since: number) {
    return this.store.latencies(since);
  }

  async liveness(): Promise<Liveness> {
    const now = Date.now();
    let lastPingAt: number | null = null;
    const sockets = this.ctx.getWebSockets();
    for (const ws of sockets) {
      const at =
        this.ctx.getWebSocketAutoResponseTimestamp(ws)?.getTime() ?? null;
      if (at !== null && (lastPingAt === null || at > lastPingAt))
        lastPingAt = at;
    }
    const oldest = this.store.oldestUnacked();
    const activity = this.store.getMeta('lastActivityAt');
    return {
      kind: this.config()?.kind ?? null,
      connected: sockets.length,
      lastPingAt,
      lastActivityAt: activity ? Number(activity) : null,
      unhandled: this.store.unackedCount(),
      oldestUnhandledAgeMs: oldest ? now - oldest.acceptedAt : null,
      lastProbe: this.store.lastProbe(),
    };
  }

  /** WebSocket stream for a relay: pushes everything not yet received. */
  async fetch(request: Request): Promise<Response> {
    if (request.headers.get('Upgrade') !== 'websocket')
      return new Response('expected websocket', { status: 426 });
    if (this.ctx.getWebSockets().length >= LIMITS.socketsPerKind)
      return new Response('too many sockets', { status: 429 });
    const pair = new WebSocketPair();
    const [client, server] = Object.values(pair) as [WebSocket, WebSocket];
    this.ctx.acceptWebSocket(server);
    this.touch();
    this.sendBatch(server, this.store.unreceived(Date.now()));
    return new Response(null, { status: 101, webSocket: client });
  }

  private sendBatch(ws: WebSocket, messages: Delivered[]) {
    if (!messages.length) return;
    try {
      ws.send(
        JSON.stringify({ type: 'messages', messages: messages.map(project) })
      );
    } catch {
      // Dead socket: the message stays unreceived and is resent on reconnect.
    }
  }

  private push() {
    const sockets = this.ctx.getWebSockets();
    if (!sockets.length) return;
    const batch = this.store.unreceived(Date.now());
    for (const ws of sockets) this.sendBatch(ws, batch);
  }

  async webSocketMessage(ws: WebSocket, raw: string | ArrayBuffer) {
    this.touch();
    let frame: { type?: string; ids?: unknown };
    try {
      frame = JSON.parse(
        typeof raw === 'string' ? raw : new TextDecoder().decode(raw)
      );
    } catch {
      return;
    }
    const ids = Array.isArray(frame.ids)
      ? frame.ids
          .filter((id): id is string => typeof id === 'string')
          .slice(0, 500)
      : [];
    if (frame.type === 'receipt') this.store.receipt(ids, Date.now());
    else if (frame.type === 'ack') this.store.ack(ids, Date.now());
    else if (frame.type === 'sync')
      this.sendBatch(ws, this.store.unreceived(Date.now()));
  }

  async webSocketClose(ws: WebSocket, code: number) {
    try {
      ws.close(code === 1005 ? 1000 : code, 'closed');
    } catch {
      // already closed
    }
  }

  private isWebhookTarget(): boolean {
    return (
      this.config()?.kind === 'summer' &&
      Boolean(
        this.env.SUMMER_HUB_WEBHOOK_URL && this.env.SUMMER_HUB_WEBHOOK_SECRET
      )
    );
  }

  async alarm(): Promise<void> {
    const now = Date.now();
    const due = this.outbox.dueTasks(now);
    try {
      for (const task of due) this.outbox.schedule(task, null);
      if (due.includes('fanout'))
        for (const intent of this.outbox.open()) await this.fanOut(intent.id);
      if (due.includes('sweep')) await this.sweep(now);
      if (due.includes('webhook')) await this.pushWebhook(now);
    } finally {
      // Re-arm before returning so a failing task can never stop the timers.
      await this.arm();
    }
  }

  private async sweep(now: number) {
    const config = this.config();
    this.store.purge(now);
    if (config) {
      for (const dead of this.store.sweepDead(now, config.deadAfterMs))
        await this.notifyDead(config, dead);
    }
    if (this.store.unackedCount() > 0 || this.outbox.open(1).length)
      this.outbox.schedule('sweep', now + SWEEP_MS);
  }

  /** DLQ: one deterministic wrapper per dead message to the fallback owner. */
  private async notifyDead(config: MailboxConfig, dead: Delivered) {
    const fallback =
      config.fallback && config.fallback !== config.kind
        ? config.fallback
        : null;
    const body = JSON.stringify({
      schema: 'jovie.mesh-undeliverable/v1',
      originalId: dead.id,
      originalTo: config.kind,
      from: dead.from,
      acceptedAt: new Date(dead.acceptedAt).toISOString(),
      note: `Unhandled by ${config.kind} after ${Math.round(config.deadAfterMs / 3_600_000)}h. The original stays queued for ${config.kind}; reply on the mesh if you take it over.`,
      quotedBody: JSON.stringify(dead.body.slice(0, 2500)),
    });
    const wrapper: Envelope = {
      id: `mesh-hub:dlq:${config.kind}:${dead.seq}`,
      from: 'mesh-hub',
      to: fallback ?? config.kind,
      correlationId: `dlq:${config.kind}:${dead.seq}`,
      sha256: await sha256Hex(body),
      body,
      refs: [],
      inReplyTo: dead.id,
      sentAt: null,
      acceptedAt: Date.now(),
      kind: 'undeliverable',
    };
    const registry = this.env.REGISTRY.get(
      this.env.REGISTRY.idFromName('registry')
    );
    await registry.recordEvent('message.dead', config.kind, {
      id: dead.id,
      from: dead.from,
      fallback,
    });
    if (fallback) {
      const stub = this.env.MAILBOX.get(this.env.MAILBOX.idFromName(fallback));
      await stub.enqueue(wrapper);
    }
  }

  /** Push to Summer's webhook; 2xx = received (not handled). 4xx is terminal. */
  private async pushWebhook(now: number) {
    if (!this.isWebhookTarget()) return;
    const url = this.env.SUMMER_HUB_WEBHOOK_URL as string;
    const secret = this.env.SUMMER_HUB_WEBHOOK_SECRET as string;
    const batch = this.store
      .unreceived(now, 10)
      .filter(m => m.kind !== 'probe');
    let failures = Number(this.store.getMeta('webhookFailures') ?? 0);
    for (const message of batch) {
      const payload = JSON.stringify(project(message));
      const ts = String(Math.floor(Date.now() / 1000));
      const signature = await hmac(
        secret,
        `${ts}|${message.id}|${message.sha256}`
      );
      let status = 0;
      try {
        const response = await fetch(url, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-Mesh-Timestamp': ts,
            'X-Mesh-Id': message.id,
            'X-Mesh-Signature': signature,
          },
          body: payload,
          signal: AbortSignal.timeout(10_000),
        });
        status = response.status;
      } catch {
        status = 0;
      }
      if (status >= 200 && status < 300) {
        this.store.receipt([message.id], Date.now());
        failures = 0;
      } else if (WEBHOOK_TERMINAL.has(status)) {
        // Poison (the message itself is unacceptable): mark received so it cannot
        // block the queue, and alarm. 401/404/408/429/5xx are config or deploy
        // lag and keep retrying; never strand a message on a missing route.
        this.store.receipt([message.id], Date.now());
        const registry = this.env.REGISTRY.get(
          this.env.REGISTRY.idFromName('registry')
        );
        await registry.recordEvent('webhook.rejected', 'summer', {
          id: message.id,
          status,
        });
      } else {
        failures++;
        break;
      }
    }
    this.store.setMeta('webhookFailures', String(failures));
    const remaining = this.store
      .unreceived(now, 1)
      .some(m => m.kind !== 'probe');
    if (failures > 0)
      this.outbox.reschedule(
        'webhook',
        Date.now() +
          (WEBHOOK_BACKOFF_MS[
            Math.min(failures - 1, WEBHOOK_BACKOFF_MS.length - 1)
          ] as number)
      );
    else if (remaining) this.outbox.reschedule('webhook', Date.now() + 1_000);
  }
}

async function hmac(secret: string, text: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );
  const signature = await crypto.subtle.sign(
    'HMAC',
    key,
    new TextEncoder().encode(text)
  );
  return [...new Uint8Array(signature)]
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');
}
