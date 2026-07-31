import { describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));

import { readReleaseLifecycleState } from '@/lib/releases/release-lifecycle.server';

describe('release lifecycle state (JOV-3374)', () => {
  it('reads deletedAt as the canonical archive state', () => {
    const archivedAt = new Date('2026-07-01T00:00:00.000Z');

    expect(readReleaseLifecycleState({ deletedAt: archivedAt })).toEqual({
      status: 'archived',
      archivedAt,
    });
    expect(readReleaseLifecycleState({ deletedAt: null })).toEqual({
      status: 'active',
      archivedAt: null,
    });
  });
});
