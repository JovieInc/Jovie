import { createHash } from 'node:crypto';
import type { FeedbackClassification } from '@/lib/db/schema/feedback';

/**
 * Deterministic feedback classifier (JOV-6433).
 *
 * Runs at capture time inside `createFeedbackItem`. Reporter-supplied text or
 * context can never self-declare a class — signals are matched against the
 * message and the declared execution context only. Kept model-free so a
 * captured report cannot prompt-inject its way into the auto-ship path:
 * `bug_verifiable` still requires an independently reproducible defect, the
 * classifier only routes candidates.
 */

type Signal = { readonly k: string; readonly m: 'substr' | 'wordStart' };

const sub = (k: string): Signal => ({ k, m: 'substr' });
const word = (k: string): Signal => ({ k, m: 'wordStart' });

/**
 * Defect signals. Word-start matches so `fail` catches `fails/failed` but
 * `bug` cannot match inside `debug`.
 */
const BUG_SIGNALS: readonly Signal[] = [
  word('bug'),
  word('error'),
  word('crash'),
  word('broken'),
  word('break'),
  word('fail'),
  word('regress'),
  word('exception'),
  word('traceback'),
  word('blank'),
  word('frozen'),
  word('freeze'),
  word('stuck'),
  word('hang'),
  word('timeout'),
  sub('not working'),
  sub("doesn't work"),
  sub('doesn’t work'),
  sub('does not work'),
  sub('not loading'),
  sub("won't load"),
  sub('cannot save'),
  sub("can't save"),
  word('500'),
  sub('http 500'),
  sub('stack trace'),
  word('repro'),
  word('corrupt'),
  word('duplicat'),
];

/**
 * Capability/change signals. A message with only these and no defect signal
 * is `feature_or_change`.
 */
const FEATURE_SIGNALS: readonly Signal[] = [
  word('feature'),
  word('add'),
  word('support'),
  word('wish'),
  word('suggest'),
  word('idea'),
  word('would be nice'),
  word('please'),
  sub('could you'),
  sub('can you'),
  sub('it would help'),
  word('improv'),
  word('dark mode'),
  word('integrat'),
];

/**
 * Taste-bearing change signals (JOV-6433): these route to certification —
 * machine-cert then Ovie/Tim human-cert — before ship.
 */
const TASTE_SIGNALS: readonly Signal[] = [
  word('design'),
  word('color'),
  word('colour'),
  word('font'),
  word('typograph'),
  word('spacing'),
  word('layout'),
  word('copy'),
  word('wording'),
  word('brand'),
  word('logo'),
  word('feel'),
  word('aesthetic'),
  word('polish'),
  word('ugly'),
  word('pretty'),
  word('style'),
];

function matchesSignal(text: string, signal: Signal): boolean {
  if (signal.m === 'substr') return text.includes(signal.k);
  // wordStart: left word-boundary, suffixes allowed (fail→fails, not debug).
  let idx = text.indexOf(signal.k);
  while (idx !== -1) {
    const prev = idx === 0 ? ' ' : text.charAt(idx - 1);
    if (!/[a-z0-9]/i.test(prev)) return true;
    idx = text.indexOf(signal.k, idx + 1);
  }
  return false;
}

function matchesAny(text: string, signals: readonly Signal[]): boolean {
  return signals.some(signal => matchesSignal(text, signal));
}

/** Agent/CLI reports carry declared execution context; an exit code or HTTP
 * 5xx is a defect signal the reporter cannot fake (context schema is strict). */
export interface FeedbackClassificationContext {
  readonly source?: string | null;
  readonly context?: Record<string, unknown> | null;
}

export function classifyFeedbackMessage(
  message: string,
  input: FeedbackClassificationContext = {}
): FeedbackClassification {
  const text = message.toLowerCase().trim();

  const ctx = input.context ?? {};
  const exitCode = typeof ctx.exitCode === 'number' ? ctx.exitCode : null;
  const httpStatus = typeof ctx.status === 'number' ? ctx.status : null;
  const hasContextDefectSignal =
    (exitCode !== null && exitCode !== 0) ||
    (httpStatus !== null && httpStatus >= 400);

  if (hasContextDefectSignal) return 'bug_verifiable';
  if (matchesAny(text, BUG_SIGNALS)) return 'bug_verifiable';
  if (matchesAny(text, FEATURE_SIGNALS)) return 'feature_or_change';

  // Noise: no alphanumeric payload worth routing (empty, emoji, "ok", "hi").
  const alphanumeric = text.replace(/[^a-z0-9]/gi, '');
  if (alphanumeric.length < 4) return 'noise';

  // Ambiguous free text ranks as a change request — it goes to Summer's
  // now/later/never ledger, never the taste-free auto-ship path.
  return 'feature_or_change';
}

/** True when the change is taste-bearing → certification gate before ship. */
export function isTasteBearing(message: string): boolean {
  return matchesAny(message.toLowerCase(), TASTE_SIGNALS);
}

/**
 * Canonical dedupe key (JOV-6433): identical normalized text collides,
 * near-duplicates do not — semantic similarity may suggest candidate
 * duplicates downstream but never merges rows.
 */
export function feedbackFingerprint(message: string): string {
  const normalized = message
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
  return createHash('sha256').update(normalized).digest('hex');
}
