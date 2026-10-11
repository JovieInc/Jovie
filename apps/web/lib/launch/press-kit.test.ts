import { describe, expect, it } from 'vitest';

import {
  decideLaunchAction,
  InMemoryLaunchRegistry,
  type LaunchRecord,
} from './index';
import {
  InMemoryPressKitRegistry,
  PRESS_KIT_MAX_ATTEMPTS,
  type PressKitFacts,
  pressKitIdFor,
  pressKitViewForLaunch,
} from './press-kit';

const availability = {
  publiclyAvailable: true,
  userAccessVerified: true,
  verifiedAt: '2026-10-01T00:00:00Z',
};

const decision = decideLaunchAction({
  verified: true,
  material: true,
  audienceEligible: true,
  availability,
  hasDurableDestination: true,
  hasPermittedChannel: true,
});

async function makeLaunch(
  overrides: Record<string, unknown> = {}
): Promise<LaunchRecord> {
  const registry = new InMemoryLaunchRegistry();
  return registry.commission({
    source: {
      kind: 'artist_release',
      entityId: 'release-123',
      revision: 'rev-1',
    },
    audience: 'public',
    job: 'hear the new single',
    decision,
    availability,
    claims: [
      {
        statement: 'The single is live on all streaming providers.',
        evidence: [{ kind: 'public_url', ref: 'https://jov.ie/x' }],
      },
    ],
    destination: { kind: 'release_page', canonicalRef: '/r/single' },
    channels: [
      { id: 'c1', kind: 'email', permissionRef: 'p1', audience: 'public' },
    ],
    ...overrides,
  });
}

function makeFacts(
  launch: LaunchRecord,
  over: Partial<PressKitFacts> = {}
): PressKitFacts {
  return {
    tenantId: 'tenant-1',
    launch,
    work: {
      workId: 'work-9',
      title: 'Midnight Run',
      releaseDate: '2026-10-10',
      availableNow: true,
      destinations: [{ label: 'Listen', url: 'https://jov.ie/x' }],
    },
    identity: {
      identityId: 'artist-7',
      name: 'Nova Ray',
      boilerplate: 'Nova Ray is an independent artist.',
      pressContact: { name: 'Pat', email: 'press@novaray.example' },
    },
    assets: [
      {
        assetId: 'a1',
        kind: 'artwork',
        uri: 's3://kit/cover.png',
        licensedForPress: true,
      },
      {
        assetId: 'a2',
        kind: 'preview',
        uri: 's3://kit/preview.mp3',
        licensedForPress: false,
      },
    ],
    ...over,
  };
}

describe('press kit preparation', () => {
  it('generates a ready kit with factual sections and licensed assets only', async () => {
    const launch = await makeLaunch();
    const registry = new InMemoryPressKitRegistry();
    const kit = await registry.prepare(makeFacts(launch));

    expect(kit.state).toBe('ready');
    expect(kit.kitId).toBe(pressKitIdFor('tenant-1', launch.launchId, 'rev-1'));
    expect(kit.launchId).toBe(launch.launchId);
    expect(kit.shareRef).toBeNull();

    const byKey = Object.fromEntries(
      kit.draft.sections.map(s => [s.key, s.body])
    );
    expect(byKey.headline).toContain('Nova Ray');
    expect(byKey.headline).toContain('Midnight Run');
    expect(byKey.availability).toContain('available now');
    expect(byKey.contact).toContain('press@novaray.example');
    expect(byKey.boilerplate).toContain('independent artist');

    expect(kit.assets.map(a => a.assetId)).toEqual(['a1']);
    expect(kit.gaps).toEqual([]);
  });

  it('is idempotent across replayed preparation for the same launch', async () => {
    const launch = await makeLaunch();
    const registry = new InMemoryPressKitRegistry();
    const first = await registry.prepare(makeFacts(launch));
    const second = await registry.prepare(makeFacts(launch));
    expect(second.kitId).toBe(first.kitId);
    expect(second.revisions).toHaveLength(1);
  });

  it('produces a partial draft with precise gaps when facts are missing', async () => {
    const launch = await makeLaunch();
    const registry = new InMemoryPressKitRegistry();
    const kit = await registry.prepare(
      makeFacts(launch, {
        work: { workId: 'work-9' },
        identity: { identityId: 'artist-7' },
        assets: [],
      })
    );
    expect(kit.state).toBe('needs_input');
    const kinds = kit.gaps.map(g => g.kind);
    expect(kinds).toContain('work_title');
    expect(kinds).toContain('availability');
    expect(kinds).toContain('identity_name');
    expect(kinds).toContain('boilerplate');
    expect(kinds).toContain('press_contact');
    expect(kinds).toContain('artwork');
    // no invented text in required sections
    const lede = kit.draft.sections.find(s => s.key === 'lede');
    expect(lede?.body).not.toContain('announces');
  });

  it('distinguishes scheduled work from actually available work', async () => {
    const launch = await makeLaunch();
    const registry = new InMemoryPressKitRegistry();
    const kit = await registry.prepare(
      makeFacts(launch, {
        work: {
          workId: 'w',
          title: 'T',
          releaseDate: '2026-12-01',
          availableNow: false,
        },
      })
    );
    const body = kit.draft.sections.find(s => s.key === 'availability')?.body;
    expect(body).toContain('scheduled for 2026-12-01');
    expect(body).not.toContain('available now');
  });

  it('never renders unapproved quotes as attributed quotations', async () => {
    const launch = await makeLaunch();
    const registry = new InMemoryPressKitRegistry();
    const kit = await registry.prepare(
      makeFacts(launch, {
        quotes: [
          { text: 'best yet', attribution: 'Nova Ray', approved: false },
          { text: 'a triumph', attribution: 'Critic', approved: true },
        ],
      })
    );
    expect(kit.draft.quotes.map(q => q.text)).toEqual(['a triumph']);
    expect(kit.draft.pendingQuotes.map(q => q.text)).toEqual(['best yet']);
  });

  it('marks a published kit out of date on material change and preserves edits', async () => {
    const launch = await makeLaunch();
    const registry = new InMemoryPressKitRegistry();
    await registry.prepare(makeFacts(launch));
    await registry.editSection(
      launch.launchId,
      'lede',
      'A hand-written lede.',
      'user-1'
    );
    const published = await registry.publish(launch.launchId, 'share:tok1');
    expect(published.publishedRevision).toBe(2);

    const changed = await registry.prepare(
      makeFacts(launch, {
        work: {
          workId: 'work-9',
          title: 'Midnight Run',
          releaseDate: '2026-11-01',
          availableNow: false,
        },
      })
    );
    expect(changed.state).toBe('out_of_date');
    expect(changed.publishedRevision).toBe(2);
    const lede = changed.draft.sections.find(s => s.key === 'lede');
    expect(lede?.body).toBe('A hand-written lede.');
    expect(lede?.userEdited).toBe(true);
    expect(changed.conflicts.some(c => c.section === 'availability')).toBe(
      false
    );
    expect(changed.revisions).toHaveLength(3);
  });

  it('drops assets whose rights were withdrawn on refresh', async () => {
    const launch = await makeLaunch();
    const registry = new InMemoryPressKitRegistry();
    const first = await registry.prepare(makeFacts(launch));
    expect(first.assets).toHaveLength(1);
    const facts = makeFacts(launch);
    const refreshed = await registry.prepare({
      ...facts,
      work: { ...facts.work!, releaseDate: '2026-11-05' },
      assets: [{ ...facts.assets![0], rightsWithdrawn: true }],
    });
    expect(refreshed.assets).toHaveLength(0);
  });

  it('refuses to publish a needs_input or failed draft', async () => {
    const launch = await makeLaunch();
    const registry = new InMemoryPressKitRegistry();
    await registry.prepare(
      makeFacts(launch, { work: { workId: 'w' }, identity: undefined })
    );
    await expect(registry.publish(launch.launchId, 'share:x')).rejects.toThrow(
      'needs_input'
    );
  });

  it('records failures honestly and bounds retries', async () => {
    const launch = await makeLaunch();
    const registry = new InMemoryPressKitRegistry();
    await registry.prepare(makeFacts(launch));
    const failed = await registry.fail(launch.launchId, 'provider timeout');
    expect(failed.state).toBe('failed');
    expect(failed.lastError).toBe('provider timeout');

    const retried = await registry.prepare(makeFacts(launch));
    expect(retried.state).toBe('ready');
    expect(retried.attemptCount).toBe(2);

    await registry.fail(launch.launchId, 'down again');
    await registry.prepare(makeFacts(launch));
    await registry.fail(launch.launchId, 'still down');
    const exhausted = await registry.prepare(makeFacts(launch));
    expect(exhausted.state).toBe('failed');
    expect(exhausted.attemptCount).toBe(PRESS_KIT_MAX_ATTEMPTS);
    expect(exhausted.stateDetail).toBe('retry budget exhausted');
  });

  it('keys kits by launch, not by work — one work can have many launches', async () => {
    const launchA = await makeLaunch();
    const launchB = await makeLaunch({
      source: {
        kind: 'artist_release',
        entityId: 'release-123',
        revision: 'rev-2',
      },
    });
    const registry = new InMemoryPressKitRegistry();
    const facts = makeFacts(launchA);
    const kitA = await registry.prepare(facts);
    const kitB = await registry.prepare({ ...facts, launch: launchB });
    expect(kitA.kitId).not.toBe(kitB.kitId);
    expect(kitA.workId).toBe(kitB.workId);
  });

  it('exposes a readiness view for the work inspector', async () => {
    const launch = await makeLaunch();
    const registry = new InMemoryPressKitRegistry();
    const kit = await registry.prepare(makeFacts(launch));
    const view = pressKitViewForLaunch(kit);
    expect(view.state).toBe('ready');
    expect(view.actions.find(a => a.id === 'review_press_kit')?.enabled).toBe(
      true
    );
    expect(view.actions.find(a => a.id === 'open_launch')?.enabled).toBe(true);
  });
});
