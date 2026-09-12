import { describe, expect, it } from 'vitest';
import {
  assertOperationalMemorySlugAllowed,
  buildOperationalMemoryRecord,
  commitOperationalMemory,
  OPERATIONAL_MEMORY_SLUG_PREFIX,
  OperationalMemoryDeniedError,
} from '@/lib/ovie/operational-memory';
import { bindEveIdentityForTurn } from '@/lib/ovie/identity';

describe('Summer operational memory (E2/E5)', () => {
  it('builds a provenance-complete ops/summer record', () => {
    const record = buildOperationalMemoryRecord({
      slug: `${OPERATIONAL_MEMORY_SLUG_PREFIX}incidents/gem-dark-2026-09-12`,
      title: 'Gem dark observed',
      body: 'Controller liveness receipt reported gem dark.',
      kind: 'observed',
      sourceRefs: ['receipt:controller-liveness#abc'],
      observedAt: '2026-09-12T16:00:00.000Z',
      author: 'summer',
    });
    expect(record.schema).toContain('operational-memory');
    expect(record.kind).toBe('observed');
    expect(record.sourceRefs).toHaveLength(1);
  });

  it('denies authority and policy slugs', () => {
    expect(() =>
      assertOperationalMemorySlugAllowed('authority/summer-permissions')
    ).toThrow(OperationalMemoryDeniedError);
    expect(() =>
      buildOperationalMemoryRecord({
        slug: 'policy/self-grant',
        title: 'nope',
        body: 'nope',
        kind: 'proposal',
        sourceRefs: ['x'],
        observedAt: '2026-09-12T16:00:00.000Z',
        author: 'summer',
      })
    ).toThrow(/authority|policy|namespace/i);
  });

  it('requires provenance fields', () => {
    expect(() =>
      buildOperationalMemoryRecord({
        slug: `${OPERATIONAL_MEMORY_SLUG_PREFIX}note`,
        title: 'Missing refs',
        body: 'body',
        kind: 'inference',
        sourceRefs: [],
        observedAt: '2026-09-12T16:00:00.000Z',
        author: 'summer',
      })
    ).toThrow(OperationalMemoryDeniedError);
  });

  it('writes when GBrain is up and buffers when GBrain is down', async () => {
    const written = await commitOperationalMemory(
      {
        slug: `${OPERATIONAL_MEMORY_SLUG_PREFIX}recovery/cursor-lane`,
        title: 'Cursor recovery requested',
        body: 'Requested isolated Cursor recovery while Gem dark.',
        kind: 'observed',
        sourceRefs: ['goal:summer-bounded-operator'],
        observedAt: '2026-09-12T16:05:00.000Z',
        author: 'summer',
      },
      {
        writeGbrainPage: async () => ({ ok: true }),
        bufferRecord: async () => ({ bufferId: 'should-not-buffer' }),
      }
    );
    expect(written.status).toBe('written');
    if (written.status === 'written') {
      expect(written.gbrainSlug.startsWith(OPERATIONAL_MEMORY_SLUG_PREFIX)).toBe(
        true
      );
    }

    const buffered = await commitOperationalMemory(
      {
        slug: `${OPERATIONAL_MEMORY_SLUG_PREFIX}recovery/cursor-lane-2`,
        title: 'Cursor recovery buffered',
        body: 'GBrain unavailable; buffer durable note.',
        kind: 'observed',
        sourceRefs: ['goal:summer-bounded-operator'],
        observedAt: '2026-09-12T16:06:00.000Z',
        author: 'summer',
      },
      {
        writeGbrainPage: async () => ({
          ok: false,
          reason: 'gbrain unreachable',
        }),
        bufferRecord: async () => ({ bufferId: 'buf_1' }),
      }
    );
    expect(buffered.status).toBe('buffered');
    if (buffered.status === 'buffered') {
      expect(buffered.bufferId).toBe('buf_1');
      expect(buffered.reason).toContain('gbrain');
    }
  });

  it('grants operational write to Summer and denies privileged write (E5)', () => {
    const summer = bindEveIdentityForTurn('summer');
    expect(() => summer.require('operational-gbrain-write')).not.toThrow();
    expect(() => summer.require('privileged-gbrain-write')).toThrow();
    expect(() => summer.require('symphony-heal')).toThrow();

    const jovie = bindEveIdentityForTurn('jovie');
    expect(() => jovie.require('operational-gbrain-write')).toThrow();
  });

  it('keeps knowledge write distinct from work acceptance and execution', async () => {
    const result = await commitOperationalMemory(
      {
        slug: `${OPERATIONAL_MEMORY_SLUG_PREFIX}identities/separation`,
        title: 'Identity separation',
        body: 'Knowledge write must not imply Linear acceptance or execution completion.',
        kind: 'approved-decision',
        sourceRefs: ['canon:summer-operator'],
        observedAt: '2026-09-12T16:10:00.000Z',
        author: 'summer',
      },
      {
        writeGbrainPage: async () => ({ ok: true }),
        bufferRecord: async () => ({ bufferId: 'unused' }),
      }
    );
    expect(result.status).toBe('written');
    expect(result).not.toHaveProperty('linearAccepted', true);
    expect(result).not.toHaveProperty('executionCompleted', true);
  });
});
