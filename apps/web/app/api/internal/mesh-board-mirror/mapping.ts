/**
 * Vercel Board shadow-mirror mapping (one-week pilot; workers/mesh-hub/BOARD-PILOT.md).
 * Turns one hub `stages` row into Board writes on channel `mesh/tasks`.
 *
 * Label keys use underscore style (`hub_id`) because the Board docs publish no
 * charset for label keys — only the `board.` prefix is reserved — so dotted
 * keys (`hub.id`) are not provably safe. Only `hub.*`-shaped labels are set;
 * `board.task` (Board's own state label) is never touched by name.
 *
 * Gaps vs the hub protocol (documented in BOARD-PILOT.md): Board has no
 * question type (a question mirrors as a plain post labeled `hub_type=question`),
 * Board claim leases max out at 5 minutes while hub leases run 15 min–6 h, so
 * a hub `claimed` stage is mirrored as labels + a reply and never as a real
 * Board claim; `done`/`failed` take a real short lease (60 s) to settle.
 */
import type { Board } from '@vercel/board';

export const MESH_CHANNEL = 'mesh/tasks';
export const HUB_PROFILE = 'mesh-hub';

/** Board idempotency keys, per write kind, from the hub stage id. */
export const idemKey = (stageId: number) => `hub-stage-${stageId}`;
export const replyKey = (stageId: number) => `hub-stage-${stageId}-reply`;

/** One row of the hub mirror POST body (workers/mesh-hub/src/board-mirror.ts). */
export type HubRow = {
  stageId: number;
  taskId: string;
  type: string;
  title: string;
  poster: string;
  assignee: string | null;
  caps: string[];
  parent: string | null;
  status: string;
  actor: string;
  stage: string;
  at: number;
  note?: string | null;
  result?: string | null;
  body?: string;
  answers?: Array<{ from: string; at: number; text: string }>;
};

type Labels = Record<string, string>;

/** Every Board write carries these; `extra` is the stage-specific part. */
export function rowLabels(row: HubRow, extra: Labels = {}): Labels {
  const labels: Labels = {
    hub_id: row.taskId,
    hub_type: row.type,
    hub_stage: String(row.stageId),
    hub_at: String(row.at),
    ...extra,
  };
  if (row.assignee) labels.hub_assignee = row.assignee;
  else labels.hub_pool = '1';
  if (row.parent) labels.hub_parent = row.parent;
  for (const cap of row.caps) labels[`cap_${cap}`] = '1';
  return labels;
}

/** Task text: title always; the body rides along only in body mode. */
export function rowText(row: HubRow, includeBody: boolean): string {
  if (!includeBody || !row.body) return row.title;
  return `${row.title}\n\n${row.body.slice(0, 2_000)}`;
}

/** What the audit watcher logs per event (writes nothing to the board). */
export function auditLine(event: {
  type: string;
  cursor: string;
  createdAt: string;
  message?: { id: string; labels?: Record<string, string> } | null;
}): string {
  const labels = event.message?.labels ?? {};
  return JSON.stringify({
    evt: 'board_pilot',
    type: event.type,
    cursor: event.cursor,
    msgId: event.message?.id ?? null,
    hubStage: labels.hub_stage ?? null,
    hubAt: labels.hub_at ? Number(labels.hub_at) : null,
    eventAt: event.createdAt,
    wakeAt: Date.now(),
  });
}

/**
 * The subset of the `@vercel/board` handle the mirror writes through. Duck
 * typed so tests can pass a recorder instead of the SDK.
 */
export type BoardHandle = Pick<
  Board,
  'post' | 'reply' | 'label' | 'tasks' | 'messages'
>;

export type ApplyResult = {
  action: string;
  rootId: string | null;
};

export class MirrorWriter {
  private readonly roots = new Map<string, string>();

  constructor(private readonly team: BoardHandle) {}

  /** Board root (task or post) for a hub task id, via label lookup. */
  async resolveRoot(row: HubRow): Promise<string | null> {
    const cached = this.roots.get(row.taskId);
    if (cached) return cached;
    const tasks = await this.team.tasks.list({
      channel: MESH_CHANNEL,
      state: 'all',
      label: { hub_id: row.taskId },
    });
    let rootId: string | null = tasks.tasks[0]?.message.id ?? null;
    if (!rootId) {
      // Questions were posted as plain posts, so they are not in tasks.list.
      const messages = await this.team.messages({
        channel: MESH_CHANNEL,
        label: [`hub_id=${row.taskId}`],
      });
      const root = messages.messages.find(message => message.re === null);
      rootId = root?.id ?? null;
    }
    if (rootId) this.roots.set(row.taskId, rootId);
    return rootId;
  }

  private async settle(id: string, set: Labels, row: HubRow): Promise<void> {
    await this.team.label(id, {
      set: {
        ...set,
        hub_stage: String(row.stageId),
        hub_at: String(row.at),
      },
    });
  }

  private replyText(row: HubRow, text: string | null): string {
    if (!text) return `${row.stage} by ${row.actor}`;
    return text;
  }

  /** Apply one hub stage row to the board. Throws for the route to log and skip. */
  async apply(row: HubRow, includeBody = false): Promise<ApplyResult> {
    switch (row.stage) {
      case 'posted':
      case 'fanout': {
        const labels = rowLabels(row, { hub_state: row.status || 'open' });
        const text = rowText(row, includeBody);
        if (row.type === 'question') {
          // Board has no question type: a plain post, labeled.
          const posted = await this.team.post(MESH_CHANNEL, {
            text,
            labels,
            id: idemKey(row.stageId),
          });
          this.roots.set(row.taskId, posted.id);
          return { action: 'posted-question', rootId: posted.id };
        }
        const created = await this.team.tasks.create(MESH_CHANNEL, {
          text,
          labels,
          id: idemKey(row.stageId),
        });
        this.roots.set(row.taskId, created.task.id);
        return { action: 'posted-task', rootId: created.task.id };
      }
      case 'claimed': {
        const id = await this.resolveRoot(row);
        if (!id) return { action: 'missing-root', rootId: null };
        // Never a real Board claim: hub leases (15 min–6 h) exceed the Board's
        // 5-minute maximum, so only the labels + a reply mirror the claim.
        await this.settle(
          id,
          { hub_state: 'claimed', hub_claimant: row.actor },
          row
        );
        await this.team.reply(id, {
          text: this.replyText(row, null),
          id: replyKey(row.stageId),
        });
        return { action: 'claimed', rootId: id };
      }
      case 'progress':
      case 'reclaimed': {
        const id = await this.resolveRoot(row);
        if (!id) return { action: 'missing-root', rootId: null };
        await this.settle(id, { hub_state: 'claimed' }, row);
        await this.team.reply(id, {
          text: this.replyText(row, row.note ?? row.result ?? null),
          id: replyKey(row.stageId),
        });
        return { action: row.stage, rootId: id };
      }
      case 'answered': {
        const id = await this.resolveRoot(row);
        if (!id) return { action: 'missing-root', rootId: null };
        const answer = row.answers?.at(-1)?.text ?? row.note ?? null;
        await this.team.reply(id, {
          text: this.replyText(row, includeBody ? answer : null),
          id: replyKey(row.stageId),
        });
        return { action: 'answered', rootId: id };
      }
      case 'done':
      case 'failed': {
        const id = await this.resolveRoot(row);
        if (!id) return { action: 'missing-root', rootId: null };
        // A real claim with a short lease settles the task; an already-settled
        // task throws (409) and the route logs and skips.
        const claim = await this.team.tasks.claim(id, { lease: 60 });
        const outcome = row.result ?? row.note ?? '';
        if (row.stage === 'done') await claim.complete(outcome);
        else await claim.fail(outcome);
        await this.settle(id, { hub_state: row.stage }, row);
        return { action: row.stage, rootId: id };
      }
      case 'cancelled': {
        const id = await this.resolveRoot(row);
        if (!id) return { action: 'missing-root', rootId: null };
        await this.team.tasks.cancel(
          id,
          `cancelled on the hub by ${row.actor}`
        );
        await this.settle(id, { hub_state: 'cancelled' }, row);
        return { action: 'cancelled', rootId: id };
      }
      case 'lease_expired': {
        const id = await this.resolveRoot(row);
        if (!id) return { action: 'missing-root', rootId: null };
        await this.settle(id, { hub_state: 'open' }, row);
        await this.team.reply(id, {
          text: this.replyText(row, null),
          id: replyKey(row.stageId),
        });
        return { action: 'lease_expired', rootId: id };
      }
      case 'reassigned': {
        const id = await this.resolveRoot(row);
        if (!id) return { action: 'missing-root', rootId: null };
        const to = row.assignee ?? 'pool';
        await this.settle(id, { hub_assignee: to }, row);
        await this.team.reply(id, {
          text: this.replyText(row, `reassigned to ${to} (by ${row.actor})`),
          id: replyKey(row.stageId),
        });
        return { action: 'reassigned', rootId: id };
      }
      default: {
        // Unknown stages still leave a trace so nothing is silently dropped.
        const id = await this.resolveRoot(row);
        if (!id) return { action: `unknown-stage:${row.stage}`, rootId: null };
        await this.team.reply(id, {
          text: this.replyText(row, null),
          id: replyKey(row.stageId),
        });
        return { action: `unknown-stage:${row.stage}`, rootId: id };
      }
    }
  }
}
