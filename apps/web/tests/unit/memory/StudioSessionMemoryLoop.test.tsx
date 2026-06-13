/**
 * Focused tests for JOV-2704 / gh-9869 v0 studio-session memory loop
 * Covers: flag gating, evidence lineage, scoping (userId), harness integration.
 * Run: cd apps/web && pnpm exec vitest run tests/unit/memory/StudioSessionMemoryLoop.test.tsx
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { MemoryStudioSessionAdapter } from '@/lib/agents/agent-harness';
import { isEnabled } from '@/lib/feature-flags';
import { memoryFixtureScope } from '@/lib/memory/dev-fixtures';
import { MemoryFixtureStore } from '@/lib/memory/fixture-store';
import { runStudioSessionMemoryLoop } from '@/lib/workflows/memory/studio-session-loop';

// Mock the flag for tests
vi.mock('@/lib/feature-flags', async importOriginal => {
  const actual = await importOriginal<typeof import('@/lib/feature-flags')>();
  return {
    ...actual,
    isEnabled: vi.fn(),
  };
});

const mockIsEnabled = vi.mocked(isEnabled);

describe('studio-session memory loop (JOV-2704 / gh-9869 v0)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('is gated off by default (MEMORY_STUDIO_SESSION_V0=false)', async () => {
    mockIsEnabled.mockReturnValue(false);

    const result = await runStudioSessionMemoryLoop({
      userId: memoryFixtureScope.userId,
      creatorProfileId: memoryFixtureScope.creatorProfileId,
      triggerContext: { photoId: 'p1', taggedName: 'Test Person' },
    });

    expect(result.gated).toBe(true);
    expect(result.flag).toBe('MEMORY_STUDIO_SESSION_V0');
    expect(result.evidence).toHaveLength(0);
    expect(result.studioSessionId).toMatch(/^gated_/);
  });

  it('executes full loop when flag forced (demo path) and produces evidence with provenance', async () => {
    mockIsEnabled.mockReturnValue(true);

    const store = new MemoryFixtureStore();
    const harness = new MemoryStudioSessionAdapter(store);

    const result = await harness.runStudioSessionMemoryLoop({
      userId: memoryFixtureScope.userId,
      creatorProfileId: memoryFixtureScope.creatorProfileId,
      triggerContext: {
        photoId: 'p42',
        personName: 'Alex Rivera',
        location: 'Studio A',
      },
      sourceContextFactIds: ['cf_abc'],
      nearbyContextRefs: ['gmail:th_123', 'cal:evt_789'],
    });

    expect(result.studioSessionId).toBeTruthy();
    expect(result.personRef?.name).toBe('Alex Rivera');
    expect(result.personRef?.confidence).toBeGreaterThan(0.8);
    expect(result.evidence.length).toBeGreaterThanOrEqual(3);
    expect(result.provenance.flag).toBe('MEMORY_STUDIO_SESSION_V0');
    expect(result.provenance.sources).toContain('cf_abc');
    expect(result.opportunityRef?.approvalGated).toBe(true);
    expect(result.opportunityRef?.kind).toBe('content_opportunity');
    expect(
      store.observations.every(observation =>
        Boolean(observation.sourceRecordId)
      )
    ).toBe(true);
    expect(store.opportunities[0]?.status).toBe('pending');
  });

  it('preserves strict user scoping (no cross-user leakage in evidence)', async () => {
    mockIsEnabled.mockReturnValue(true);

    const storeA = new MemoryFixtureStore();
    const storeB = new MemoryFixtureStore();
    const harnessA = new MemoryStudioSessionAdapter(storeA);
    const harnessB = new MemoryStudioSessionAdapter(storeB);

    const scopeA = {
      userId: '00000000-0000-4000-8000-000000000010',
      creatorProfileId: '00000000-0000-4000-8000-000000000011',
    };
    const scopeB = {
      userId: '00000000-0000-4000-8000-000000000020',
      creatorProfileId: '00000000-0000-4000-8000-000000000021',
    };

    const resA = await harnessA.runStudioSessionMemoryLoop({
      ...scopeA,
      triggerContext: { photoId: 'pa', taggedName: 'Person A' },
    });

    const resB = await harnessB.runStudioSessionMemoryLoop({
      ...scopeB,
      triggerContext: { photoId: 'pb', taggedName: 'Person B' },
    });

    expect(resA.provenance.sources.every(s => !s.includes(scopeB.userId))).toBe(
      true
    );
    expect(resB.provenance.sources.every(s => !s.includes(scopeA.userId))).toBe(
      true
    );
    expect(
      storeA.entities.every(entity => entity.userId === scopeA.userId)
    ).toBe(true);
    expect(
      storeB.entities.every(entity => entity.userId === scopeB.userId)
    ).toBe(true);
  });
});
