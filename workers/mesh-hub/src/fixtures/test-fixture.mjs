import { DatabaseSync } from 'node:sqlite';
import { sha256Hex } from './core.ts';

/** node:sqlite with the DO SqlStorage call shape. */
export function sqlite() {
  const db = new DatabaseSync(':memory:');
  return {
    exec(query, ...bindings) {
      const statement = db.prepare(query);
      const rows = /^\s*(SELECT|WITH)\b|\bRETURNING\b/i.test(query)
        ? statement.all(...bindings)
        : (statement.run(...bindings), []);
      return { toArray: () => rows.map(row => ({ ...row })) };
    },
  };
}

export async function envelope(over = {}) {
  const body = over.body ?? 'status ping';
  return {
    id: `claude:${over.correlationId ?? 'mesh-0001-test'}`,
    from: 'claude',
    to: 'codex',
    correlationId: over.correlationId ?? 'mesh-0001-test',
    sha256: await sha256Hex(body),
    body,
    refs: [],
    inReplyTo: null,
    sentAt: null,
    acceptedAt: over.acceptedAt ?? 1_000,
    kind: over.kind ?? 'message',
    ...over,
    ...(over.body ? { sha256: await sha256Hex(over.body) } : {}),
  };
}

export async function boardEnvelope(over = {}) {
  const { event, ...rest } = over;
  const body =
    rest.body ??
    JSON.stringify({ schema: 'jovie.board/v1', event: event ?? 'task.open' });
  return {
    id: rest.id ?? 'board:t:t-1:1',
    from: 'board',
    to: 'claude',
    correlationId: rest.correlationId ?? 't:t-1:1',
    sha256: await sha256Hex(body),
    body,
    refs: rest.refs ?? [],
    inReplyTo: null,
    sentAt: null,
    acceptedAt: rest.acceptedAt ?? 1_000,
    kind: 'message',
  };
}

export const EMPTY_SELECTOR = {
  afterSeq: 0,
  limit: 100,
  olderThanMs: null,
  newerThanMs: null,
  msgKinds: [],
  from: [],
  unackedOnly: false,
  excludeBodyContains: [],
  excludeRefsContains: [],
  excludeFrom: [],
};
