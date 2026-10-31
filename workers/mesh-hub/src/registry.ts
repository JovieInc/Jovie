import { DurableObject } from 'cloudflare:workers';
import {
  type Detail,
  type Envelope,
  KIND,
  LIMITS,
  percentile,
  SHA256,
  SYSTEM_KINDS,
  sha256Hex,
} from './core.ts';
import type { Env } from './env.ts';
import type { Liveness } from './mailbox.ts';
import {
  type AgentState,
  evaluatePresence,
  evaluateProbe,
  PROBE,
} from './presence.ts';

export type AgentEntry = {
  kind: string;
  tokenSha256: string;
  owner?: string | null;
  status?: 'active' | 'revoked';
  /** Who gets this agent's undelivered mail (default summer; never itself). */
  fallback?: string | null;
  /** Heartbeat contract in seconds; null = dormant (no silence alarm). */
  heartbeatSec?: number | null;
  probe?: boolean;
  deadAfterHours?: number | null;
};

/** Events that page someone; everything else is recorded only. */
const ALERTING = new Set([
  'agent.silent',
  'agent.unreachable',
  'message.dead',
  'webhook.rejected',
  'hub.suspect',
]);
const TOUCH_DEBOUNCE_MS = 15_000;

const SCHEMA = [
  `CREATE TABLE IF NOT EXISTS agents (
    kind TEXT PRIMARY KEY,
    token_sha256 TEXT NOT NULL UNIQUE,
    owner TEXT,
    status TEXT NOT NULL DEFAULT 'active',
    fallback TEXT,
    heartbeat_sec INTEGER,
    probe INTEGER NOT NULL DEFAULT 0,
    dead_after_ms INTEGER,
    last_seen_at INTEGER,
    state TEXT NOT NULL DEFAULT 'unknown',
    state_changed_at INTEGER,
    probe_misses INTEGER NOT NULL DEFAULT 0,
    probe_rtt_ms INTEGER,
    updated_at INTEGER NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS events (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    at INTEGER NOT NULL,
    type TEXT NOT NULL,
    kind TEXT,
    detail TEXT NOT NULL DEFAULT '{}'
  )`,
  'CREATE TABLE IF NOT EXISTS meta (k TEXT PRIMARY KEY, v TEXT NOT NULL)',
];

export class Registry extends DurableObject<Env> {
  private readonly sql: SqlStorage;

  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
    this.sql = ctx.storage.sql;
    for (const statement of SCHEMA) this.sql.exec(statement);
  }

  private mailbox(kind: string) {
    return this.env.MAILBOX.get(this.env.MAILBOX.idFromName(kind));
  }

  private meta(key: string): string | null {
    return (
      (this.sql.exec('SELECT v FROM meta WHERE k = ?', key).toArray()[0]?.v as
        | string
        | undefined) ?? null
    );
  }

  private setMeta(key: string, value: string) {
    this.sql.exec(
      'INSERT INTO meta (k, v) VALUES (?, ?) ON CONFLICT(k) DO UPDATE SET v = excluded.v',
      key,
      value
    );
  }

  /** Token -> kind. The kind is never taken from the client. */
  async authorize(tokenSha256: string): Promise<{ kind: string } | null> {
    if (!SHA256.test(tokenSha256)) return null;
    const row = this.sql
      .exec(
        "SELECT kind, last_seen_at FROM agents WHERE token_sha256 = ? AND status = 'active'",
        tokenSha256
      )
      .toArray()[0];
    if (!row) return null;
    const now = Date.now();
    if (!row.last_seen_at || now - Number(row.last_seen_at) > TOUCH_DEBOUNCE_MS)
      this.sql.exec(
        'UPDATE agents SET last_seen_at = ? WHERE kind = ?',
        now,
        row.kind
      );
    return { kind: String(row.kind) };
  }

  async activeKinds(): Promise<string[]> {
    return this.sql
      .exec("SELECT kind FROM agents WHERE status = 'active' ORDER BY kind")
      .toArray()
      .map(row => String(row.kind));
  }

  async upsert(entries: AgentEntry[]): Promise<{ upserted: number }> {
    const now = Date.now();
    const seenHashes = new Set<string>();
    for (const entry of entries) {
      if (!KIND.test(entry.kind) || SYSTEM_KINDS.has(entry.kind))
        throw new Error(`invalid kind ${entry.kind}`);
      if (!SHA256.test(entry.tokenSha256) || seenHashes.has(entry.tokenSha256))
        throw new Error(`invalid or duplicate token hash for ${entry.kind}`);
      seenHashes.add(entry.tokenSha256);
      if (
        entry.fallback &&
        (entry.fallback === entry.kind || !KIND.test(entry.fallback))
      )
        throw new Error(`invalid fallback for ${entry.kind}`);
    }
    for (const entry of entries) {
      const fallback =
        entry.fallback === undefined
          ? entry.kind === 'summer'
            ? null
            : 'summer'
          : entry.fallback;
      const deadAfterMs = entry.deadAfterHours
        ? entry.deadAfterHours * 3_600_000
        : entry.heartbeatSec
          ? 24 * 3_600_000
          : LIMITS.deadAfterDormantMs;
      this.sql.exec(
        `INSERT INTO agents (kind, token_sha256, owner, status, fallback, heartbeat_sec, probe, dead_after_ms, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(kind) DO UPDATE SET token_sha256 = excluded.token_sha256, owner = excluded.owner,
           status = excluded.status, fallback = excluded.fallback, heartbeat_sec = excluded.heartbeat_sec,
           probe = excluded.probe, dead_after_ms = excluded.dead_after_ms, updated_at = excluded.updated_at`,
        entry.kind,
        entry.tokenSha256,
        entry.owner ?? null,
        entry.status ?? 'active',
        fallback,
        entry.heartbeatSec ?? null,
        entry.probe ? 1 : 0,
        deadAfterMs,
        now
      );
      await this.mailbox(entry.kind).configure({
        kind: entry.kind,
        fallback,
        deadAfterMs,
      });
    }
    // Audit trail for every registry write (who/what, never the hash).
    await this.recordEvent('registry.write', null, {
      kinds: entries.map(entry => `${entry.kind}:${entry.status ?? 'active'}`),
    });
    return { upserted: entries.length };
  }

  /** Records an event; alerting ones go to Summer, ALERT_KINDS and the out-of-band sink. */
  async recordEvent(type: string, kind: string | null, detail: Detail) {
    const now = Date.now();
    const row = this.sql
      .exec(
        'INSERT INTO events (at, type, kind, detail) VALUES (?, ?, ?, ?) RETURNING id',
        now,
        type,
        kind,
        JSON.stringify(detail)
      )
      .toArray()[0];
    if (!ALERTING.has(type)) return;
    const eventId = Number(row?.id);
    const body = JSON.stringify({
      schema: 'jovie.mesh-event/v1',
      eventId,
      type,
      kind,
      detail,
      at: new Date(now).toISOString(),
    });
    const sha256 = await sha256Hex(body);
    const kinds = new Set(await this.activeKinds());
    const targets = new Set(
      ['summer', ...(this.env.ALERT_KINDS ?? 'claude,codex').split(',')]
        .map(value => value.trim())
        .filter(target => target && kinds.has(target))
    );
    // An alarm about an agent is not delivered to that agent alone.
    await Promise.all(
      [...targets].map(async to => {
        const envelope: Envelope = {
          id: `mesh-hub:event:${eventId}`,
          from: 'mesh-hub',
          to,
          correlationId: `event:${eventId}`,
          sha256,
          body,
          refs: [],
          inReplyTo: null,
          sentAt: null,
          acceptedAt: now,
          kind: 'event',
        };
        try {
          await this.mailbox(to).enqueue(envelope);
        } catch {
          // Recorded in events; /v1/status shows it even if delivery fails.
        }
      })
    );
    if (this.env.ALERT_WEBHOOK_URL) {
      try {
        await fetch(this.env.ALERT_WEBHOOK_URL, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body,
          signal: AbortSignal.timeout(5_000),
        });
      } catch {
        // Best effort; the event row is the durable record.
      }
    }
  }

  /** Cron-driven (every minute): presence, silence, probes. Idempotent per run. */
  async sweep(): Promise<{ checked: number; events: number }> {
    const now = Date.now();
    const agents = this.sql
      .exec("SELECT * FROM agents WHERE status = 'active' AND kind != 'summer'")
      .toArray();
    const pending: { type: string; kind: string; detail: Detail }[] = [];
    let heartbeatAgents = 0;
    for (const agent of agents) {
      const kind = String(agent.kind);
      let live: Liveness | null = null;
      try {
        live = await this.mailbox(kind).liveness();
      } catch {
        // Mailbox unreachable: do not guess; skip this agent this round.
        continue;
      }
      const heartbeatSec =
        agent.heartbeat_sec === null ? null : Number(agent.heartbeat_sec);
      if (heartbeatSec) heartbeatAgents++;
      const presence = evaluatePresence({
        now,
        heartbeatSec,
        state: String(agent.state) as AgentState,
        lastSeenAt:
          agent.last_seen_at === null ? null : Number(agent.last_seen_at),
        connected: live.connected,
        lastPingAt: live.lastPingAt,
        lastActivityAt: live.lastActivityAt,
      });
      if (presence.state !== agent.state)
        this.sql.exec(
          'UPDATE agents SET state = ?, state_changed_at = ? WHERE kind = ?',
          presence.state,
          now,
          kind
        );
      if (presence.event)
        pending.push({
          type: presence.event,
          kind,
          detail: {
            lastAliveAt: presence.lastAliveAt,
            unhandled: live.unhandled,
          },
        });
      if (Number(agent.probe))
        await this.probe(kind, live, Number(agent.probe_misses), now, pending);
    }
    // Storm guard: many agents going silent at once is a hub/network fault, not N outages.
    const silenced = pending.filter(event => event.type === 'agent.silent');
    let emitted = 0;
    if (silenced.length >= Math.max(3, Math.ceil(heartbeatAgents / 2))) {
      await this.recordEvent('hub.suspect', null, {
        silent: silenced.map(event => event.kind),
      });
      emitted++;
      for (const event of pending.filter(
        event => event.type !== 'agent.silent'
      )) {
        await this.recordEvent(event.type, event.kind, event.detail);
        emitted++;
      }
    } else {
      for (const event of pending) {
        await this.recordEvent(event.type, event.kind, event.detail);
        emitted++;
      }
    }
    this.setMeta('lastSweepAt', String(now));
    return { checked: agents.length, events: emitted };
  }

  private async probe(
    kind: string,
    live: Liveness,
    misses: number,
    now: number,
    pending: { type: string; kind: string; detail: Detail }[]
  ) {
    const result = evaluateProbe({
      now,
      lastProbeAt: live.lastProbe?.acceptedAt ?? null,
      lastProbeAckAt: live.lastProbe?.receivedAt ?? null,
      misses,
    });
    this.sql.exec(
      'UPDATE agents SET probe_misses = ?, probe_rtt_ms = COALESCE(?, probe_rtt_ms) WHERE kind = ?',
      result.misses,
      result.rttMs,
      kind
    );
    if (result.event)
      pending.push({
        type: result.event,
        kind,
        detail: { misses: result.misses },
      });
    if (!result.sendNew) return;
    const body = JSON.stringify({
      schema: 'jovie.mesh-ping/v1',
      probeId: `${kind}:${now}`,
    });
    await this.mailbox(kind).enqueue({
      id: `mesh-probe:${kind}:${now}`,
      from: 'mesh-probe',
      to: kind,
      correlationId: `probe:${now}`,
      sha256: await sha256Hex(body),
      body,
      refs: [],
      inReplyTo: null,
      sentAt: null,
      acceptedAt: now,
      kind: 'probe',
    });
  }

  async directory() {
    return this.sql
      .exec(
        `SELECT kind, owner, status, fallback, heartbeat_sec, probe, last_seen_at, state,
           state_changed_at, probe_misses, probe_rtt_ms FROM agents ORDER BY kind`
      )
      .toArray()
      .map(row => ({
        kind: String(row.kind),
        owner: row.owner === null ? null : String(row.owner),
        status: String(row.status),
        fallback: row.fallback === null ? null : String(row.fallback),
        heartbeatSec:
          row.heartbeat_sec === null ? null : Number(row.heartbeat_sec),
        probe: Boolean(row.probe),
        lastSeenAt:
          row.last_seen_at === null
            ? null
            : new Date(Number(row.last_seen_at)).toISOString(),
        state: String(row.state),
        stateChangedAt:
          row.state_changed_at === null
            ? null
            : new Date(Number(row.state_changed_at)).toISOString(),
        probeMisses: Number(row.probe_misses),
        probeRttMs: row.probe_rtt_ms === null ? null : Number(row.probe_rtt_ms),
      }));
  }

  async status() {
    const agents = await this.directory();
    const withLive = await Promise.all(
      agents.map(async agent => {
        try {
          const live = await this.mailbox(agent.kind).liveness();
          return {
            ...agent,
            connected: live.connected,
            lastPingAt: live.lastPingAt
              ? new Date(live.lastPingAt).toISOString()
              : null,
            unhandled: live.unhandled,
            oldestUnhandledAgeMs: live.oldestUnhandledAgeMs,
          };
        } catch {
          return {
            ...agent,
            connected: null,
            lastPingAt: null,
            unhandled: null,
            oldestUnhandledAgeMs: null,
          };
        }
      })
    );
    const lastSweepAt = this.meta('lastSweepAt');
    const events = this.sql
      .exec(
        'SELECT id, at, type, kind, detail FROM events ORDER BY id DESC LIMIT 25'
      )
      .toArray()
      .map(row => ({
        id: Number(row.id),
        at: new Date(Number(row.at)).toISOString(),
        type: String(row.type),
        kind: row.kind === null ? null : String(row.kind),
        detail: JSON.parse(String(row.detail)) as Detail,
      }));
    return {
      agents: withLive,
      lastSweepAt: lastSweepAt
        ? new Date(Number(lastSweepAt)).toISOString()
        : null,
      sweepHealthy: Boolean(
        lastSweepAt && Date.now() - Number(lastSweepAt) < 3 * 60_000
      ),
      events,
    };
  }

  async metrics(windowMs: number) {
    const since = Date.now() - windowMs;
    const kinds = await this.activeKinds();
    const perKind: Record<string, Detail> = {};
    const allReceived: number[] = [];
    const allHandled: number[] = [];
    let accepted = 0;
    let dead = 0;
    let unhandled = 0;
    for (const kind of kinds) {
      try {
        const sample = await this.mailbox(kind).metrics(since);
        allReceived.push(...sample.toReceived);
        allHandled.push(...sample.toHandled);
        accepted += sample.accepted;
        dead += sample.dead;
        unhandled += sample.unhandled;
        perKind[kind] = {
          accepted: sample.accepted,
          receivedP50Ms: percentile(sample.toReceived, 50),
          receivedP95Ms: percentile(sample.toReceived, 95),
          handledP50Ms: percentile(sample.toHandled, 50),
          handledP95Ms: percentile(sample.toHandled, 95),
          dead: sample.dead,
          unhandled: sample.unhandled,
        };
      } catch {
        perKind[kind] = { error: 'mailbox_unreachable' };
      }
    }
    const probes = (await this.directory()).filter(agent => agent.probe);
    return {
      windowMs,
      accepted,
      receivedP50Ms: percentile(allReceived, 50),
      receivedP95Ms: percentile(allReceived, 95),
      handledP50Ms: percentile(allHandled, 50),
      handledP95Ms: percentile(allHandled, 95),
      dead,
      unhandled,
      /** Loss = accepted messages neither handled nor flagged dead past their SLO. Always computed, never assumed. */
      probeRttMs: Object.fromEntries(
        probes.map(agent => [agent.kind, agent.probeRttMs])
      ),
      detectSlaMs: Object.fromEntries(
        probes
          .filter(agent => agent.heartbeatSec)
          .map(agent => [
            agent.kind,
            2 * (agent.heartbeatSec as number) * 1000 + 60_000,
          ])
      ),
      probeIntervalMs: PROBE.intervalMs,
      perKind,
    };
  }
}
