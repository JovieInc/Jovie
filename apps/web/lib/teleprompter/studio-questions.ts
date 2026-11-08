import type { RecordableVideoKind } from './types';

/**
 * Between-take questions. Jovie's proposal can carry questions written from
 * the script; when it doesn't, these fallbacks keep the coach useful. They
 * follow the Bubblegum Factory format: the creator answers an unseen
 * interviewer in a 30-90 second clip.
 */
const FALLBACK_QUESTIONS: Record<RecordableVideoKind, readonly string[]> = {
  promo: [
    'What do you want people to feel the first time they hear it?',
    'Where were you when this one came together?',
    'Who is this one for?',
  ],
  thank_you: [
    'Who do you want to thank first, and why them?',
    'What changed for you because people showed up?',
    'What do you want to tell the people who have been there since the start?',
  ],
  bts: [
    'What almost went wrong while making this?',
    'What is the detail nobody will notice but you love?',
    'What were you listening to while you made it?',
  ],
};

export const MAX_STUDIO_QUESTIONS = 5;

export function resolveStudioQuestions(params: {
  readonly kind: RecordableVideoKind;
  readonly questions?: readonly string[] | null;
}): readonly string[] {
  const seen = new Set<string>();
  const provided = (params.questions ?? [])
    .map(question => question.trim())
    .filter(question => {
      if (question.length < 8) return false;
      const key = question.toLowerCase();
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .slice(0, MAX_STUDIO_QUESTIONS);
  return provided.length > 0 ? provided : FALLBACK_QUESTIONS[params.kind];
}
