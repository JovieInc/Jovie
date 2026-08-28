/**
 * Evidence floor for `smart_link_switch_live`.
 * Stolen RULES only (Aria link + operator Rule 6 + Recoup
 * recoup-release-track-drop). No HTTP. No new smart-link product.
 */

import type {
  ExistingSmartLink,
  GateSmartLinkSwitchInput,
  SmartLinkLookupStatus,
  SmartLinkSwitchDisposition,
  SmartLinkSwitchGateResult,
} from './types';

export const SMART_LINK_SWITCH_LIVE_RULES = `SMART-LINK-SWITCH — Aria link + operator Rule 6 + Recoup release-track-drop RULES only. Share URL must be the existing shareUrl. Never invent a jov.ie URL or placeholder. If lookup or switch fails, STOP and surface the error. Only switch if a smart link already exists for that release. Do not mint a new live link. Already-live is a no-op keep, not a rebuild. Do not mint a second live link. Cite only DSPs actually resolved on the existing link. Empty tool result is the answer — never invent DSP coverage. If there is no smart link, skip switch. Run still succeeds.`;

export const MISSING_LINK_SKIP_REASON =
  'No smart link exists for this release. Skip switch. Run still succeeds. Do not mint a live link.';
export const ALREADY_LIVE_KEEP_REASON =
  'Smart link is already live. No-op keep. Do not mint a second live link.';
export const SWITCHED_LIVE_REASON =
  'Existing pre-save/countdown smart link switched to live. Same shareUrl. No new link minted.';
export const LOOKUP_STOP_REASON =
  'Smart link lookup/switch failed. STOP. Never invent a jov.ie URL.';

export const SMART_LINK_SWITCH_RULE_CASE_IDS = [
  'placeholder-refused',
  'missing-link-skips-no-mint',
  'already-live-is-noop',
  'failed-lookup-stops',
  'only-resolved-dsps-cited',
] as const;

export type SmartLinkSwitchRuleCaseId =
  (typeof SMART_LINK_SWITCH_RULE_CASE_IDS)[number];

export type SmartLinkSwitchRuleCaseResult = {
  readonly id: SmartLinkSwitchRuleCaseId;
  readonly passed: boolean;
  readonly reason: string;
};

const EXISTING_SHARE_URL = 'https://jov.ie/tim/never-say-a-word';
const PLACEHOLDER_URL = 'https://jov.ie/placeholder';
const INVENTED_SECOND_URL = 'https://jov.ie/tim/never-say-a-word-live';

const PLACEHOLDER_NEEDLES = [
  'placeholder',
  'example.com',
  'your-link',
  'your-release',
  '/eval/',
  '/todo',
  '/tbd',
  '/dummy',
] as const;

function trimOrNull(value: string | null | undefined): string | null {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

function existingShareUrl(
  existing: ExistingSmartLink | null | undefined
): string | null {
  return trimOrNull(existing?.shareUrl);
}

function isPlaceholderUrl(
  url: string | null | undefined,
  canonical: string | null
): boolean {
  const trimmed = trimOrNull(url);
  if (!trimmed) return Boolean(url != null && String(url).length > 0);
  if (canonical && trimmed === canonical) return false;
  const lower = trimmed.toLowerCase();
  return PLACEHOLDER_NEEDLES.some(needle => lower.includes(needle));
}

function resolveLookupStatus(
  input: GateSmartLinkSwitchInput
): SmartLinkLookupStatus {
  if (input.lookupStatus) return input.lookupStatus;
  if (trimOrNull(input.lookupError)) return 'error';
  return existingShareUrl(input.existing) ? 'ok' : 'missing';
}

function citeResolvedDsps(
  existing: ExistingSmartLink | null | undefined,
  claimed: readonly string[] | null | undefined,
  omitted: string[]
): string[] {
  const allowed = (existing?.resolvedDsps ?? [])
    .map(dsp => dsp.trim())
    .filter(Boolean);
  const allowedSet = new Set(allowed);
  const proposed = claimed ?? [];
  if (proposed.length === 0) return allowed;
  const cited: string[] = [];
  for (const dsp of proposed) {
    const name = dsp.trim();
    if (!name) continue;
    if (allowedSet.has(name)) {
      cited.push(name);
      continue;
    }
    omitted.push('dsp');
  }
  return cited;
}

function result(input: {
  readonly disposition: SmartLinkSwitchDisposition;
  readonly switched: boolean;
  readonly minted: boolean;
  readonly runSucceeded: boolean;
  readonly stopped: boolean;
  readonly shareUrl: string | null;
  readonly citedDsps: readonly string[];
  readonly omittedInvented: readonly string[];
  readonly reason: string;
}): SmartLinkSwitchGateResult {
  return input;
}

/** Hard no-placeholder / only-switch-existing / already-live-is-noop gate. */
export function gateSmartLinkSwitch(
  input: GateSmartLinkSwitchInput = {}
): SmartLinkSwitchGateResult {
  const omittedInvented: string[] = [];
  const proposed = input.proposed ?? {};
  const lookupStatus = resolveLookupStatus(input);
  const lookupError = trimOrNull(input.lookupError);
  const switchError = trimOrNull(input.switchError);
  const canonical = existingShareUrl(input.existing);
  const proposedUrl = trimOrNull(proposed.shareUrl);

  if (proposed.mintNew === true) omittedInvented.push('mint');
  if (proposedUrl && isPlaceholderUrl(proposedUrl, canonical)) {
    omittedInvented.push('placeholder');
  } else if (proposedUrl && canonical && proposedUrl !== canonical) {
    omittedInvented.push('shareUrl');
  } else if (proposedUrl && !canonical) {
    omittedInvented.push('shareUrl');
  }

  const citedDsps = citeResolvedDsps(
    input.existing,
    proposed.claimedDsps,
    omittedInvented
  );

  if (lookupStatus === 'error' || switchError) {
    const detail = switchError ?? lookupError ?? 'lookup failed';
    return result({
      disposition: 'stop',
      switched: false,
      minted: false,
      runSucceeded: false,
      stopped: true,
      shareUrl: null,
      citedDsps: [],
      omittedInvented,
      reason: `${LOOKUP_STOP_REASON} ${detail}`,
    });
  }

  if (lookupStatus === 'missing' || !canonical) {
    return result({
      disposition: 'skip',
      switched: false,
      minted: false,
      runSucceeded: true,
      stopped: false,
      shareUrl: null,
      citedDsps: [],
      omittedInvented,
      reason: MISSING_LINK_SKIP_REASON,
    });
  }

  if (input.existing?.live === true) {
    return result({
      disposition: 'keep',
      switched: false,
      minted: false,
      runSucceeded: true,
      stopped: false,
      shareUrl: canonical,
      citedDsps,
      omittedInvented,
      reason: ALREADY_LIVE_KEEP_REASON,
    });
  }

  return result({
    disposition: 'switch',
    switched: true,
    minted: false,
    runSucceeded: true,
    stopped: false,
    shareUrl: canonical,
    citedDsps,
    omittedInvented,
    reason: SWITCHED_LIVE_REASON,
  });
}

function evaluatePlaceholderRefused(): SmartLinkSwitchRuleCaseResult {
  const gated = gateSmartLinkSwitch({
    existing: {
      shareUrl: EXISTING_SHARE_URL,
      live: false,
      resolvedDsps: ['spotify'],
    },
    proposed: {
      shareUrl: PLACEHOLDER_URL,
      mintNew: true,
    },
  });
  const serialized = JSON.stringify(gated);
  const passed =
    gated.shareUrl === EXISTING_SHARE_URL &&
    gated.minted === false &&
    gated.switched === true &&
    gated.omittedInvented.includes('placeholder') &&
    gated.omittedInvented.includes('mint') &&
    !serialized.includes(PLACEHOLDER_URL) &&
    !serialized.includes(INVENTED_SECOND_URL);
  return {
    id: 'placeholder-refused',
    passed,
    reason: passed
      ? 'Placeholder and minted URLs are refused; existing shareUrl is kept'
      : 'A placeholder or invented jov.ie URL was emitted',
  };
}

function evaluateMissingLinkSkipsNoMint(): SmartLinkSwitchRuleCaseResult {
  const gated = gateSmartLinkSwitch({
    lookupStatus: 'missing',
    proposed: {
      shareUrl: PLACEHOLDER_URL,
      mintNew: true,
      claimedDsps: ['spotify', 'apple_music'],
    },
  });
  const serialized = JSON.stringify(gated);
  const passed =
    gated.disposition === 'skip' &&
    gated.runSucceeded === true &&
    gated.switched === false &&
    gated.minted === false &&
    gated.stopped === false &&
    gated.shareUrl === null &&
    gated.citedDsps.length === 0 &&
    gated.reason === MISSING_LINK_SKIP_REASON &&
    !serialized.includes('jov.ie') &&
    !serialized.includes('spotify');
  return {
    id: 'missing-link-skips-no-mint',
    passed,
    reason: passed
      ? 'Missing smart link skips switch, succeeds, and does not mint'
      : 'Missing smart link minted a URL or failed the run',
  };
}

function evaluateAlreadyLiveIsNoop(): SmartLinkSwitchRuleCaseResult {
  const gated = gateSmartLinkSwitch({
    existing: {
      shareUrl: EXISTING_SHARE_URL,
      live: true,
      resolvedDsps: ['spotify'],
    },
    proposed: {
      shareUrl: INVENTED_SECOND_URL,
      mintNew: true,
    },
  });
  const passed =
    gated.disposition === 'keep' &&
    gated.switched === false &&
    gated.minted === false &&
    gated.runSucceeded === true &&
    gated.shareUrl === EXISTING_SHARE_URL &&
    gated.reason === ALREADY_LIVE_KEEP_REASON &&
    gated.omittedInvented.includes('shareUrl') &&
    gated.omittedInvented.includes('mint');
  return {
    id: 'already-live-is-noop',
    passed,
    reason: passed
      ? 'Already-live is a no-op keep of the existing shareUrl'
      : 'Already-live rebuilt or minted a second live link',
  };
}

function evaluateFailedLookupStops(): SmartLinkSwitchRuleCaseResult {
  const lookup = gateSmartLinkSwitch({
    lookupStatus: 'error',
    lookupError: 'smart_link_targets lookup timed out',
    proposed: { shareUrl: PLACEHOLDER_URL, mintNew: true },
  });
  const switchFailed = gateSmartLinkSwitch({
    existing: { shareUrl: EXISTING_SHARE_URL, live: false },
    switchError: 'DSP destination write failed',
    proposed: { shareUrl: PLACEHOLDER_URL },
  });
  const serialized = `${JSON.stringify(lookup)}${JSON.stringify(switchFailed)}`;
  const passed =
    lookup.disposition === 'stop' &&
    lookup.stopped === true &&
    lookup.runSucceeded === false &&
    lookup.minted === false &&
    lookup.shareUrl === null &&
    lookup.reason.includes('timed out') &&
    switchFailed.disposition === 'stop' &&
    switchFailed.stopped === true &&
    switchFailed.shareUrl === null &&
    switchFailed.reason.includes('DSP destination write failed') &&
    !serialized.includes(PLACEHOLDER_URL);
  return {
    id: 'failed-lookup-stops',
    passed,
    reason: passed
      ? 'Failed lookup/switch STOPs, surfaces the error, and invents no URL'
      : 'Failed lookup/switch invented a URL or did not STOP',
  };
}

function evaluateOnlyResolvedDspsCited(): SmartLinkSwitchRuleCaseResult {
  const gated = gateSmartLinkSwitch({
    existing: {
      shareUrl: EXISTING_SHARE_URL,
      live: false,
      resolvedDsps: ['spotify'],
    },
    proposed: {
      claimedDsps: ['spotify', 'tidal', 'amazon_music'],
    },
  });
  const empty = gateSmartLinkSwitch({
    existing: {
      shareUrl: EXISTING_SHARE_URL,
      live: false,
      resolvedDsps: [],
    },
    proposed: { claimedDsps: ['spotify'] },
  });
  const serialized = JSON.stringify(gated);
  const passed =
    gated.citedDsps.length === 1 &&
    gated.citedDsps[0] === 'spotify' &&
    gated.omittedInvented.includes('dsp') &&
    !serialized.includes('tidal') &&
    !serialized.includes('amazon_music') &&
    empty.citedDsps.length === 0 &&
    empty.omittedInvented.includes('dsp');
  return {
    id: 'only-resolved-dsps-cited',
    passed,
    reason: passed
      ? 'Only DSPs resolved on the existing link are cited'
      : 'Unresolved DSP destinations were invented',
  };
}

export function evaluateSmartLinkSwitchRuleCase(
  id: SmartLinkSwitchRuleCaseId
): SmartLinkSwitchRuleCaseResult {
  switch (id) {
    case 'placeholder-refused':
      return evaluatePlaceholderRefused();
    case 'missing-link-skips-no-mint':
      return evaluateMissingLinkSkipsNoMint();
    case 'already-live-is-noop':
      return evaluateAlreadyLiveIsNoop();
    case 'failed-lookup-stops':
      return evaluateFailedLookupStops();
    case 'only-resolved-dsps-cited':
      return evaluateOnlyResolvedDspsCited();
  }
}

export function evaluateAllSmartLinkSwitchRuleCases(): SmartLinkSwitchRuleCaseResult[] {
  return SMART_LINK_SWITCH_RULE_CASE_IDS.map(evaluateSmartLinkSwitchRuleCase);
}
