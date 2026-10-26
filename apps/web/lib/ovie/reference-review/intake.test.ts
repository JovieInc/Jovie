import { createHash } from 'node:crypto';
import sharp from 'sharp';
import { describe, expect, it } from 'vitest';
import {
  createReferenceSession,
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
