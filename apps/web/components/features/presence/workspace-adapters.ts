import {
  type CompanyPresenceFilter,
  filterCompanyPresencePages,
  sortCompanyPresencePages,
} from '@/lib/ovie/company-presence/model';
import {
  filterProfileWorkspaceRows,
  selectPresenceReviewRows,
  sortProfileWorkspaceRows,
} from '@/lib/profile-surfaces/workspace';
import type { CompanyPresencePage } from './company-types';
import type { ProfilesWorkspaceFilter, ProfileWorkspaceRow } from './types';
import type { PresenceWorkspaceAdapter } from './workspace-controller';

type ProfilesWorkspaceView = ProfilesWorkspaceFilter | 'suggested' | 'review';

export const CREATOR_PRESENCE_ADAPTER: PresenceWorkspaceAdapter<
  ProfileWorkspaceRow,
  ProfilesWorkspaceView
> = {
  filterRows: (rows, filter) =>
    filter === 'suggested'
      ? []
      : filter === 'review'
        ? selectPresenceReviewRows(rows)
        : filterProfileWorkspaceRows(rows, filter),
  sortRows: sortProfileWorkspaceRows,
  canSelect: row => !row.id.startsWith('preview:'),
};

export const COMPANY_PRESENCE_ADAPTER: PresenceWorkspaceAdapter<
  CompanyPresencePage,
  CompanyPresenceFilter
> = {
  filterRows: filterCompanyPresencePages,
  sortRows: sortCompanyPresencePages,
};
