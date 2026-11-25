/**
 * Vocabulary for the data lifecycle registry (JOV-6056): deletion
 * mechanisms, export channels, classifications and the DataClass shape.
 * Re-exported from `./data-classes`.
 */

export const DELETION_MECHANISMS = [
  /** Explicitly deleted/anonymized by POST /api/account/delete. */
  'account-delete-route',
  /** Removed by a foreign-key cascade when its parent row is deleted. */
  'fk-cascade',
  /** Deleted by the /api/cron/data-retention job after the retention window. */
  'retention-cron',
  /** Row carries an expiry column consumed by a cleanup job. */
  'expires-at',
  /** Copy held by a third-party vendor under its own deletion API/DPA. */
  'vendor',
  /** No automated deletion today — documented gap tracked in the audit doc. */
  'unmanaged',
] as const;

export type DeletionMechanism = (typeof DELETION_MECHANISMS)[number];

export const EXPORT_CHANNELS = [
  /** Included in GET /api/account/export. */
  'account-export',
  /** Available via admin/CSV export only. */
  'admin-export',
  /** Not exported anywhere today. */
  'none',
] as const;

export type ExportChannel = (typeof EXPORT_CHANNELS)[number];

export const DATA_CLASSIFICATIONS = [
  'personal-data',
  'credentials',
  'payment',
  'communications',
  'telemetry',
  'compliance',
] as const;

export type DataClassification = (typeof DATA_CLASSIFICATIONS)[number];

export interface DataClass {
  /** Stable kebab-case identifier. */
  id: string;
  title: string;
  /** Why this data exists. */
  purpose: string;
  /** Owning surface, e.g. 'app/account', 'ops/email', 'ops/finance'. */
  owner: string;
  classification: DataClassification;
  /** Physical pg table names that hold this class of data. */
  tables: string[];
  /** How long data is kept and by what mechanism, in words. */
  retention: string;
  /** How deletion propagates. */
  deletion: DeletionMechanism[];
  /** Where the data shows up in exports. */
  export: ExportChannel[];
  /** Third-party vendors that receive a copy (Stripe, Clerk, Resend, …). */
  vendors?: string[];
  notes?: string;
}
