/**
 * Summer summon detection (Tim, 2026-10-25).
 *
 * Typing "summmmahhhhhh", "@summer" or "hey summer" in the founder's chat means
 * "hand my operator account to Summer", not "riff about the season". Spelling is
 * deliberately loose (elongation, trailing "ah"/"a"), so match on the collapsed
 * letter skeleton within a small edit distance. Applied only to the founder
 * account at the route; artists keep talking about summer normally.
 */

const GREETING = /^(?:hey|hi|yo|ok|okay|hello|sup|ping|oi)\s+/i;
/** Collapsed skeletons: summer, summr, summa(h), sumar. */
const SKELETON = /^sum(?:er|r|a|ah|ar)$/;

function collapse(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z]/g, '')
    .replace(/(.)\1+/g, '$1');
}

export function isSummerSummon(text: string): boolean {
  const trimmed = text.trim();
  if (trimmed.length === 0 || trimmed.length > 40) return false;
  if (/^@summer\b/i.test(trimmed)) return true;
  const bare = trimmed.replace(GREETING, '').replace(/^@/, '');
  if (/\s/.test(bare.trim())) return false;
  const skeleton = collapse(bare);
  return SKELETON.test(skeleton);
}

export type SummerHandoffInput = {
  readonly chatMode: 'ov' | null;
  readonly text: string;
  readonly founderAuthorized: boolean;
  readonly transportEnabled: boolean;
};

/** Returns the effective chat mode: 'ov' (Summer) when the founder summoned her. */
export function resolveSummerHandoff(input: SummerHandoffInput): 'ov' | null {
  if (input.chatMode === 'ov') return 'ov';
  if (
    input.founderAuthorized &&
    input.transportEnabled &&
    isSummerSummon(input.text)
  ) {
    return 'ov';
  }
  return input.chatMode;
}
