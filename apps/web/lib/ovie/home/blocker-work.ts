/**
 * Which in-flight shipping row is moving a revenue blocker. Split from
 * story-first.ts to keep that file under the size-500 ratchet.
 */

import type { HomeLoopRow } from '@/lib/home-loop/contract';
import type { CompanyBlocker } from './company-blocker';
import type { OvieShipStage } from './shipping-home';
import type { StoryFirstStageHighlight } from './story-first';

const CHECKOUT_WORK =
  /checkout|billing|payment|stripe|pricing|entitlement|paywall/i;
const ENTRY_WORK = /homepage|landing|entry/i;
const ONBOARDING_WORK = /onboarding|sign.?up|sign.?in|\bauth|claim/i;
const ACTIVATION_WORK = /activation|dashboard|first.?use/i;

/** Words a shipping row's title uses when it works on a blocker step. */
const BLOCKER_WORK: Readonly<Record<CompanyBlocker['step'], RegExp>> = {
  // A bare "profile" also names dashboard queries and settings; only the
  // public profile page's own words count.
  public_profile:
    /public.?profile|artist.?profile|profile (?:page|url|link|route|render)|\((?:public-)?profile\)/i,
  homepage_entry: ENTRY_WORK,
  onboarding_auth_claim: ONBOARDING_WORK,
  checkout_payment_entitlement: CHECKOUT_WORK,
  activation_dashboard: ACTIVATION_WORK,
  visits: ENTRY_WORK,
  eligible_entries: ENTRY_WORK,
  onboarding_starts: ONBOARDING_WORK,
  account_creation: ONBOARDING_WORK,
  claim_shown: /claim/i,
  claim_attempted: /claim/i,
  claim_completed: /claim/i,
  checkout_shown: CHECKOUT_WORK,
  checkout_started: CHECKOUT_WORK,
  paid: CHECKOUT_WORK,
  activated: ACTIVATION_WORK,
};

/**
 * The in-flight row that works on this blocker, in shipping order. The lead
 * shipping row is not "moving" a blocker it has nothing to do with (Tim,
 * 2026-11-22: checkout's card linked a lanes issue), so no match means no
 * Moving line rather than an unrelated one.
 */
export function movingForBlocker(
  rows: readonly HomeLoopRow<OvieShipStage>[],
  step: CompanyBlocker['step']
): StoryFirstStageHighlight | null {
  const pattern = BLOCKER_WORK[step];
  const row = rows.find(
    item => !item.complete && pattern.test(`${item.identifier} ${item.title}`)
  );
  return row
    ? { identifier: row.identifier, title: row.title, href: row.url }
    : null;
}
