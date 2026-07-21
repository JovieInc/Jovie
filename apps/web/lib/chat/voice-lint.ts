/**
 * Jovie voice lint (JOV-3806).
 *
 * Machine-checkable subset of the Jovie persona canon
 * (ops `01-canon/04-jovie-persona.md`) and the onboarding prompt's NEVER
 * list. Used three ways:
 *
 *  1. Unit tests assert every deterministic script line passes.
 *  2. Unit tests assert prompt calibration examples pass.
 *  3. The self-improvement job (PR2) gates LLM-response candidates before
 *     they can be promoted into the deterministic response bank.
 *
 * Rules here catch what regexes can catch (banned phrases, corporate verbs,
 * hedging, emoji, shouting). Rhythm and warmth stay human-judged.
 */

export interface VoiceLintViolation {
  readonly rule: string;
  readonly match: string;
}

export interface VoiceLintResult {
  readonly ok: boolean;
  readonly violations: readonly VoiceLintViolation[];
}

interface VoiceRule {
  readonly name: string;
  readonly pattern: RegExp;
}

const VOICE_RULES: readonly VoiceRule[] = [
  {
    name: 'banned-phrase',
    pattern:
      /\b(excited to share|thrilled to announce|let that sink in|here's the truth|at the end of the day|here's the thing|let me tell you|i've been thinking about|game.changer|unlock your potential|fire\.?\s+that'?s the play|catch you on the flip side|totally dark|probably goes nowhere(?:\s+useful)?)\b/i,
  },
  {
    name: 'corporate-verb',
    pattern:
      /\b(leverage|robust|delve|showcase|intricate|vibrant|tapestry|underscore|foster|comprehensive|nuanced|multifaceted|pivotal|elevate|empower|seamless|synergy)\b/i,
  },
  {
    name: 'hedging',
    pattern: /\b(might|maybe|perhaps|i think|i believe|it seems like)\b/i,
  },
  {
    name: 'apology',
    pattern: /\b(sorry|apologies|apologize|my bad)\b/i,
  },
  {
    name: 'emoji',
    pattern: /[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}\u{FE0F}]/u,
  },
  {
    name: 'shouting',
    // 4+ letter all-caps word. Allow known initialisms artists actually use.
    pattern: /\b(?!ISRC\b|DSPs?\b|IRPAA\b)[A-Z]{4,}\b/,
  },
  {
    name: 'multi-exclamation',
    pattern: /!{2,}/,
  },
  {
    name: 'cheerleading',
    pattern: /\b(amazing|awesome journey|super excited|can't wait)\b/i,
  },
  {
    name: 'vague-quantifier',
    pattern: /\b(a lot of|tons of|countless|so many)\b/i,
  },
  {
    // Premature ownership / success before claim+verify.
    name: 'premature-ownership',
    pattern:
      /\b(your live profile|profile is live|you're all set as the owner|claimed your profile)\b/i,
  },
  {
    // Unsupported "we notify your whole Spotify audience" style claims.
    name: 'unsupported-audience-claim',
    pattern:
      /\b(notify (?:all(?: your)?|your entire|the whole) (?:spotify )?followers|reach (?:all(?: your)?|your entire) (?:spotify )?followers|tells? (?:all )?your fans without you doing anything)\b/i,
  },
];

/**
 * Lint a single user-facing Jovie line. Returns every rule violation so
 * tests and the promotion gate can report precisely what failed.
 */
export function lintVoice(text: string): VoiceLintResult {
  const violations: VoiceLintViolation[] = [];
  for (const rule of VOICE_RULES) {
    const match = rule.pattern.exec(text);
    if (match) {
      violations.push({ rule: rule.name, match: match[0] });
    }
  }
  return { ok: violations.length === 0, violations };
}
