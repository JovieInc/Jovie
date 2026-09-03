import { beforeEach, describe, expect, it } from 'vitest';

import {
  CHAT_EMPTY_HEADING,
  CHAT_EMPTY_ROTATE_SAMPLES,
  CHAT_EMPTY_SAMPLE_STORAGE_KEY,
  CHAT_EMPTY_STILL_SAMPLE,
  sampleAtIndex,
  takeNextEmptyChatSample,
} from './chat-empty-starters';

describe('chat empty rotate samples', () => {
  beforeEach(() => {
    sessionStorage.removeItem(CHAT_EMPTY_SAMPLE_STORAGE_KEY);
  });

  it('locks Just ask plus three role-neutral executable samples', () => {
    expect(CHAT_EMPTY_HEADING).toBe('Just ask');
    expect(CHAT_EMPTY_ROTATE_SAMPLES).toHaveLength(3);
    expect(CHAT_EMPTY_STILL_SAMPLE).toEqual(CHAT_EMPTY_ROTATE_SAMPLES[0]);
    expect(CHAT_EMPTY_HEADING).not.toMatch(/artist/i);
    for (const sample of CHAT_EMPTY_ROTATE_SAMPLES) {
      expect(sample.prompt.trim().length).toBeGreaterThan(0);
      expect(sample.reply.trim().length).toBeGreaterThan(0);
      expect(sample.prompt).not.toMatch(/artist/i);
      expect(sample.reply).not.toMatch(/artist/i);
    }
  });

  it('rotates in locked order and wraps', () => {
    expect(takeNextEmptyChatSample(sessionStorage).id).toBe(
      'plan-next-release'
    );
    expect(takeNextEmptyChatSample(sessionStorage).id).toBe('gaining-traction');
    expect(takeNextEmptyChatSample(sessionStorage).id).toBe('draft-a-pitch');
    expect(takeNextEmptyChatSample(sessionStorage).id).toBe(
      'plan-next-release'
    );
  });

  it('falls back to the still when storage is unavailable', () => {
    expect(takeNextEmptyChatSample(null)).toEqual(CHAT_EMPTY_STILL_SAMPLE);
  });

  it('wraps negative and oversized indexes onto the locked set', () => {
    expect(sampleAtIndex(-1).id).toBe('draft-a-pitch');
    expect(sampleAtIndex(3).id).toBe('plan-next-release');
  });

  it('keeps launched prompts identical to the displayed user prompt', () => {
    for (const sample of CHAT_EMPTY_ROTATE_SAMPLES) {
      expect(sample.prompt).toBe(sample.prompt.trim());
    }
  });
});
