/**
 * CSV column configuration for WaitlistEntryRow data type.
 * Used by the CSV export utility to format waitlist data for download.
 */

import type { WaitlistEntryRow } from '@/lib/admin/waitlist';
import type { CSVColumn } from '@/lib/utils/csv';
import { capitalize } from '@/lib/utils/csv';

/**
 * CSV column configuration for exporting waitlist entries.
 * Includes all relevant fields with human-readable headers.
 */
export const waitlistCSVColumns: CSVColumn<WaitlistEntryRow>[] = [
  {
    header: 'ID',
    accessor: 'id',
  },
  {
    header: 'Full Name',
    accessor: 'fullName',
  },
  {
    header: 'Email',
    accessor: 'email',
  },
  {
    header: 'Primary Goal',
    accessor: 'primaryGoal',
    formatter: value => (value ? String(value) : ''),
  },
  {
    header: 'Primary Social URL',
    accessor: 'primarySocialUrl',
  },
  {
    header: 'Social Platform',
    accessor: 'primarySocialPlatform',
  },
  {
    header: 'Follower Count',
    accessor: 'primarySocialFollowerCount',
    formatter: value =>
      value !== null && value !== undefined ? String(value) : '',
  },
  {
    header: 'Spotify URL',
    accessor: 'spotifyUrl',
    formatter: value => (value ? String(value) : ''),
  },
  {
    header: 'Heard About',
    accessor: 'heardAbout',
    formatter: value => (value ? String(value) : ''),
  },
  {
    header: 'Status',
    accessor: 'status',
    formatter: capitalize,
  },
  {
    header: 'Created At',
    accessor: 'createdAt',
    // Date formatting is handled by the CSV utility
  },
  {
    header: 'Updated At',
    accessor: 'updatedAt',
    // Date formatting is handled by the CSV utility
  },
];

/**
 * Default filename prefix for waitlist CSV exports.
 */
export const WAITLIST_CSV_FILENAME_PREFIX = 'waitlist';
