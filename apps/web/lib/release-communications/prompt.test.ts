import { describe, expect, it } from 'vitest';
import { InMemoryReleaseCommunicationsAdapter } from './index';
import {
  parseDailyWhatsNewPrompt,
  parseVerifiedMergeEvent,
  resolveDailyWhatsNewPrompt,
} from './prompt';

const CHANGELOG_URL = 'https://jov.ie/changelog';

const event = (overrides: Record<string, unknown> = {}) => ({
  repository: 'JovieInc/Jovie',
  pullRequestNumber: 100,
  mergeSha: 'aaa111',
  mergedAt: new Date('2026-10-01T15:00:00Z'),
  app: 'web' as const,
  product: 'jovie',
  title: 'Profile links are one tap',
  body: 'Claim a profile link from the homepage.',
  verified: true as const,
  ...overrides,
});

async function promptFor(
  adapter: InMemoryReleaseCommunicationsAdapter,
  postId: string,
  userId = 'user-1'
) {
  const post = await adapter.getDailyPost({
    product: 'jovie',
    app: 'web',
    localDate: '2026-10-01',
  });
  const dismissed = await adapter.isPostDismissed({ postId, userId });
  return resolveDailyWhatsNewPrompt({
    post,
    dismissed,
    changelogUrl: CHANGELOG_URL,
  });
}

describe('daily post delivery contract', () => {
  it('creates one post for the first merge and appends later merges', async () => {
    const adapter = new InMemoryReleaseCommunicationsAdapter('UTC');
    const first = await adapter.ingest(event());
    const second = await adapter.ingest(
      event({ pullRequestNumber: 101, mergeSha: 'bbb222' })
    );
    expect(second.id).toBe(first.id);
    expect(second.entries).toHaveLength(2);
    // Replay of the same merge event never duplicates its entry.
    expect((await adapter.ingest(event())).entries).toHaveLength(2);
  });

  it('suppresses the prompt for a minor-only post', async () => {
    const adapter = new InMemoryReleaseCommunicationsAdapter('UTC');
    const post = await adapter.ingest(event({ material: false }));
    expect(await promptFor(adapter, post.id)).toBeNull();
  });

  it('presents the prompt for a material post', async () => {
    const adapter = new InMemoryReleaseCommunicationsAdapter('UTC');
    const post = await adapter.ingest(event());
    const prompt = await promptFor(adapter, post.id);
    expect(prompt).toMatchObject({
      postId: post.id,
      localDate: '2026-10-01',
      title: 'Profile links are one tap',
      materialCount: 1,
      changelogUrl: CHANGELOG_URL,
    });
  });

  it('suppresses the whole post after dismissal, across resolution passes', async () => {
    const adapter = new InMemoryReleaseCommunicationsAdapter('UTC');
    const post = await adapter.ingest(event());
    await adapter.dismissPost({ postId: post.id, userId: 'user-1' });
    // A fresh resolution (new session) still finds the dismissal record.
    expect(await promptFor(adapter, post.id)).toBeNull();
    // Another user's dismissal record is independent.
    expect(await promptFor(adapter, post.id, 'user-2')).not.toBeNull();
  });

  it('presents the following day post after the prior post is dismissed', async () => {
    const adapter = new InMemoryReleaseCommunicationsAdapter('UTC');
    const dayOne = await adapter.ingest(event());
    await adapter.dismissPost({ postId: dayOne.id, userId: 'user-1' });

    const dayTwo = await adapter.ingest(
      event({
        pullRequestNumber: 102,
        mergeSha: 'ccc333',
        mergedAt: new Date('2026-10-02T09:00:00Z'),
        title: 'Share cards got faster',
      })
    );
    expect(dayTwo.id).not.toBe(dayOne.id);

    const dismissed = await adapter.isPostDismissed({
      postId: dayTwo.id,
      userId: 'user-1',
    });
    const prompt = resolveDailyWhatsNewPrompt({
      post: dayTwo,
      dismissed,
      changelogUrl: CHANGELOG_URL,
    });
    expect(prompt?.postId).toBe(dayTwo.id);
    expect(prompt?.localDate).toBe('2026-10-02');
  });
});

describe('parseVerifiedMergeEvent', () => {
  it('admits only explicitly verified events with merge identity', () => {
    expect(parseVerifiedMergeEvent(event({ verified: false }))).toBeNull();
    expect(parseVerifiedMergeEvent(event({ mergedAt: 'junk' }))).toBeNull();
    expect(
      parseVerifiedMergeEvent(event({ pullRequestNumber: -1 }))
    ).toBeNull();
    expect(parseVerifiedMergeEvent(null)).toBeNull();
    expect(
      parseVerifiedMergeEvent(event({ mergedAt: '2026-10-01T15:00:00Z' }))
    ).toMatchObject({ repository: 'JovieInc/Jovie', pullRequestNumber: 100 });
  });
});

describe('parseDailyWhatsNewPrompt', () => {
  it('rejects malformed payloads and accepts the contract', () => {
    expect(parseDailyWhatsNewPrompt(null)).toBeNull();
    expect(parseDailyWhatsNewPrompt({ prompt: null })).toBeNull();
    expect(
      parseDailyWhatsNewPrompt({ prompt: { postId: 'p1', title: '' } })
    ).toBeNull();
    const prompt = parseDailyWhatsNewPrompt({
      prompt: {
        contractVersion: 'release-communications/v1',
        postId: 'p1',
        localDate: '2026-10-01',
        title: 'Shipped',
        summary: 'Now',
        materialCount: 2,
        changelogUrl: CHANGELOG_URL,
      },
    });
    expect(prompt).toMatchObject({ postId: 'p1', materialCount: 2 });
  });
});
