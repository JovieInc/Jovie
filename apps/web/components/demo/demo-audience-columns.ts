/**
 * Shared audience table column definitions for demo components.
 *
 * Used by both DemoRealAudiencePanel (demo route) and DemoAudienceSection
 * (homepage marketing section) to avoid code duplication.
 */

import { type ColumnDef, createColumnHelper } from '@tanstack/react-table';
import {
  renderLastActionCell,
  renderLtvCell,
  renderUserCell,
} from '@/components/dashboard/organisms/dashboard-audience-table/utils/column-renderers';
import type { AudienceMember } from '@/types';
import {
  renderDemoIntentCell,
  renderDemoReturningCell,
  renderDemoSourceCell,
} from './demo-audience-cell-renderers';

const columnHelper = createColumnHelper<AudienceMember>();

/**
 * Subset of real audience columns for the demo — excludes Select, QuickActions,
 * and Menu columns that require hooks/API interactions.
 */
// biome-ignore lint/suspicious/noExplicitAny: TanStack Table ColumnDef requires `any` for mixed accessor types
export const DEMO_AUDIENCE_COLUMNS: ColumnDef<AudienceMember, any>[] = [
  columnHelper.accessor('displayName', {
    id: 'user',
    header: 'Visitor',
    cell: renderUserCell,
    size: 220,
  }),
  columnHelper.accessor('intentLevel', {
    id: 'intentScore',
    header: 'Intent',
    cell: renderDemoIntentCell,
    size: 110,
  }),
  columnHelper.accessor('tipAmountTotalCents', {
    id: 'ltv',
    header: 'LTV',
    cell: renderLtvCell,
    size: 80,
  }),
  columnHelper.accessor('visits', {
    id: 'returning',
    header: 'Returning',
    cell: renderDemoReturningCell,
    size: 100,
  }),
  columnHelper.accessor('referrerHistory', {
    id: 'source',
    header: 'Source',
    cell: renderDemoSourceCell,
    size: 140,
  }),
  columnHelper.accessor('latestActions', {
    id: 'lastAction',
    header: 'Last Action',
    cell: renderLastActionCell,
    size: 160,
  }),
];
