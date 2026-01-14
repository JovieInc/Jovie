/**
 * CSV column configuration for AdminCreatorProfileRow data type.
 * Used by the CSV export utility to format creator profile data for download.
 */

import type { AdminCreatorProfileRow } from '@/lib/admin/creator-profiles';
import type { CSVColumn } from '@/lib/utils/csv';
import { capitalize, formatOptionalString, formatYesNo } from '@/lib/utils/csv';

/**
 * CSV column configuration for exporting admin creator profile data.
 * Includes all relevant fields with human-readable headers.
 */
export const creatorsCSVColumns: CSVColumn<AdminCreatorProfileRow>[] = [
  {
    header: 'ID',
    accessor: 'id',
  },
  {
    header: 'Username',
    accessor: 'username',
  },
  {
    header: 'Username Normalized',
    accessor: 'usernameNormalized',
  },
  {
    header: 'Display Name',
    accessor: 'displayName',
    formatter: formatOptionalString,
  },
  {
    header: 'Avatar URL',
    accessor: 'avatarUrl',
    formatter: formatOptionalString,
  },
  {
    header: 'Is Verified',
    accessor: 'isVerified',
    formatter: formatYesNo,
  },
  {
    header: 'Is Featured',
    accessor: 'isFeatured',
    formatter: formatYesNo,
  },
  {
    header: 'Is Claimed',
    accessor: 'isClaimed',
    formatter: formatYesNo,
  },
  {
    header: 'Marketing Opt Out',
    accessor: 'marketingOptOut',
    formatter: formatYesNo,
  },
  {
    header: 'User ID',
    accessor: 'userId',
    formatter: formatOptionalString,
  },
  {
    header: 'Confidence',
    accessor: 'confidence',
    formatter: value =>
      value !== null && value !== undefined
        ? (Number(value) * 100).toFixed(1) + '%'
        : '',
  },
  {
    header: 'Ingestion Status',
    accessor: 'ingestionStatus',
    formatter: capitalize,
  },
  {
    header: 'Last Ingestion Error',
    accessor: 'lastIngestionError',
    formatter: formatOptionalString,
  },
  {
    header: 'Created At',
    accessor: 'createdAt',
    // Date formatting is handled by the CSV utility
  },
];

/**
 * Default filename prefix for creators CSV exports.
 */
export const CREATORS_CSV_FILENAME_PREFIX = 'creators';
