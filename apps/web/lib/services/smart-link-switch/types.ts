/** Evidence-floor types for the existing `smart_link_switch_live` stub. */

export type SmartLinkLookupStatus = 'ok' | 'missing' | 'error';

export type SmartLinkSwitchDisposition = 'switch' | 'keep' | 'skip' | 'stop';

export interface ExistingSmartLink {
  readonly shareUrl?: string | null;
  readonly live?: boolean | null;
  readonly resolvedDsps?: readonly string[] | null;
}

export interface ProposedSmartLinkSwitch {
  readonly shareUrl?: string | null;
  readonly mintNew?: boolean | null;
  readonly claimedDsps?: readonly string[] | null;
}

export interface GateSmartLinkSwitchInput {
  readonly lookupStatus?: SmartLinkLookupStatus | null;
  readonly lookupError?: string | null;
  readonly switchError?: string | null;
  readonly existing?: ExistingSmartLink | null;
  readonly proposed?: ProposedSmartLinkSwitch | null;
}

export interface SmartLinkSwitchGateResult {
  readonly disposition: SmartLinkSwitchDisposition;
  readonly switched: boolean;
  readonly minted: boolean;
  readonly runSucceeded: boolean;
  readonly stopped: boolean;
  readonly shareUrl: string | null;
  readonly citedDsps: readonly string[];
  readonly omittedInvented: readonly string[];
  readonly reason: string;
}
