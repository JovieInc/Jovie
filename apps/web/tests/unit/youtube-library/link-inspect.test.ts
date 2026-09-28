import { describe, expect, it } from 'vitest';
import {
  applyYouTubeLink,
  approvalFromPlan,
  createMemoryYouTubeLinkStore,
  sourceVersionFor,
  YOUTUBE_LINK_WRITE_SCOPE,
} from '@/lib/youtube-library/link-apply';
import { inspectYouTubeLink } from '@/lib/youtube-library/link-inspect';

const ID = 'abc123';
const VIDEO = `https://www.youtube.com/watch?v=${ID}`;
const EXP = 'https://jov.ie/timwhite/neon-skyline';
const NOW = new Date('2026-09-16T12:00:00.000Z');

function inspect(description: string | null, extra = {}) {
  return inspectYouTubeLink({
    description,
    expectedUrl: EXP,
    videoUrl: VIDEO,
    ...extra,
  });
}

function snippet(
  description: string,
  failReadback = false,
  nullReadback = false
) {
  let live = {
    id: ID,
    etag: 'etag-1',
    snippet: {
      title: 'Neon Skyline',
      description,
      categoryId: '10',
      channelId: 'UC-owned',
    },
  };
  const writes: string[] = [];
  return {
    writes,
    async getVideo() {
      if (nullReadback && writes.length === 1) return null;
      if (failReadback && writes.length === 1) {
        return {
          ...live,
          snippet: { ...live.snippet, description: 'tampered' },
        };
      }
      return live;
    },
    async updateVideo(input: { snippet: { description: string } }) {
      writes.push(input.snippet.description);
      live = {
        ...live,
        snippet: { ...live.snippet, ...input.snippet },
      };
      return live;
    },
  };
}

function approval(description: string) {
  return approvalFromPlan({
    videoId: ID,
    plan: inspect(description),
    sourceVersion: sourceVersionFor(description, 'etag-1'),
  });
}

type ApplyInput = Parameters<typeof applyYouTubeLink>[0];
interface ApplyOptions {
  readonly failReadback?: boolean;
  readonly nullReadback?: boolean;
  readonly approval?: ApplyInput['approval'];
  readonly auth?: ApplyInput['auth'];
}

async function apply(description: string, extra: ApplyOptions = {}) {
  const writer = snippet(
    description,
    extra.failReadback === true,
    extra.nullReadback === true
  );
  const result = await applyYouTubeLink({
    videoId: ID,
    videoUrl: VIDEO,
    expectedUrl: EXP,
    approval: extra.approval ?? approval(description),
    auth: extra.auth ?? {
      state: 'ok',
      scopes: [YOUTUBE_LINK_WRITE_SCOPE],
    },
    writer,
    store: createMemoryYouTubeLinkStore(),
    now: NOW,
  });
  return { result, writer };
}

describe('YouTube Jovie link inspect/apply', () => {
  it('classifies missing, verified, stale, unknown, loop, limit', () => {
    const missing = inspect('Ada\nhttps://open.spotify.com/track/1?si=aff');
    expect(missing.status).toBe('missing');
    expect(missing.proposedDescription).toContain('si=aff');
    expect(inspect(`Listen: ${EXP}?utm_source=yt`).status).toBe('verified');
    const stale = inspect(
      'https://jov.ie/old-handle/old-slug?utm_source=yt&aff=p'
    );
    expect(stale.status).toBe('stale');
    expect(stale.proposedDescription).toContain('aff=p');
    expect(
      inspect('x', { expectedUrl: VIDEO, destinationUrl: VIDEO }).blockedReason
    ).toBe('redirect-loop');
  });

  it('applies with readback and fail-closes red paths', async () => {
    const ok = await apply('Directed by Ada.');
    expect(ok.result.ok).toBe(true);
    expect(ok.writer.writes[0]).toContain(EXP);
    const keep = await apply(`Listen: ${EXP}`);
    expect(keep.writer.writes).toEqual([]);
    expect(
      (
        await apply('hello', {
          auth: {
            state: 'ok',
            scopes: ['https://www.googleapis.com/auth/youtube.readonly'],
          },
        })
      ).result
    ).toMatchObject({ error: 'insufficient-permissions' });
    expect(
      (await apply('hello', { auth: { state: 'revoked' } })).result
    ).toMatchObject({ error: 'revoked-auth' });
    expect(
      (
        await apply('current', {
          approval: approval('older description'),
        })
      ).result
    ).toMatchObject({ error: 'stale-approval' });
    const rolled = await apply('Directed by Ada.', {
      failReadback: true,
    });
    expect(rolled.result).toMatchObject({
      error: 'readback-mismatch',
    });
    expect(rolled.writer.writes.at(-1)).toBe('Directed by Ada.');
    const missingReadback = await apply('Directed by Ada.', {
      nullReadback: true,
    });
    expect(missingReadback.result).toMatchObject({
      error: 'readback-mismatch',
    });
    const a = await apply('Need a link');
    const b = await apply('Need a link', {
      auth: { state: 'revoked' },
    });
    expect(a.result.ok).toBe(true);
    expect(b.result.ok).toBe(false);
  });
});
