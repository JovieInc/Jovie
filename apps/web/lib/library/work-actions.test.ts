import { describe, expect, it } from 'vitest';
import {
  deriveWorkPrimaryAction,
  launchesForWork,
  resolveWorkLaunch,
  type WorkLaunchSummary,
} from './work-actions';

function asset(overrides: Record<string, unknown> = {}) {
  return {
    id: 'release-1',
    itemKind: 'release',
    status: 'released',
    smartLinkPath: '/tim/take-me-over',
    profileVisibility: 'visible',
    share: null,
    ...overrides,
  } as Parameters<typeof deriveWorkPrimaryAction>[0]['asset'];
}

function launch(overrides: Partial<WorkLaunchSummary> = {}): WorkLaunchSummary {
  return {
    id: 'launch-1',
    workId: 'release-1',
    title: 'Take Me Over launch',
    kitStatus: 'ready',
    launchHref: '/app/releases/release-1/tasks',
    updatedAt: '2026-09-01T00:00:00.000Z',
    ...overrides,
  };
}

describe('deriveWorkPrimaryAction', () => {
  it('selects Share page for a live public page', () => {
    const action = deriveWorkPrimaryAction({
      asset: asset(),
      canPublish: true,
    });
    expect(action.kind).toBe('share_page');
    expect(action.blockedReason).toBeNull();
  });

  it('selects Review & publish for a prepared unpublished work', () => {
    const action = deriveWorkPrimaryAction({
      asset: asset({ status: 'scheduled', smartLinkPath: '' }),
      canPublish: true,
    });
    expect(action.kind).toBe('review_publish');
    expect(action.blockedReason).toBeNull();
  });

  it('reports a blocker when publish permission is missing', () => {
    const action = deriveWorkPrimaryAction({
      asset: asset({ status: 'draft', smartLinkPath: '' }),
      canPublish: false,
    });
    expect(action.kind).toBe('review_publish');
    expect(action.blockedReason).toMatch(/permission/i);
  });

  it('selects Share privately for intentional private work without nagging', () => {
    const action = deriveWorkPrimaryAction({
      asset: asset({ profileVisibility: 'hidden' }),
      canPublish: true,
    });
    expect(action.kind).toBe('share_privately');
    expect(action.blockedReason).toBeNull();
  });

  it('treats a private share setting as intentional private work', () => {
    const action = deriveWorkPrimaryAction({
      asset: asset({
        share: { visibility: 'private', shareUrl: 'https://jov.ie/p/tok' },
      }),
      canPublish: true,
    });
    expect(action.kind).toBe('share_privately');
  });

  it('keeps non-release work on private sharing', () => {
    const action = deriveWorkPrimaryAction({
      asset: asset({ itemKind: 'merch' }),
      canPublish: true,
    });
    expect(action.kind).toBe('share_privately');
  });
});

describe('launch scoping', () => {
  it('returns no launch slot for unrelated work', () => {
    const launches = [launch({ workId: 'release-2' })];
    expect(launchesForWork(launches, 'release-1')).toEqual([]);
    expect(resolveWorkLaunch(launches, 'release-1')).toBeNull();
  });

  it('keeps multiple launches for one work distinguishable', () => {
    const launches = [
      launch({ id: 'launch-old', updatedAt: '2026-01-01T00:00:00.000Z' }),
      launch({ id: 'launch-new', updatedAt: '2026-09-01T00:00:00.000Z' }),
      launch({ id: 'other', workId: 'release-9' }),
    ];
    expect(launchesForWork(launches, 'release-1').map(item => item.id)).toEqual(
      ['launch-new', 'launch-old']
    );
  });

  it('opens the selected launch revision, not the globally newest kit', () => {
    const launches = [
      launch({ id: 'launch-a', updatedAt: '2026-09-01T00:00:00.000Z' }),
      launch({ id: 'launch-b', updatedAt: '2026-01-01T00:00:00.000Z' }),
    ];
    expect(resolveWorkLaunch(launches, 'release-1', 'launch-b')?.id).toBe(
      'launch-b'
    );
    expect(resolveWorkLaunch(launches, 'release-1')?.id).toBe('launch-a');
  });
});
