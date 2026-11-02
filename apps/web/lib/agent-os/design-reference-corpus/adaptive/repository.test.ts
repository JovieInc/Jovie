import { describe, expect, it } from 'vitest';
import { referenceScopeKey } from './engine';
import { command, scope, session } from './fixtures.test-utils';
import {
  commitReferenceCommand,
  type ReferenceRepository,
  readReferenceSession,
} from './repository';
import type { ReferenceSession } from './types';

function memory(initial: ReferenceSession): ReferenceRepository {
  const rows = new Map<string, ReferenceSession>([
    [referenceScopeKey(scope), initial],
  ]);
  return {
    async read(key) {
      return structuredClone(rows.get(key) ?? null);
    },
    async compareAndSet(key, revision, value) {
      if ((rows.get(key)?.revision ?? null) !== revision) return false;
      rows.set(key, structuredClone(value));
      return true;
    },
  };
}
describe('durable reference command boundary', () => {
  it('commits only one concurrent revision and preserves ratings across fresh reads', async () => {
    const s = session(2),
      repo = memory(s);
    const results = await Promise.allSettled(
      s.batch.ids.map((id, i) =>
        commitReferenceCommand(
          repo,
          scope,
          command(
            s,
            { type: 'rate', referenceId: id, rating: i + 4 },
            `tab-${i}`
          )
        )
      )
    );
    expect(results.filter(r => r.status === 'fulfilled')).toHaveLength(1);
    expect(results.filter(r => r.status === 'rejected')).toHaveLength(1);
    const loaded = await readReferenceSession(repo, scope);
    expect(Object.keys(loaded.ratings)).toHaveLength(1);
    expect(loaded.revision).toBe(s.revision + 1);
  });
  it('reconciles simultaneous identical retries with one write', async () => {
    const s = session(1),
      repo = memory(s),
      c = command(s, { type: 'rate', referenceId: s.batch.ids[0], rating: 5 });
    const results = await Promise.all([
      commitReferenceCommand(repo, scope, c),
      commitReferenceCommand(repo, scope, c),
    ]);
    expect(results[0]).toEqual(results[1]);
    expect((await readReferenceSession(repo, scope)).revision).toBe(
      s.revision + 1
    );
  });
  it('fails closed on unavailable storage and wrong-scope rows', async () => {
    const repo: ReferenceRepository = {
      async read() {
        throw new Error('offline');
      },
      async compareAndSet() {
        return false;
      },
    };
    await expect(readReferenceSession(repo, scope)).rejects.toThrow('offline');
    await expect(
      readReferenceSession(
        {
          ...repo,
          async read() {
            return { ...session(1), scope: { ...scope, tenantId: 'other' } };
          },
        },
        scope
      )
    ).rejects.toThrow('scope');
  });
});
