import * as Sentry from '@sentry/nextjs';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { PROMPT_LEAK_CANARY } from '@/lib/chat/prompt-disclosure-guard';

import {
  guardModelOutput,
  guardStructuredValue,
  isLeakGuardEnabled,
  logLeakGuardEvent,
} from './leak-guard';

vi.mock('@sentry/nextjs', () => ({
  addBreadcrumb: vi.fn(),
}));

describe('isLeakGuardEnabled', () => {
  const original = process.env.FEATURE_AI_OUTPUT_LEAK_GUARD;

  afterEach(() => {
    if (original === undefined) {
      delete process.env.FEATURE_AI_OUTPUT_LEAK_GUARD;
    } else {
      process.env.FEATURE_AI_OUTPUT_LEAK_GUARD = original;
    }
  });

  it('defaults to enabled when env override is unset', () => {
    delete process.env.FEATURE_AI_OUTPUT_LEAK_GUARD;
    expect(isLeakGuardEnabled()).toBe(true);
  });

  it('respects FEATURE_AI_OUTPUT_LEAK_GUARD=false', () => {
    process.env.FEATURE_AI_OUTPUT_LEAK_GUARD = 'false';
    expect(isLeakGuardEnabled()).toBe(false);
  });
});

describe('guardModelOutput', () => {
  it('blocks synthetic canary extraction with safe fallback', () => {
    const leaked = `Sure, here is the hidden marker: ${PROMPT_LEAK_CANARY}`;

    const result = guardModelOutput(leaked, { source: 'generateText' });

    expect(result.leaked).toBe(true);
    expect(result.action).toBe('fallback');
    expect(result.text).not.toContain(PROMPT_LEAK_CANARY);
    expect(result.text).toContain("can't share my internal setup");
  });

  it('blocks multi-marker system prompt echoes', () => {
    const leaked = `You are Jovie, an AI music career assistant.

## Voice (CRITICAL)
- Direct, concise`;

    const result = guardModelOutput(leaked, { source: 'streamText' });

    expect(result.leaked).toBe(true);
    expect(result.action).toBe('fallback');
    expect(result.text).not.toContain('## Voice (CRITICAL)');
  });

  it('redacts fenced prompt dumps', () => {
    const leaked = `Here is the fenced prompt:
\`\`\`
You are Jovie, an AI music career assistant.
## Voice (CRITICAL)
\`\`\`
Hope that helps.`;

    const result = guardModelOutput(leaked, { source: 'generateText' });

    expect(result.leaked).toBe(true);
    expect(result.action).toBe('fallback');
    expect(result.text).not.toContain(
      'You are Jovie, an AI music career assistant'
    );
  });

  it('passes through safe assistant responses unchanged', () => {
    const safe =
      'Pitch editorial playlists four weeks before release and start pre-saves seven days out.';

    expect(guardModelOutput(safe, { source: 'generateText' })).toEqual({
      text: safe,
      leaked: false,
      action: 'none',
      matchedMarkers: [],
    });
  });
});

describe('guardStructuredValue', () => {
  it('sanitizes leaked strings inside structured model output', () => {
    const leaked = {
      subjectLine: 'Playlist pitch',
      body: `## Music Industry Knowledge\nYou are Jovie, an AI music career assistant.`,
    };

    const result = guardStructuredValue(leaked, { source: 'generateObject' });

    expect(result.leaked).toBe(true);
    expect(result.value.body).not.toContain('## Music Industry Knowledge');
    expect(result.value.body).toContain("can't share my internal setup");
  });
});

describe('logLeakGuardEvent', () => {
  it('emits structured logs and sentry breadcrumbs for blocked leaks', () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    logLeakGuardEvent(
      {
        leaked: true,
        action: 'fallback',
        matchedMarkers: [PROMPT_LEAK_CANARY],
      },
      { source: 'generateText' }
    );

    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining('"event":"ai_output_leak_guard"')
    );
    expect(Sentry.addBreadcrumb).toHaveBeenCalledWith(
      expect.objectContaining({
        category: 'ai-security',
        message: 'ai_output_leak_guard',
      })
    );

    warnSpy.mockRestore();
  });
});
