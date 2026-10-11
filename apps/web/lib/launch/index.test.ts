import { describe, expect, it } from 'vitest';
import {
  type CommissionLaunchInput,
  decideLaunchAction,
  InMemoryLaunchRegistry,
  launchIdForSource,
} from './index';

const availability = (overrides: Record<string, unknown> = {}) => ({
  publiclyAvailable: true,
  userAccessVerified: true,
  verifiedAt: '2026-10-01T00:00:00Z',
  ...overrides,
});

const decisionInput = (overrides: Record<string, unknown> = {}) => ({
  verified: true,
  material: true,
  audienceEligible: true,
  availability: availability(),
  hasDurableDestination: true,
  hasPermittedChannel: true,
  ...overrides,
});

const commissionInput = (
  overrides: Record<string, unknown> = {}
): CommissionLaunchInput => ({
  source: {
    kind: 'jovie_capability',
    entityId: 'JovieInc/Jovie#19930',
    revision: 'abc123',
  },
  audience: 'public',
  job: 'share the new capability',
  decision: decideLaunchAction(decisionInput()),
  availability: availability(),
  claims: [
    {
      statement: 'Smart links route fans to streaming providers',
      evidence: [{ kind: 'public_url', ref: 'https://jov.ie/demo' }],
    },
  ],
  destination: {
    kind: 'canonical_tutorial',
    canonicalRef: '/docs/tutorials/smart-links',
  },
  channels: [
    {
      id: 'ig-post-1',
      kind: 'social_post',
      permissionRef: 'approval:queue:421',
      audience: 'public',
    },
  ],
  contentRevisions: [{ contentRef: 'tutorial:smart-links', revision: 'r3' }],
  conversionEvent: 'smart_link_created',
  ...overrides,
});

describe('decideLaunchAction', () => {
  it('takes no action on unverified or non-material sources', () => {
    expect(decideLaunchAction(decisionInput({ verified: false })).kind).toBe(
      'no_action'
    );
    const patch = decideLaunchAction(decisionInput({ material: false }));
    expect(patch.kind).toBe('no_action');
    expect(patch.reason).toBe('internal-refactor-or-patch-release');
  });

  it('separates public availability from verified merge', () => {
    const notPublic = decideLaunchAction(
      decisionInput({
        availability: availability({ publiclyAvailable: false }),
      })
    );
    expect(notPublic).toMatchObject({
      kind: 'no_action',
      reason: 'not-publicly-available',
    });
    const noAccess = decideLaunchAction(
      decisionInput({
        availability: availability({ userAccessVerified: false }),
      })
    );
    expect(noAccess.kind).toBe('doc_update');
  });

  it('coordinated launches need a durable destination and permitted channel', () => {
    expect(decideLaunchAction(decisionInput()).kind).toBe('coordinated_launch');
    expect(
      decideLaunchAction(decisionInput({ hasPermittedChannel: false })).kind
    ).toBe('changelog_notice');
    expect(
      decideLaunchAction(
        decisionInput({ hasPermittedChannel: false, teachesTask: true })
      ).kind
    ).toBe('tutorial_demo');
    const internal = decideLaunchAction(
      decisionInput({ audienceEligible: false })
    );
    expect(internal.kind).toBe('changelog_notice');
  });
});

describe('InMemoryLaunchRegistry', () => {
  it('derives a stable launch id and never duplicates on replay', async () => {
    const registry = new InMemoryLaunchRegistry();
    const first = await registry.commission(commissionInput());
    expect(first.launchId).toBe(launchIdForSource(commissionInput().source));
    const replay = await registry.commission(commissionInput());
    expect(replay).toBe(first);
  });

  it('rejects evidence-free claims', async () => {
    const registry = new InMemoryLaunchRegistry();
    await expect(
      registry.commission(
        commissionInput({
          claims: [{ statement: '10x growth', evidence: [] }],
        })
      )
    ).rejects.toThrow('evidence');
  });

  it('rejects coordinated launches without destination or channel', async () => {
    const registry = new InMemoryLaunchRegistry();
    await expect(
      registry.commission(commissionInput({ destination: null }))
    ).rejects.toThrow('destination');
    await expect(
      registry.commission(commissionInput({ channels: [] }))
    ).rejects.toThrow('channel');
  });

  it('accepts only external delivery receipts and dedupes them', async () => {
    const registry = new InMemoryLaunchRegistry();
    const launch = await registry.commission(commissionInput());
    await expect(
      registry.recordReceipt(launch.launchId, {
        externalId: '',
        channel: 'instagram',
        status: 'delivered',
        observedAt: '2026-10-01T01:00:00Z',
      })
    ).rejects.toThrow('external');
    const withReceipt = await registry.recordReceipt(launch.launchId, {
      externalId: 'ig-media-123',
      channel: 'instagram',
      status: 'delivered',
      observedAt: '2026-10-01T01:00:00Z',
    });
    const replay = await registry.recordReceipt(launch.launchId, {
      externalId: 'ig-media-123',
      channel: 'instagram',
      status: 'delivered',
      observedAt: '2026-10-01T01:00:00Z',
    });
    expect(replay.receipts).toHaveLength(1);
    expect(withReceipt.status).toBe('delivered');
  });

  it('advances lifecycle status monotonically and annotates withdrawals', async () => {
    const registry = new InMemoryLaunchRegistry();
    const launch = await registry.commission(commissionInput());
    const visited = await registry.recordOutcome(launch.launchId, {
      kind: 'visited',
      count: 42,
      observationWindow: '2026-10-01/2026-10-08',
      observedAt: '2026-10-08T00:00:00Z',
    });
    expect(visited.status).toBe('visited');
    const activated = await registry.recordOutcome(launch.launchId, {
      kind: 'activated',
      count: 3,
      observationWindow: '2026-10-01/2026-10-08',
      observedAt: '2026-10-08T00:00:00Z',
    });
    expect(activated.status).toBe('activated');
    const retracted = await registry.annotate(
      launch.launchId,
      'retracted',
      'claim updated after capability scope changed'
    );
    expect(retracted.status).toBe('retracted');
    expect(retracted.statusNote).toContain('capability');
    const stillRetracted = await registry.recordOutcome(launch.launchId, {
      kind: 'retained',
      count: 1,
      observationWindow: '2026-10-08/2026-10-15',
      observedAt: '2026-10-15T00:00:00Z',
    });
    expect(stillRetracted.status).toBe('retracted');
    await expect(
      registry.annotate(launch.launchId, 'withdrawn', '')
    ).rejects.toThrow('note');
  });
});
