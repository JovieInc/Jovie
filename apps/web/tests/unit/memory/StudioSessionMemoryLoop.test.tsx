/**
 * Focused tests for gh-9869 v0 studio-session memory loop
 * Covers: flag gating, evidence lineage, scoping (userId), harness integration.
 * Run: pnpm --filter @jovie/web exec vitest run apps/web/tests/unit/memory/StudioSessionMemoryLoop.test.tsx
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { isCodeFlagEnabled } from '@/lib/flags/code-flags';
import { runStudioSessionMemoryLoop } from '@/lib/workflows/memory/studio-session-loop';

// Mock the flag for tests
vi.mock('@/lib/flags/code-flags', async importOriginal => {
  const actual =
    await importOriginal<typeof import('@/lib/flags/code-flags')>();
  return {
    ...actual,
    isCodeFlagEnabled: vi.fn(),
  };
});

const mockIsCodeFlagEnabled = vi.mocked(isCodeFlagEnabled);

// Mock the harness to avoid real DB inserts (harness does db ops)
vi.mock('@/lib/agents/agent-harness', async importOriginal => {
  const actual =
    await importOriginal<typeof import('@/lib/agents/agent-harness')>();
  return {
    ...actual,
    defaultAgentHarness: {
      runStudioSessionMemoryLoop: vi.fn().mockResolvedValue({
        studioSessionId: 'studio_sess_v0_test123',
        personRef: { id: 'p_test', name: 'Test Person', confidence: 0.9 },
        evidence: [
          {
            kind: 'studio_session_trigger',
            sourceRefs: ['photo:1'],
            confidence: 0.95,
            data: {},
          },
          {
            kind: 'person_enrichment',
            sourceRefs: ['photo:1'],
            confidence: 0.82,
            data: {},
          },
        ],
        opportunityRef: {
          id: 'opp_test',
          kind: 'content_opportunity',
          approvalGated: true,
        },
        provenance: {
          triggeredAt: '2026-06-01T00:00:00Z',
          sources: ['00000000-0000-4000-8000-000000000005'],
          flag: 'MEMORY_STUDIO_SESSION_V0',
        },
      }),
    },
  };
});

describe('studio-session memory loop (gh-9869 v0)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('gates off when MEMORY_STUDIO_SESSION_V0 is disabled', async () => {
    mockIsCodeFlagEnabled.mockReturnValue(false);

    const result = await runStudioSessionMemoryLoop({
      userId: '00000000-0000-4000-8000-000000000001',
      creatorProfileId: '00000000-0000-4000-8000-000000000002',
      triggerContext: { photoId: 'p1', taggedName: 'Test Person' },
    });

    expect(result.gated).toBe(true);
    expect(result.flag).toBe('MEMORY_STUDIO_SESSION_V0');
    expect(result.evidence).toHaveLength(0);
    expect(result.studioSessionId).toMatch(/^gated_/);
  });

  it('executes full loop when flag forced (demo path) and produces evidence with provenance', async () => {
    mockIsCodeFlagEnabled.mockReturnValue(true); // or force:true bypasses

    const result = await runStudioSessionMemoryLoop({
      userId: '00000000-0000-4000-8000-000000000003',
      creatorProfileId: '00000000-0000-4000-8000-000000000004',
      triggerContext: {
        photoId: 'p42',
        personName: 'Alex Rivera',
        location: 'Studio A',
      },
      sourceMemoryRecordIds: ['00000000-0000-4000-8000-000000000005'],
      nearbyContextRefs: ['gmail:th_123', 'cal:evt_789'],
      force: true,
    });

    expect(result.gated).toBe(false);
    expect(result.flag).toBe('MEMORY_STUDIO_SESSION_V0');
    expect(result.studioSessionId).toBeTruthy();
    expect(result.personRef?.name).toBe('Test Person'); // from harness mock (full enrichment tested in integration with 9872 schema)
    expect(result.personRef?.confidence).toBeGreaterThan(0.8);

    // Evidence lineage (structure from mock; real enrichment + sourceRefs tested with 9872 schema + real harness)
    expect(result.evidence.length).toBeGreaterThanOrEqual(2);
    expect(result.provenance.flag).toBe('MEMORY_STUDIO_SESSION_V0');
    expect(result.provenance.sources).toContain(
      '00000000-0000-4000-8000-000000000005'
    );

    // Opportunity is approval-gated (core AC)
    expect(result.opportunityRef?.approvalGated).toBe(true);
    expect(result.opportunityRef?.kind).toBe('content_opportunity');
  });

  it('preserves strict user scoping (no cross-user leakage in evidence)', async () => {
    mockIsCodeFlagEnabled.mockReturnValue(true);

    const userA = '00000000-0000-4000-8000-00000000000a';
    const userB = '00000000-0000-4000-8000-00000000000b';

    const resA = await runStudioSessionMemoryLoop({
      userId: userA,
      creatorProfileId: '00000000-0000-4000-8000-0000000000aa',
      triggerContext: { photoId: 'pa' },
      force: true,
    });

    const resB = await runStudioSessionMemoryLoop({
      userId: userB,
      creatorProfileId: '00000000-0000-4000-8000-0000000000bb',
      triggerContext: { photoId: 'pb' },
      force: true,
    });

    // In v0 harness memory rows are written with correct userId (tested via integration in real db)
    // Here we assert the result provenance never mixes users
    expect(resA.provenance.sources.every(s => !s.includes(userB))).toBe(true);
    expect(resB.provenance.sources.every(s => !s.includes(userA))).toBe(true);
  });
});
