/**
 * CSV column configuration for AdminUserRow data type.
 * Used by the CSV export utility to format user data for download.
 */

import type { AdminUserRow } from '@/lib/admin/users';
import type { CSVColumn } from '@/lib/utils/csv';
import { capitalize, formatYesNo } from '@/lib/utils/csv';

/**
 * CSV column configuration for exporting admin user data.
 * Includes all relevant fields with human-readable headers.
 */
export const usersCSVColumns: CSVColumn<AdminUserRow>[] = [
  {
    header: 'ID',
    accessor: 'id',
  },
  {
    header: 'Clerk ID',
    accessor: 'clerkId',
  },
  {
    header: 'Name',
    accessor: 'name',
    formatter: value => (value ? String(value) : ''),
  },
  {
    header: 'Email',
    accessor: 'email',
    formatter: value => (value ? String(value) : ''),
  },
  {
    header: 'Plan',
    accessor: 'plan',
    formatter: capitalize,
  },
  {
    header: 'Is Pro',
    accessor: 'isPro',
    formatter: formatYesNo,
  },
  {
    header: 'Stripe Customer ID',
    accessor: 'stripeCustomerId',
    formatter: value => (value ? String(value) : ''),
  },
  {
    header: 'Stripe Subscription ID',
    accessor: 'stripeSubscriptionId',
    formatter: value => (value ? String(value) : ''),
  },
  {
    header: 'Created At',
    accessor: 'createdAt',
    // Date formatting is handled by the CSV utility
  },
  {
    header: 'Deleted At',
    accessor: 'deletedAt',
    // Date formatting is handled by the CSV utility
  },
];

/**
 * Default filename prefix for users CSV exports.
 */
export const USERS_CSV_FILENAME_PREFIX = 'users';
