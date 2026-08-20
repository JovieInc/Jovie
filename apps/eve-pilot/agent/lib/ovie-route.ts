/**
 * How the Ovie door should handle one Tim message after Eve ingest.
 *
 * Tim always talks through Ovie. The door drives Jovie for creator/dogfood
 * work. Missing product capability becomes an admit-build, not a second chat.
 * Company work is Eve ingest/ack onto Summer's Kanban — not a persona answer.
 */

export type OvieTalkKind = 'ingest-ack' | 'drive-jovie' | 'admit-build';

export type OvieTalkRoute =
  | { readonly kind: 'ingest-ack' }
  | {
      readonly kind: 'drive-jovie';
      readonly reason: 'creator-work' | 'dogfood';
    }
  | {
      readonly kind: 'admit-build';
      readonly missing: 'jovie-capability' | 'extension';
    };

const BUILD_RE =
  /\b(doesn'?t exist|jovie can'?t|not in jovie|need an? extension|build (an? )?extension|missing capability|no connector)\b/i;
const DOGFOOD_RE = /\b(dogfood|as a user|through jovie|drive jovie)\b/i;
const CREATOR_RE =
  /\b(my (own )?(music|song|track|release|ep|album)|thumbnail|drop(ping)?|merch|artist account)\b/i;

export function routeOvieTalk(text: string): OvieTalkRoute {
  const body = text.trim();
  if (BUILD_RE.test(body)) {
    return {
      kind: 'admit-build',
      missing: /\bextension|connector\b/i.test(body)
        ? 'extension'
        : 'jovie-capability',
    };
  }
  if (DOGFOOD_RE.test(body)) {
    return { kind: 'drive-jovie', reason: 'dogfood' };
  }
  if (CREATOR_RE.test(body)) {
    return { kind: 'drive-jovie', reason: 'creator-work' };
  }
  return { kind: 'ingest-ack' };
}
