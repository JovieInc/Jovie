/**
 * Pure text checks shared by the live check and the LLM output guard.
 * No imports beyond the offer types, so both server and client code can use it.
 */
import type { Offer } from './offer';

const CADENCE =
  /^\s*(?:\/\s?(?:mo|month|yr|year)\b|per\s+(?:month|year)\b|a\s+(?:month|year)\b|monthly|annually)/i;

/** Dollar amounts stated with a billing cadence that are not the offer price (or free). */
export function wrongRecurringAmounts(
  text: string,
  offer: Offer,
  allow: readonly { readonly text: string }[] = []
): readonly string[] {
  const proUsd = offer.plans.pro.amountCents / 100;
  const bad: string[] = [];
  for (const m of text.matchAll(/\$\s?(\d[\d,]*(?:\.\d{1,2})?)/g)) {
    const after = text.slice((m.index ?? 0) + m[0].length);
    if (!CADENCE.test(after)) continue;
    const usd = Number((m[1] ?? '').replace(/,/g, ''));
    if (usd === 0 || usd === proUsd) continue;
    const snippet = text
      .slice(m.index ?? 0, (m.index ?? 0) + m[0].length + 16)
      .trim();
    if (allow.some(a => snippet.startsWith(a.text))) continue;
    bad.push(snippet);
  }
  return bad;
}

/** Dollar amounts stated near a plan word ("Pro", "plan", "upgrade"...) that are not the offer price. */
export function wrongPlanAmounts(
  text: string,
  offer: Offer
): readonly string[] {
  const proUsd = offer.plans.pro.amountCents / 100;
  const bad: string[] = [];
  const plan =
    /\b(?:pro|artist presence|plan|subscription|upgrade|billed|membership)\b/i;
  for (const m of text.matchAll(/\$\s?(\d[\d,]*(?:\.\d{1,2})?)/g)) {
    const at = m.index ?? 0;
    const window = text.slice(Math.max(0, at - 40), at + m[0].length + 40);
    if (!plan.test(window)) continue;
    const usd = Number((m[1] ?? '').replace(/,/g, ''));
    if (usd === 0 || usd === proUsd) continue;
    bad.push(m[0]);
  }
  return bad;
}

/** "N-day" / "N day" trial lengths that differ from the offer. */
export function wrongTrialDays(text: string, offer: Offer): readonly string[] {
  const bad: string[] = [];
  for (const m of text.matchAll(
    /(\d+)[- ]day(?:s)?\s+(?:[A-Za-z]+\s+){0,3}?trial/gi
  )) {
    if (Number(m[1]) !== offer.trial.days) bad.push(m[0]);
  }
  return bad;
}
