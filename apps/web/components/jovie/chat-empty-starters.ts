/**
 * Shared New Chat empty primitive (JOV-5387).
 * Role-neutral heading plus locked rotating executable samples.
 * Each sample is a short user prompt + concise assistant reply.
 * Selecting a sample must launch that sample's exact user prompt.
 */

export const CHAT_EMPTY_HEADING = 'Just ask';

export const CHAT_EMPTY_ROTATE_SAMPLES = [
  {
    id: 'plan-next-release',
    prompt: 'Plan my next release',
    reply: "I'll map dates, assets, and the launch sequence.",
  },
  {
    id: 'gaining-traction',
    prompt: "What's gaining traction?",
    reply: "I'll surface the signals that moved this week.",
  },
  {
    id: 'draft-a-pitch',
    prompt: 'Draft a pitch I can send',
    reply: "I'll write a short pitch from your latest work.",
  },
] as const;

export type ChatEmptyRotateSample = (typeof CHAT_EMPTY_ROTATE_SAMPLES)[number];

/** Taste still frame. Rotation happens in product, not on the still. */
export const CHAT_EMPTY_STILL_SAMPLE = CHAT_EMPTY_ROTATE_SAMPLES[0];

export const CHAT_EMPTY_SAMPLE_STORAGE_KEY =
  'jovie.chat-empty-rotate-sample-index';

/** Shared desktop column id for header, empty chat, and composer shells. */
export const DESKTOP_CONTENT_GRID_ANCHOR = 'desktop-content';

export function sampleAtIndex(index: number): ChatEmptyRotateSample {
  const count = CHAT_EMPTY_ROTATE_SAMPLES.length;
  const safe = ((index % count) + count) % count;
  return CHAT_EMPTY_ROTATE_SAMPLES[safe];
}

function readSessionStorage(): Pick<Storage, 'getItem' | 'setItem'> | null {
  try {
    if (typeof sessionStorage === 'undefined') return null;
    return sessionStorage;
  } catch {
    return null;
  }
}

/**
 * Returns the next locked sample and advances the rotate index.
 * Falls back to the still when storage is unavailable.
 */
export function takeNextEmptyChatSample(
  storage: Pick<Storage, 'getItem' | 'setItem'> | null = readSessionStorage()
): ChatEmptyRotateSample {
  if (!storage) return CHAT_EMPTY_STILL_SAMPLE;
  try {
    const raw = storage.getItem(CHAT_EMPTY_SAMPLE_STORAGE_KEY);
    const parsed = raw == null ? 0 : Number.parseInt(raw, 10);
    const index = Number.isFinite(parsed) ? parsed : 0;
    const sample = sampleAtIndex(index);
    storage.setItem(CHAT_EMPTY_SAMPLE_STORAGE_KEY, String(index + 1));
    return sample;
  } catch {
    return CHAT_EMPTY_STILL_SAMPLE;
  }
}
