import type { PresenceCheckEvidence, PresenceCheckOutcome } from './types';
export type CompanyPageKind =
  | 'marketing'
  | 'editorial'
  | 'profile'
  | 'legal'
  | 'machine';
export const COMPANY_PRESENCE_CHECK_IDS = [
  'indexed',
  'seo_certification',
  'copy_gate',
  'lighthouse',
] as const;
export type CompanyPresenceCheckId =
  (typeof COMPANY_PRESENCE_CHECK_IDS)[number];
export const COMPANY_PRESENCE_CHECK_LABELS: Readonly<
  Record<CompanyPresenceCheckId, string>
> = {
  indexed: 'Indexed',
  seo_certification: 'SEO Cert',
  copy_gate: 'Copy Gate',
  lighthouse: 'Lighthouse',
};
export type CompanyPresenceCheckOutcome = PresenceCheckOutcome;
export type CompanyPresenceCheck = PresenceCheckEvidence;
export interface CompanyPresencePage {
  readonly id: string;
  /** Site-relative path, e.g. `/pricing`. */
  readonly path: string;
  readonly label: string;
  readonly kind: CompanyPageKind;
  readonly checks: Readonly<
    Record<CompanyPresenceCheckId, CompanyPresenceCheck>
  >;
}
export interface CompanyPresenceSourceStatus {
  readonly id: CompanyPresenceCheckId;
  readonly label: string;
  readonly configured: boolean;
  /** Why the source is unconfigured; null once connected. */
  readonly reason: string | null;
}
export interface CompanyPresenceData {
  readonly pages: readonly CompanyPresencePage[];
  readonly sources: readonly CompanyPresenceSourceStatus[];
  /** Owned-profile lookup failed; profile rows are missing, not zero. */
  readonly profilesUnavailable: boolean;
}
