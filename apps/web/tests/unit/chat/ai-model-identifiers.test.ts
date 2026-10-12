import { describe, expect, it } from 'vitest';
import {
  ALBUM_ART_GATEWAY_IMAGE_MODEL,
  assertGatewayImageModelAllowed,
  assertGatewayModelAllowed,
  CHAT_MODEL,
  CHAT_MODEL_LIGHT,
  CHAT_MODEL_ROTATION_CHAIN,
  DESIGN_TASTE_SWEEP_MODEL,
  GATEWAY_ALLOWED_IMAGE_MODELS,
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
      DESIGN_TASTE_SWEEP_MODEL,
    ]) {
      expect(GATEWAY_ALLOWED_MODELS).toContain(model);
    }
  });

  it('text allowlist is exactly the founder-locked set (JOV-8109)', () => {
    expect([...GATEWAY_ALLOWED_MODELS].sort()).toEqual([
      'typesafe-ai/jev',
      'zai/glm-5.3',
      'zai/glm-5.3-flash',
    ]);
  });

  it('fails closed: only allowlisted text models pass (JOV-8109)', () => {
    for (const allowed of GATEWAY_ALLOWED_MODELS) {
      expect(() => assertGatewayModelAllowed(allowed)).not.toThrow();
    }
    for (const denied of [
      'google/gemini-2.5-flash-image',
      'google/gemini-3-flash',
      'deepseek/deepseek-v4',
      'xai/grok-5',
      'zai/glm-5.2',
      'typesafe-ai/other',
    ]) {
      expect(() => assertGatewayModelAllowed(denied)).toThrow(
        /not on the allowlist/
      );
    }
  });

  it('rejects openai/anthropic gateway ids with the banned-provider error (JOV-7119)', () => {
    for (const banned of [
      'openai/gpt-6-sol',
      'openai/gpt-6-luna',
      'openai/gpt-image-1.5',
      'anthropic/claude-haiku-4-5-20251001',
      'anthropic/claude-sonnet-4-20250514',
    ]) {
      expect(() => assertGatewayModelAllowed(banned)).toThrow(
        /banned provider/
      );
    }
  });

  it('fails closed on image models: only allowlisted image ids pass (JOV-8109)', () => {
    for (const allowed of GATEWAY_ALLOWED_IMAGE_MODELS) {
      expect(() => assertGatewayImageModelAllowed(allowed)).not.toThrow();
    }
    expect(GATEWAY_ALLOWED_IMAGE_MODELS).toContain(
      ALBUM_ART_GATEWAY_IMAGE_MODEL
    );
    for (const denied of [
      'google/imagen-4.0-ultra-generate-001',
      'bfl/flux-2-pro',
      'xai/grok-imagine-image',
    ]) {
      expect(() => assertGatewayImageModelAllowed(denied)).toThrow(
        /not on the image allowlist/
      );
    }
    expect(() =>
      assertGatewayImageModelAllowed('openai/gpt-image-1.5')
    ).toThrow(/banned provider/);
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
