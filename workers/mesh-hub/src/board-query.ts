/**
 * Read-only board projections: one task row, a list, stage history, and metrics.
 */

import type { Task, TaskStatus, TaskType } from './board.ts';
import { percentile, type Sql } from './core.ts';

export function taskFromRow(raw: Record<string, unknown>): Task {
  const num = (v: unknown) =>
    v === null || v === undefined ? null : Number(v);
  return {
    id: String(raw.id),
    parent: (raw.parent as string | null) ?? null,
    type: raw.type as TaskType,
    title: String(raw.title),
    body: String(raw.body),
    caps: JSON.parse(String(raw.caps)) as string[],
    poster: String(raw.poster),
    assignee: (raw.assignee as string | null) ?? null,
    status: raw.status as TaskStatus,
    claimant: (raw.claimant as string | null) ?? null,
    leaseUntil: num(raw.leaseUntil),
    leaseMs: Number(raw.leaseMs),
    attempts: Number(raw.attempts),
    result: (raw.result as string | null) ?? null,
    answers: JSON.parse(String(raw.answers ?? '[]')),
    merge: raw.merge ? JSON.parse(String(raw.merge)) : null,
    postedAt: Number(raw.postedAt),
    firstClaimedAt: num(raw.firstClaimedAt),
    claimedAt: num(raw.claimedAt),
    doneAt: num(raw.doneAt),
    updatedAt: Number(raw.updatedAt),
  };
}

export function listTasks(
  sql: Sql,
  filter: { status?: string | null; limit?: number }
) {
  const limit = Math.min(Math.max(filter.limit ?? 50, 1), 200);
  const rows = filter.status
    ? sql.exec(
        'SELECT * FROM tasks WHERE status = ? ORDER BY postedAt DESC LIMIT ?',
        filter.status,
        limit
      )
    : sql.exec('SELECT * FROM tasks ORDER BY postedAt DESC LIMIT ?', limit);
  return rows
    .toArray()
    .map(taskFromRow)
    .map(task => ({
      ...task,
      body: task.body.slice(0, 500),
      result: task.result?.slice(0, 500) ?? null,
    }));
}

export function taskStages(sql: Sql, taskId: string) {
  return sql
    .exec(
      'SELECT at, actor, stage, note FROM stages WHERE taskId = ? ORDER BY id',
      taskId
    )
    .toArray()
    .map(raw => ({
      at: new Date(Number(raw.at)).toISOString(),
      actor: String(raw.actor),
      stage: String(raw.stage),
      note: raw.note ?? null,
    }));
}

/** p50/p95 per agent: post->claim (pickup), claim->done (work), post->done (total). */
export function taskMetrics(sql: Sql, windowMs: number, now: number) {
  const rows = sql
    .exec(
      "SELECT * FROM tasks WHERE doneAt >= ? AND status IN ('done','failed') AND type != 'question'",
      now - windowMs
    )
    .toArray()
    .map(taskFromRow)
    // A fan-out parent closes with its merge result; counting it would double-count the merger.
    .filter(task => task.merge === null);
  const lease = sql
    .exec(
      "SELECT actor, COUNT(*) AS n FROM stages WHERE stage = 'lease_expired' AND at >= ? GROUP BY actor",
      now - windowMs
    )
    .toArray();
  const by: Record<
    string,
    {
      pickup: number[];
      work: number[];
      total: number[];
      done: number;
      failed: number;
    }
  > = {};
  for (const task of rows) {
    const agent = task.claimant ?? 'unknown';
    const entry = (by[agent] ??= {
      pickup: [],
      work: [],
      total: [],
      done: 0,
      failed: 0,
    });
    entry[task.status === 'done' ? 'done' : 'failed']++;
    if (task.firstClaimedAt !== null)
      entry.pickup.push(task.firstClaimedAt - task.postedAt);
    if (task.claimedAt !== null && task.doneAt !== null)
      entry.work.push(task.doneAt - task.claimedAt);
    if (task.doneAt !== null) entry.total.push(task.doneAt - task.postedAt);
  }
  const stat = (values: number[]) => ({
    p50: percentile(values, 50),
    p95: percentile(values, 95),
  });
  return {
    windowHours: Math.round(windowMs / 3_600_000),
    agents: Object.fromEntries(
      Object.entries(by).map(([agent, entry]) => [
        agent,
        {
          done: entry.done,
          failed: entry.failed,
          pickupMs: stat(entry.pickup),
          workMs: stat(entry.work),
          totalMs: stat(entry.total),
        },
      ])
    ),
    leaseExpired: Object.fromEntries(
      lease.map(raw => [String(raw.actor), Number(raw.n)])
    ),
    open: Number(
      sql
        .exec("SELECT COUNT(*) AS n FROM tasks WHERE status = 'open'")
        .toArray()[0]?.n ?? 0
    ),
    claimed: Number(
      sql
        .exec("SELECT COUNT(*) AS n FROM tasks WHERE status = 'claimed'")
        .toArray()[0]?.n ?? 0
    ),
  };
}
