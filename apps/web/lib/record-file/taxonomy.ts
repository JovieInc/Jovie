import type { ArtistRole } from '@/lib/db/schema/content';

/**
 * Record file taxonomy (JOV-3110 Asset Graph, slice 1).
 *
 * A record file is the index of paperwork and people attached to one record
 * (a release or a recording) in the Library. Every tag points back to the
 * source it came from (an email thread, a calendar event, an upload) by
 * date, sender and kind. The record file never copies source contents.
 */

/** What a source says about a record. One source may carry several kinds. */
export const RECORD_FILE_TAG_KINDS = [
  'collaborator_thread',
  'split_sheet',
  'split_change',
  'contract',
  'distribution',
  'metadata_delivery',
  'registration',
  'mix',
  'mastering',
  'artwork',
  'pitch',
  'remix',
  'sync',
  'stats',
] as const;
export type RecordFileTagKind = (typeof RECORD_FILE_TAG_KINDS)[number];

export const RECORD_FILE_TAG_LABELS: Readonly<
  Record<RecordFileTagKind, string>
> = {
  collaborator_thread: 'Collaborator thread',
  split_sheet: 'Split sheet',
  split_change: 'Split change',
  contract: 'Agreement',
  distribution: 'Distribution',
  metadata_delivery: 'Metadata delivery',
  registration: 'Registration',
  mix: 'Mix',
  mastering: 'Mastering',
  artwork: 'Artwork',
  pitch: 'Pitch',
  remix: 'Remix',
  sync: 'Sync',
  stats: 'Stats',
};

/** Where a registration lives. A released record is expected to have each. */
export const RECORD_FILE_REGISTRATION_TARGETS = [
  'pro',
  'publishing_admin',
  'soundexchange',
  'youtube_content_id',
] as const;
export type RecordFileRegistrationTarget =
  (typeof RECORD_FILE_REGISTRATION_TARGETS)[number];

export const RECORD_FILE_REGISTRATION_LABELS: Readonly<
  Record<RecordFileRegistrationTarget, string>
> = {
  pro: 'Performing rights (PRO)',
  publishing_admin: 'Publishing admin',
  soundexchange: 'SoundExchange',
  youtube_content_id: 'YouTube claims',
};

/** Signature state of an agreement source, read from metadata only. */
export const RECORD_FILE_CONTRACT_STATES = ['sent', 'signed'] as const;
export type RecordFileContractState =
  (typeof RECORD_FILE_CONTRACT_STATES)[number];

/** Roles a person or company can hold on a record. */
export const RECORD_FILE_PEOPLE_ROLES = [
  'co_writer',
  'vocalist',
  'mixer',
  'mastering_engineer',
  'artwork',
  'remixer',
  'manager',
  'label',
  'distributor',
  'publisher_admin',
] as const;
export type RecordFilePersonRole = (typeof RECORD_FILE_PEOPLE_ROLES)[number];

export const RECORD_FILE_PEOPLE_ROLE_LABELS: Readonly<
  Record<RecordFilePersonRole, string>
> = {
  co_writer: 'Co-writer',
  vocalist: 'Vocalist',
  mixer: 'Mixer',
  mastering_engineer: 'Mastering engineer',
  artwork: 'Artwork',
  remixer: 'Remixer',
  manager: 'Manager',
  label: 'Label',
  distributor: 'Distributor',
  publisher_admin: 'Publisher admin',
};

/**
 * Bridge to the stored credit enum (`artist_role`) where one exists, so a
 * record-file role can be reconciled with release/recording credits. Roles
 * with no credit equivalent (business relationships) are left out.
 */
export const RECORD_FILE_ROLE_TO_CREDIT_ROLE: Readonly<
  Partial<Record<RecordFilePersonRole, ArtistRole>>
> = {
  co_writer: 'composer',
  vocalist: 'featured_artist',
  mixer: 'mix_engineer',
  mastering_engineer: 'mastering_engineer',
  remixer: 'remixer',
};

/** Tag kinds that imply the sender's role on the record. */
export const RECORD_FILE_KIND_TO_SENDER_ROLE: Readonly<
  Partial<Record<RecordFileTagKind, RecordFilePersonRole>>
> = {
  mastering: 'mastering_engineer',
  mix: 'mixer',
  distribution: 'distributor',
  artwork: 'artwork',
};

/**
 * Whether the artist allows Jovie to name a person in content. Set by the
 * artist only; never inferred. `unknown` means ask the artist first, and
 * `do_not_feature` keeps the person out of every content-facing list while
 * their paperwork stays in the record file index.
 */
export const RECORD_FILE_FEATURE_CONSENT_STATES = [
  'unknown',
  'ok',
  'do_not_feature',
] as const;
export type RecordFileFeatureConsent =
  (typeof RECORD_FILE_FEATURE_CONSENT_STATES)[number];

const FEATURE_CONSENT_SET: ReadonlySet<string> = new Set(
  RECORD_FILE_FEATURE_CONSENT_STATES
);

/** Reads an artist-set consent value; anything else is `unknown`. */
export function toRecordFileFeatureConsent(
  value: unknown
): RecordFileFeatureConsent {
  return typeof value === 'string' && FEATURE_CONSENT_SET.has(value)
    ? (value as RecordFileFeatureConsent)
    : 'unknown';
}

const PEOPLE_ROLE_SET: ReadonlySet<string> = new Set(RECORD_FILE_PEOPLE_ROLES);

export function isRecordFilePersonRole(
  value: unknown
): value is RecordFilePersonRole {
  return typeof value === 'string' && PEOPLE_ROLE_SET.has(value);
}
