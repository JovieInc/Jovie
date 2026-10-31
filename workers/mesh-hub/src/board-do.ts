import { DurableObject } from 'cloudflare:workers';
import { BOARD_KIND, BoardStore, parseBoardSend } from './board.ts';
import { type Envelope, HubError, sha256Hex } from './core.ts';
import type { Env } from './env.ts';

const NOTICE_RETRY_MS = 60_000;

export type BoardResult =
  | ({ ok: true; op: string } & Record<string, unknown>)
  | { ok: false; status: number; code: string };

/**
 * The fleet task board (singleton). Ops arrive over REST (`/v1/board/<op>`) or as a
 * mesh send `to: "board"`. Notices go out as ordinary mesh messages from `board`, so
 * push, at-least-once delivery, mail.stale and the DLQ all apply unchanged.
 */
export class Board extends DurableObject<Env> {
  private readonly store: BoardStore;

  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
    this.store = new BoardStore(ctx.storage.sql);
  }

  private async active(): Promise<string[]> {
    const registry = this.env.REGISTRY.get(
      this.env.REGISTRY.idFromName('registry')
    );
    return registry.activeKinds();
  }

  /** Errors cross the RPC boundary as values: `{ok:false, status, code}`. */
  async op(
    from: string,
    op: string,
    input: Record<string, unknown>
  ): Promise<BoardResult> {
    try {
      const result = this.store.apply(
        from,
        op,
        input,
        await this.active(),
        Date.now()
      );
      await this.flush();
      return {
        ok: true,
        op,
        ...(JSON.parse(JSON.stringify(result)) as Record<string, unknown>),
      };
    } catch (error) {
      if (error instanceof HubError)
        return { ok: false, status: error.status, code: error.code };
      throw error;
    }
  }

  /** A mesh send to `board`: JSON op, or a plain reply to a board notice. */
  async fromMesh(
    from: string,
    body: string,
    inReplyTo: string | null
  ): Promise<BoardResult> {
    try {
      const { op, input } = parseBoardSend(body, inReplyTo, id =>
        this.store.get(id)
      );
      return await this.op(from, op, input);
    } catch (error) {
      if (error instanceof HubError)
        return { ok: false, status: error.status, code: error.code };
      throw error;
    }
  }

  async read(query: {
    id?: string | null;
    status?: string | null;
    limit?: number;
  }) {
    if (query.id) {
      const task = this.store.get(query.id);
      if (!task) return { task: null };
      return JSON.parse(
        JSON.stringify({
          task,
          stages: this.store.stages(task.id),
          children: this.store.children(task.id),
        })
      ) as Record<string, unknown>;
    }
    return JSON.parse(
      JSON.stringify({
        tasks: this.store.list(query),
        caps: this.store.capsTable(),
      })
    ) as Record<string, unknown>;
  }

  async metrics(windowMs: number) {
    return JSON.parse(
      JSON.stringify(this.store.metrics(windowMs, Date.now()))
    ) as Record<string, unknown>;
  }

  /** Cron dead-man and lease alarm both land here. */
  async sweep() {
    const out = this.store.sweep(await this.active(), Date.now());
    await this.flush();
    return out;
  }

  async alarm() {
    try {
      await this.sweep();
    } finally {
      await this.arm();
    }
  }

  private async arm() {
    const lease = this.store.nextLeaseDue();
    const pending = this.store.pendingNotices(1).length
      ? Date.now() + NOTICE_RETRY_MS
      : null;
    const due = [lease, pending].filter((v): v is number => v !== null);
    if (!due.length) return;
    const next = Math.max(Math.min(...due), Date.now() + 1_000);
    const current = await this.ctx.storage.getAlarm();
    if (current === null || current > next)
      await this.ctx.storage.setAlarm(next);
  }

  /** Deliver pending notices; anything that fails stays pending for the alarm. */
  private async flush() {
    const now = Date.now();
    for (const notice of this.store.pendingNotices(50)) {
      const envelope: Envelope = {
        id: `${BOARD_KIND}:${notice.correlationId}`,
        from: BOARD_KIND,
        to: notice.to,
        correlationId: notice.correlationId,
        sha256: await sha256Hex(notice.body),
        body: notice.body,
        refs: [],
        inReplyTo: null,
        sentAt: null,
        acceptedAt: now,
        kind: 'message',
      };
      try {
        const stub = this.env.MAILBOX.get(
          this.env.MAILBOX.idFromName(notice.to)
        );
        const result = await stub.enqueue(envelope);
        if (result.ok || result.status === 409)
          this.store.markSent(notice.correlationId, notice.to, now);
      } catch {
        // stays pending
      }
    }
    await this.arm();
  }
}
