import { describe, expect, it } from 'vitest';
import {
  ALBUM_ART_GATEWAY_IMAGE_MODEL,
  CHAT_MODEL,
  CHAT_MODEL_LIGHT,
  CHAT_MODEL_ROTATION_CHAIN,
  GATEWAY_ALLOWED_MODELS,
  GATEWAY_ALLOWLIST_NAME,
  INSIGHT_MODEL,
  PACKAGING_INTELLIGENCE_MODEL,
  PITCH_MODEL,
  TITLE_MODEL,
} from '@/lib/constants/ai-models';

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
    ['ALBUM_ART_GATEWAY_IMAGE_MODEL', ALBUM_ART_GATEWAY_IMAGE_MODEL],
  ])('%s uses provider/model format (forward slash)', (_name, identifier) => {
    expect(identifier).toMatch(GATEWAY_ID_PATTERN);
  });

  it.each([
    ['CHAT_MODEL', CHAT_MODEL],
    ['TITLE_MODEL', TITLE_MODEL],
    ['ALBUM_ART_GATEWAY_IMAGE_MODEL', ALBUM_ART_GATEWAY_IMAGE_MODEL],
  ])('%s does not use colon separator', (_name, identifier) => {
    expect(identifier).not.toContain(':');
  });

  it('every runtime text model is on the founder gateway allowlist (JOV-6533)', () => {
    // The gateway rejects anything else as `forbidden`; that surfaced as empty
    // chat turns for two weeks. Adding a model here needs the gateway rule updated.
    for (const model of [
      CHAT_MODEL,
      CHAT_MODEL_LIGHT,
      ...CHAT_MODEL_ROTATION_CHAIN,
      INSIGHT_MODEL,
      PITCH_MODEL,
      TITLE_MODEL,
      PACKAGING_INTELLIGENCE_MODEL,
    ]) {
      expect(GATEWAY_ALLOWED_MODELS).toContain(model);
    }
  });

  it('names the founder allowlist for production health receipts', () => {
    expect(GATEWAY_ALLOWLIST_NAME).toBe('founder-strict-2026-09-17');
  });

  it('album art uses the cheap spacexai image model', () => {
    expect(ALBUM_ART_GATEWAY_IMAGE_MODEL).toBe('spacexai/grok-imagine-image');
    expect(ALBUM_ART_GATEWAY_IMAGE_MODEL.split('/')[0]).toBe('spacexai');
  });

  it('every CHAT_MODEL_ROTATION_CHAIN entry uses provider/model format', () => {
    for (const identifier of CHAT_MODEL_ROTATION_CHAIN) {
      expect(identifier).toMatch(GATEWAY_ID_PATTERN);
      expect(identifier).not.toContain(':');
    }
  });

  it('CHAT_MODEL_ROTATION_CHAIN starts with the default chat model', () => {
    expect(CHAT_MODEL_ROTATION_CHAIN[0]).toBe(CHAT_MODEL);
  });
});
