import { createHash } from 'node:crypto';
import sharp from 'sharp';
import { describe, expect, it } from 'vitest';
import {
  createReferenceSession,
  importReferenceCandidates,
  referenceScopeKey,
  referenceView,
} from '@/lib/agent-os/design-reference-corpus/adaptive/engine';
import {
  candidate,
  now,
  scope,
} from '@/lib/agent-os/design-reference-corpus/adaptive/fixtures.test-utils';
import type { ReferenceRepository } from '@/lib/agent-os/design-reference-corpus/adaptive/repository';
import type { ReferenceSession } from '@/lib/agent-os/design-reference-corpus/adaptive/types';
import {
  ingestReferenceCapture,
  type PrivateReferencePreview,
  type ReferencePreviewRepository,
  referencePreviewKey,
} from './intake';

function store(): ReferenceRepository &
  ReferencePreviewRepository & {
    sessions: Map<string, ReferenceSession>;
    previews: Map<string, PrivateReferencePreview>;
  } {
  const sessions = new Map<string, ReferenceSession>(),
    previews = new Map<string, PrivateReferencePreview>();
  return {
    sessions,
    previews,
    async read(key) {
      return sessions.get(key) ?? null;
    },
    async compareAndSet(key, revision, value) {
      if ((sessions.get(key)?.revision ?? null) !== revision) return false;
      sessions.set(key, structuredClone(value));
      return true;
    },
    async readPreview(key) {
      return previews.get(key) ?? null;
    },
    async insertPreview(key, value) {
      if (previews.has(key)) return false;
      previews.set(key, structuredClone(value));
      return true;
    },
  };
}
async function captured() {
  const bytes = await sharp({
    create: { width: 8, height: 8, channels: 3, background: '#ffffff' },
  })
    .png()
    .toBuffer();
  const data = candidate(1, {
    sha256: createHash('sha256').update(bytes).digest('hex'),
    width: 8,
    height: 8,
  });
  return { bytes, data };
}
describe('private captured-reference intake', () => {
  it('replays the final committed capture at the 500-reference cap', async () => {
    const { bytes, data } = await captured(),
      repository = store();
    let full = createReferenceSession(scope, now);
    for (let offset = 0; offset < 499; offset += 100)
      full = importReferenceCandidates(
        full,
        scope,
        Array.from({ length: Math.min(100, 499 - offset) }, (_, i) =>
          candidate(offset + i + 2)
        ),
        now
      );
    repository.sessions.set(referenceScopeKey(scope), full);
    const input = {
      repository,
      scope,
      candidate: data,
      bytes,
      revision: full.revision,
      now,
    };
    const saved = await ingestReferenceCapture(input);
    expect(Object.keys(saved.media)).toHaveLength(500);
    const replay = await ingestReferenceCapture(input);
    expect(replay.revision).toBe(saved.revision);
    expect(repository.previews.size).toBe(1);
    expect(replay.media[data.reference.id].previewSlot).toBe(499);
  });
  it('reconciles a failed commit by replaying the exact capture without another preview allocation', async () => {
    const { bytes, data } = await captured(),
      repository = store();
    const commit = repository.compareAndSet;
    repository.compareAndSet = async () => {
      throw new Error('connection lost before commit');
    };
    const input = {
      repository,
      scope,
      candidate: data,
      bytes,
      revision: 0,
      now,
    };
    await expect(ingestReferenceCapture(input)).rejects.toThrow(
      'connection lost'
    );
    expect(repository.sessions.size).toBe(0);
    expect(repository.previews.size).toBe(1);
    const reservation = structuredClone(
      repository.previews.get(referencePreviewKey(scope, 0))
    );
    repository.compareAndSet = commit;
    const result = await ingestReferenceCapture(input);
    expect(result.revision).toBe(1);
    expect(result.ratings).toEqual({});
    expect(repository.previews.size).toBe(1);
    expect(repository.previews.get(referencePreviewKey(scope, 0))).toEqual(
      reservation
    );
  });
  it('reconciles a lost successful response without advancing the revision or duplicating the capture', async () => {
    const { bytes, data } = await captured(),
      repository = store();
    const commit = repository.compareAndSet;
    repository.compareAndSet = async (...args) => {
      await commit(...args);
      throw new Error('response lost after commit');
    };
    const input = {
      repository,
      scope,
      candidate: data,
      bytes,
      revision: 0,
      now,
    };
    await expect(ingestReferenceCapture(input)).rejects.toThrow(
      'response lost'
    );
    repository.compareAndSet = commit;
    for (let i = 0; i < 4; i++) {
      const recovered = await ingestReferenceCapture(input);
      expect(recovered.revision).toBe(1);
      expect(Object.keys(recovered.media)).toEqual([data.reference.id]);
    }
    expect(repository.previews.size).toBe(1);
  });
  it('keeps a different capture blocked until the reserved capture is reconciled at the current revision', async () => {
    const { bytes, data } = await captured(),
      repository = store();
    const commit = repository.compareAndSet;
    repository.compareAndSet = async () => false;
    await expect(
      ingestReferenceCapture({
        repository,
        scope,
        candidate: data,
        bytes,
        revision: 0,
        now,
      })
    ).rejects.toThrow('changed');
    repository.sessions.set(referenceScopeKey(scope), {
      ...createReferenceSession(scope, now),
      revision: 4,
    });
    repository.compareAndSet = commit;
    const otherBytes = await sharp({
      create: { width: 8, height: 8, channels: 3, background: '#000000' },
    })
      .png()
      .toBuffer();
    const other = candidate(2, {
      ...data.media,
      sourceUrl: 'https://source.example/reference/2',
      originalUrl: 'https://media.example/other.png',
      sha256: createHash('sha256').update(otherBytes).digest('hex'),
    });
    for (let i = 0; i < 4; i++)
      await expect(
        ingestReferenceCapture({
          repository,
          scope,
          candidate: other,
          bytes: otherBytes,
          revision: 4,
          now,
        })
      ).rejects.toThrow('reconciliation');
    expect(repository.previews.size).toBe(1);
    expect(repository.previews.get(referencePreviewKey(scope, 0))?.sha256).toBe(
      data.media.sha256
    );
    const recovered = await ingestReferenceCapture({
      repository,
      scope,
      candidate: data,
      bytes,
      revision: 4,
      now,
    });
    const next = await ingestReferenceCapture({
      repository,
      scope,
      candidate: other,
      bytes: otherBytes,
      revision: recovered.revision,
      now,
    });
    expect(next.revision).toBe(6);
    expect(repository.previews.size).toBe(2);
    expect(Object.keys(next.media)).toHaveLength(2);
  });
  it.each(['scope', 'bytes', 'content-type', 'missing'] as const)(
    'refuses %s corruption during reservation reconciliation',
    async fault => {
      const { bytes, data } = await captured(),
        repository = store();
      const commit = repository.compareAndSet;
      repository.compareAndSet = async () => false;
      const input = {
        repository,
        scope,
        candidate: data,
        bytes,
        revision: 0,
        now,
      };
      await expect(ingestReferenceCapture(input)).rejects.toThrow('changed');
      const key = referencePreviewKey(scope, 0),
        preview = repository.previews.get(key)!;
      if (fault === 'missing') repository.readPreview = async () => null;
      else
        repository.previews.set(key, {
          ...preview,
          ...(fault === 'scope'
            ? { scopeKey: referenceScopeKey({ ...scope, tenantId: 'other' }) }
            : fault === 'bytes'
              ? { base64: 'AQID' }
              : { contentType: 'image/jpeg' }),
        });
      repository.compareAndSet = commit;
      await expect(ingestReferenceCapture(input)).rejects.toThrow(
        'reconciliation'
      );
      expect(repository.sessions.size).toBe(0);
      expect(repository.previews.size).toBe(1);
    }
  );
  it('does not store a fresh digest for an already-known media URL', async () => {
    const { bytes, data } = await captured(),
      repository = store();
    const first = await ingestReferenceCapture({
      repository,
      scope,
      candidate: data,
      bytes,
      revision: 0,
      now,
    });
    const otherBytes = await sharp({
      create: { width: 8, height: 8, channels: 3, background: '#000000' },
    })
      .png()
      .toBuffer();
    const duplicate = candidate(2, {
      ...data.media,
      sourceUrl: 'https://source.example/reference/2',
      sha256: createHash('sha256').update(otherBytes).digest('hex'),
    });
    const next = await ingestReferenceCapture({
      repository,
      scope,
      candidate: duplicate,
      bytes: otherBytes,
      revision: first.revision,
      now,
    });
    expect(repository.previews.size).toBe(1);
    expect(next.revision).toBe(first.revision);
    expect(Object.keys(next.media)).toHaveLength(1);
  });
  it('bounds concurrent CAS losers to the same immutable preview slot', async () => {
    const { data } = await captured(),
      repository = store();
    repository.compareAndSet = async () => false;
    const attempts = Array.from({ length: 12 }, async (_, i) => {
      const distinctBytes = await sharp({
        create: {
          width: 8,
          height: 8,
          channels: 3,
          background: { r: i * 10, g: 0, b: 0 },
        },
      })
        .png()
        .toBuffer();
      return ingestReferenceCapture({
        repository,
        scope,
        candidate: candidate(i + 1, {
          ...data.media,
          sourceUrl: `https://source.example/reference/${i + 1}`,
          sha256: createHash('sha256').update(distinctBytes).digest('hex'),
          originalUrl: `https://media.example/${i}.png`,
        }),
        bytes: distinctBytes,
        revision: 0,
        now,
      });
    });
    const results = await Promise.allSettled(attempts);
    expect(results.every(result => result.status === 'rejected')).toBe(true);
    expect(repository.previews.size).toBe(1);
    expect(() => referencePreviewKey(scope, 500)).toThrow('slot');
  });
  it('verifies readable bytes, persists in existing scoped store and serves a same-origin preview identity', async () => {
    const { bytes, data } = await captured(),
      repository = store();
    const result = await ingestReferenceCapture({
      repository,
      scope,
      candidate: data,
      bytes,
      revision: 0,
      now,
    });
    expect(referenceView(result, scope).items[0].previewUrl).toMatch(
      /^\/api\/admin\/reference-review\/preview\?/u
    );
    expect(result.ratings).toEqual({});
    expect(repository.sessions.get(referenceScopeKey(scope))).toEqual(result);
    expect(repository.previews.get(referencePreviewKey(scope, 0))?.base64).toBe(
      bytes.toString('base64')
    );
    expect(
      await repository.readPreview(
        referencePreviewKey({ ...scope, tenantId: 'other' }, 0)
      )
    ).toBeNull();
  });
  it('rejects mismatched bytes and geometry without storing media or a session', async () => {
    const { bytes, data } = await captured(),
      repository = store();
    await expect(
      ingestReferenceCapture({
        repository,
        scope,
        candidate: {
          ...data,
          media: { ...data.media, sha256: '0'.repeat(64) },
        },
        bytes,
        revision: 0,
        now,
      })
    ).rejects.toThrow('digest');
    await expect(
      ingestReferenceCapture({
        repository,
        scope,
        candidate: { ...data, media: { ...data.media, width: 9 } },
        bytes,
        revision: 0,
        now,
      })
    ).rejects.toThrow('metadata');
    expect(repository.previews.size).toBe(0);
    expect(repository.sessions.size).toBe(0);
  });
  it('rejects a stale revision before writing any preview bytes', async () => {
    const { bytes, data } = await captured(),
      repository = store();
    repository.sessions.set(referenceScopeKey(scope), {
      ...createReferenceSession(scope, now),
      revision: 4,
    });
    await expect(
      ingestReferenceCapture({
        repository,
        scope,
        candidate: data,
        bytes,
        revision: 0,
        now,
      })
    ).rejects.toThrow('revision');
    expect(repository.previews.size).toBe(0);
  });
});
