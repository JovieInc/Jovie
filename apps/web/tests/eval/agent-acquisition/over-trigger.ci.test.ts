/**
 * Deterministic CI lane for the ChatGPT over-trigger eval (JOV-9688).
 * No model, DB or network: it proves the 20 artist-intent and 20 listener
 * case sets stay sound, that every artist case drives the real acquisition
 * tool registry, that listener prompts can never create drafts, and that
 * the live tool copy keeps the listing's no-"fan" rule.
 */
import { describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));
vi.mock('@/lib/rate-limit', () => ({
  publicArtistApiLimiter: { limit: vi.fn() },
  agentProfileCreateLimiter: { limit: vi.fn() },
  agentWriteGlobalLimiter: { limit: vi.fn() },
  getClientIP: () => '192.0.2.1',
  createRateLimitHeaders: () => ({ 'Retry-After': '60' }),
}));
vi.mock('@/lib/flags/server', () => ({
  getAppFlagValue: vi.fn(async () => true),
}));
vi.mock('@/lib/error-tracking', () => ({
  captureError: vi.fn(async () => undefined),
}));
vi.mock('@/lib/agent-acquisition/artist-resolution', () => ({
  resolveAgentArtist: vi.fn(),
}));
vi.mock('@/lib/agent-acquisition/draft-store', () => ({
  createAgentDraft: vi.fn(),
  readAgentDraft: vi.fn(),
}));
vi.mock('@/lib/agent-acquisition/release-launch', () => ({
  prepareReleaseLaunch: vi.fn(),
}));

import { AGENT_DRAFT_TOOLS } from '@/lib/agent-acquisition/api';
import { ARTIST_INTENT_CASES, LISTENER_CASES } from './cases';
import {
  ARTIST_CHAIN_ENTRY_TOOL,
  DRAFT_CREATING_TOOLS,
  scoreArtistIntentCase,
  scoreListenerCase,
} from './spec';

const artistPrompts = ARTIST_INTENT_CASES.map(c => c.prompt);
const listenerPrompts = LISTENER_CASES.map(c => c.prompt);

describe('over-trigger case set', () => {
  it('is exactly 20 artist-intent and 20 listener prompts', () => {
    expect(ARTIST_INTENT_CASES).toHaveLength(20);
    expect(LISTENER_CASES).toHaveLength(20);
  });

  it('has unique ids and unique, disjoint prompts', () => {
    const artistIds = ARTIST_INTENT_CASES.map(c => c.id);
    const listenerIds = LISTENER_CASES.map(c => c.id);
    expect(new Set([...artistIds, ...listenerIds]).size).toBe(40);
    expect(new Set(artistPrompts).size).toBe(20);
    expect(new Set(listenerPrompts).size).toBe(20);
    for (const prompt of listenerPrompts)
      expect(artistPrompts).not.toContain(prompt);
  });

  it('keeps prompts short, plain text', () => {
    for (const prompt of [...artistPrompts, ...listenerPrompts]) {
      expect(prompt.length).toBeGreaterThan(10);
      expect(prompt.length).toBeLessThanOrEqual(200);
      expect(prompt).toMatch(/^[^*_`#@]+$/u);
    }
  });

  it('drives only the real acquisition tools, resolving identity first', () => {
    const toolNames = AGENT_DRAFT_TOOLS.map(tool => tool.name);
    for (const testCase of ARTIST_INTENT_CASES) {
      expect(testCase.requiredToolCalls.length).toBeGreaterThan(0);
      for (const tool of testCase.requiredToolCalls)
        expect(toolNames).toContain(tool);
      expect(testCase.requiredToolCalls[0]).toBe(ARTIST_CHAIN_ENTRY_TOOL);
      // No draft may be created before the exact artist identity is resolved:
      // the chain entry is always first, so draft tools only appear after it.
      for (const [index, tool] of testCase.requiredToolCalls.entries()) {
        if ((DRAFT_CREATING_TOOLS as readonly string[]).includes(tool))
          expect(index).toBeGreaterThan(0);
      }
    }
  });

  it('keeps the listing no-"fan" rule in the live tool copy', () => {
    for (const tool of AGENT_DRAFT_TOOLS)
      expect(tool.description ?? '').not.toMatch(/\bfans?\b/i);
  });
});

describe('over-trigger transcript checks', () => {
  const fullChainCase = ARTIST_INTENT_CASES.find(
    c => c.requiredToolCalls.length === 3
  );
  const searchOnlyCase = ARTIST_INTENT_CASES.find(
    c => c.requiredToolCalls.length === 1
  );

  it('passes an artist prompt that calls the required chain in order', () => {
    if (!fullChainCase) throw new Error('missing full-chain case');
    const calls = [
      'artist.search_or_import',
      'workspace.create_draft',
      'release.prepare_launch',
    ];
    expect(scoreArtistIntentCase(fullChainCase, calls).passed).toBe(true);
    // Extra surrounding calls do not void a passing chain.
    expect(
      scoreArtistIntentCase(fullChainCase, [
        'artist.search_or_import',
        'some_other_tool',
        ...calls.slice(1),
      ]).passed
    ).toBe(true);
  });

  it('fails an artist prompt answered with no tool call', () => {
    if (!searchOnlyCase) throw new Error('missing search-only case');
    expect(scoreArtistIntentCase(searchOnlyCase, []).passed).toBe(false);
  });

  it('fails an artist prompt that drafts before resolving identity', () => {
    if (!fullChainCase) throw new Error('missing full-chain case');
    const outOfOrder = [
      'workspace.create_draft',
      'artist.search_or_import',
      'release.prepare_launch',
    ];
    const verdict = scoreArtistIntentCase(fullChainCase, outOfOrder);
    expect(verdict.passed).toBe(false);
    expect(verdict.reason).toContain('not called in order');
  });

  it('fails an artist prompt that stops before the required chain', () => {
    if (!fullChainCase) throw new Error('missing full-chain case');
    const partial = ['artist.search_or_import', 'workspace.create_draft'];
    expect(scoreArtistIntentCase(fullChainCase, partial).passed).toBe(false);
  });

  it('passes a listener prompt with no calls or read-only calls', () => {
    expect(scoreListenerCase([]).passed).toBe(true);
    expect(scoreListenerCase(['artist.search_or_import']).passed).toBe(true);
  });

  it('fails every listener transcript that creates a draft', () => {
    for (const tool of DRAFT_CREATING_TOOLS) {
      const verdict = scoreListenerCase(['artist.search_or_import', tool]);
      expect(verdict.passed).toBe(false);
      expect(verdict.reason).toContain('created a draft');
    }
  });
});
