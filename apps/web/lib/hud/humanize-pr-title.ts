import 'server-only';

import { gateway, generateText } from '@/lib/ai/sdk';
import { buildAiTelemetry } from '@/lib/ai/telemetry';
import { TITLE_MODEL } from '@/lib/constants/ai-models';
import { getRedis } from '@/lib/redis';
import { logger } from '@/lib/utils/logger';

/**
 * Server-side PR title humanizer for the /hud "What Shipped" feed.
 *
 * Mirrors the Python sidecar (`~/.hermes/scripts/what_shipped.py`): rewrite a
 * raw PR title into an emoji-prefixed plain-English line, call the LLM at most
 * once per PR, and never let a model failure break the feed (fall back to the
 * raw title).
 *
 * Cache entries are keyed by PR number with no expiry, so results produced by
 * the sidecar and by this route are interchangeable.
 */

/**
 * Same intent as the Python sidecar prompt so cached titles stay stylistically
 * consistent regardless of which side produced them.
 */
export const HUMANIZE_PR_TITLE_PROMPT = `You rewrite GitHub pull request titles for a "What shipped" feed read by a non-technical founder.

Rewrite the PR title as: one fitting emoji, a space, then a short plain-English description of what changed (at most 10 words), written in past tense.

Rules:
- Drop conventional-commit prefixes (feat:, fix:, chore:, scope tags).
- No jargon, no ticket numbers, no quotes, no trailing punctuation.
- Describe the user-visible outcome, not the implementation.
- Return only the rewritten title.`;

/** Hard timeout on the LLM call, matching the Python sidecar's 8s gate. */
export const HUMANIZE_PR_TITLE_TIMEOUT_MS = 8_000;

const MAX_INPUT_TITLE_LENGTH = 300;
const MAX_OUTPUT_TITLE_LENGTH = 140;
const CACHE_KEY_PREFIX = 'hud:pr-title:v1:';

export type HumanizedPrTitleSource = 'cache' | 'model' | 'fallback';

export interface HumanizePrTitleInput {
  readonly number: number;
  readonly title: string;
}

export interface HumanizePrTitleResult {
  readonly title: string;
  readonly source: HumanizedPrTitleSource;
}

export function humanizedPrTitleCacheKey(prNumber: number): string {
  return `${CACHE_KEY_PREFIX}${prNumber}`;
}

function sanitizeTitle(raw: string, maxLength: number): string {
  const singleLine = raw
    .replaceAll(/\s+/g, ' ')
    .trim()
    .replaceAll(/^["'`]+|["'`]+$/g, '')
    .trim();

  return singleLine.length > maxLength
    ? singleLine.slice(0, maxLength).trimEnd()
    : singleLine;
}

async function readCachedTitle(prNumber: number): Promise<string | null> {
  const redis = getRedis();
  if (!redis) return null;

  try {
    const cached = await redis.get<string>(humanizedPrTitleCacheKey(prNumber));
    if (typeof cached === 'string' && cached.trim().length > 0) {
      return cached;
    }
  } catch (error) {
    logger.error('[hud/humanize-pr-title] Redis read failed', error);
  }

  return null;
}

async function writeCachedTitle(
  prNumber: number,
  title: string
): Promise<void> {
  const redis = getRedis();
  if (!redis) return;

  try {
    // Intentionally no TTL: humanized titles are immutable per PR.
    await redis.set(humanizedPrTitleCacheKey(prNumber), title);
  } catch (error) {
    logger.error('[hud/humanize-pr-title] Redis write failed', error);
  }
}

/**
 * Humanize a PR title, calling the LLM at most once per PR number.
 *
 * Never throws: any cache/model failure degrades to the sanitized raw title so
 * the What Shipped feed keeps rendering.
 */
export async function humanizePrTitle(
  input: HumanizePrTitleInput
): Promise<HumanizePrTitleResult> {
  const rawTitle = sanitizeTitle(input.title, MAX_INPUT_TITLE_LENGTH);
  if (!rawTitle) {
    return { title: input.title.trim(), source: 'fallback' };
  }

  const cached = await readCachedTitle(input.number);
  if (cached) {
    return { title: cached, source: 'cache' };
  }

  try {
    const { text } = await generateText({
      model: gateway(TITLE_MODEL),
      system: HUMANIZE_PR_TITLE_PROMPT,
      prompt: rawTitle,
      maxOutputTokens: 60,
      abortSignal: AbortSignal.timeout(HUMANIZE_PR_TITLE_TIMEOUT_MS),
      experimental_telemetry: buildAiTelemetry({
        functionId: 'hud-humanize-pr-title',
        metadata: { prNumber: input.number },
      }),
    });

    const humanized = sanitizeTitle(text, MAX_OUTPUT_TITLE_LENGTH);
    if (!humanized) {
      return { title: rawTitle, source: 'fallback' };
    }

    // Only cache successful model output — a cached fallback would freeze the
    // raw title forever.
    await writeCachedTitle(input.number, humanized);
    return { title: humanized, source: 'model' };
  } catch (error) {
    logger.error('[hud/humanize-pr-title] Model call failed', error);
    return { title: rawTitle, source: 'fallback' };
  }
}
