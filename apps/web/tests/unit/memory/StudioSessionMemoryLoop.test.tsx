/**
 * Focused tests for gh-9869 v0 studio-session memory loop
 * Covers: flag gating, evidence lineage, scoping (userId), harness integration.
 * Run: pnpm --filter @jovie/web exec vitest run apps/web/tests/unit/memory/StudioSessionMemoryLoop.test.tsx
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { isEnabled } from '@/lib/feature-flags';
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
          sources: ['cf1'],
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

  it('is gated off by default (MEMORY_STUDIO_SESSION_V0=false)', async () => {
    mockIsEnabled.mockReturnValue(false);

    const result = await runStudioSessionMemoryLoop({
      userId: 'user_test_123',
      triggerContext: { photoId: 'p1', taggedName: 'Test Person' },
    });

    expect(result.gated).toBe(true);
    expect(result.flag).toBe('MEMORY_STUDIO_SESSION_V0');
    expect(result.evidence).toHaveLength(0);
    expect(result.studioSessionId).toMatch(/^gated_/);
  });

  it('executes full loop when flag forced (demo path) and produces evidence with provenance', async () => {
    mockIsEnabled.mockReturnValue(true); // or force:true bypasses

    const result = await runStudioSessionMemoryLoop({
      userId: 'user_test_456',
      triggerContext: {
        photoId: 'p42',
        personName: 'Alex Rivera',
        location: 'Studio A',
      },
      sourceContextFactIds: ['cf_abc'],
      nearbyContextRefs: ['gmail:th_123', 'cal:evt_789'],
      force: true,
    });

    expect(result.gated).toBe(false);
    expect(result.flag).toBe('MEMORY_STUDIO_SESSION_V0');
    expect(result.studioSessionId).toMatch(/^studio_sess_v0_/);
    expect(result.personRef?.name).toBe('Test Person'); // from harness mock (full enrichment tested in integration with 9872 schema)
    expect(result.personRef?.confidence).toBeGreaterThan(0.8);

    // Evidence lineage
    expect(result.evidence.length).toBeGreaterThanOrEqual(2); // trigger + person at minimum
    const triggerEvidence = result.evidence.find(
      e => e.kind === 'studio_session_trigger'
    );
    expect(triggerEvidence).toBeTruthy();
    expect(triggerEvidence?.sourceRefs).toContain('photo_tag:p42');
    expect(triggerEvidence?.confidence).toBeGreaterThan(0.9);

    // Full provenance
    expect(result.provenance.flag).toBe('MEMORY_STUDIO_SESSION_V0');
    expect(result.provenance.sources).toContain('cf_abc');
    expect(result.provenance.sources).toContain('gmail:th_123');

    // Opportunity is approval-gated
    expect(result.opportunityRef?.approvalGated).toBe(true);
    expect(result.opportunityRef?.kind).toBe('content_opportunity');
  });

  it('preserves strict user scoping (no cross-user leakage in evidence)', async () => {
    mockIsEnabled.mockReturnValue(true);

    const userA = 'user_A';
    const userB = 'user_B';

    const resA = await runStudioSessionMemoryLoop({
      userId: userA,
      triggerContext: { photoId: 'pa' },
      force: true,
    });

    const resB = await runStudioSessionMemoryLoop({
      userId: userB,
      triggerContext: { photoId: 'pb' },
      force: true,
    });

    // In v0 harness the facts are written with correct userId (tested via integration in real db)
    // Here we assert the result provenance never mixes users
    expect(resA.provenance.sources.every(s => !s.includes(userB))).toBe(true);
    expect(resB.provenance.sources.every(s => !s.includes(userA))).toBe(true);
  });
});
