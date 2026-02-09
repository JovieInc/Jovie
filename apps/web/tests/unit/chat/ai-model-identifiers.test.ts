import { describe, expect, it } from 'vitest';
import { CHAT_MODEL, TITLE_MODEL } from '@/lib/constants/ai-models';

/**
 * Tests that AI Gateway model identifiers use the correct format.
 *
 * The Vercel AI Gateway requires `provider/model-name` (forward slash).
 * Using a colon (e.g. `anthropic:claude-sonnet-4-20250514`) returns a
 * 404 GatewayModelNotFoundError at runtime — a bug that is invisible to
 * TypeScript and was only caught via Sentry in production.
 *
 * These tests act as a compile-time-equivalent safety net: if someone
 * changes a model identifier to the wrong format, CI will fail.
 */

const GATEWAY_ID_PATTERN = /^[a-z0-9-]+\/[a-z0-9._-]+$/;

describe('AI Gateway model identifiers', () => {
  it.each([
    ['CHAT_MODEL', CHAT_MODEL],
    ['TITLE_MODEL', TITLE_MODEL],
  ])('%s uses provider/model format (forward slash)', (_name, identifier) => {
    expect(identifier).toMatch(GATEWAY_ID_PATTERN);
  });

  it.each([
    ['CHAT_MODEL', CHAT_MODEL],
    ['TITLE_MODEL', TITLE_MODEL],
  ])('%s does not use colon separator', (_name, identifier) => {
    expect(identifier).not.toContain(':');
  });

  it('CHAT_MODEL specifies the anthropic provider', () => {
    expect(CHAT_MODEL.split('/')[0]).toBe('anthropic');
  });

  it('TITLE_MODEL specifies the google provider', () => {
    expect(TITLE_MODEL.split('/')[0]).toBe('google');
  });
});
