'use client';

import { useSearchParams } from 'next/navigation';
import { RouteSegmentControl } from '@/components/molecules/RouteSegmentControl';
import {
  type AudienceWorkspaceDestination,
  buildAudienceWorkspaceHref,
  getAudienceWorkspaceNavigation,
} from '@/lib/audience/workspace-navigation';

export function AudienceWorkspaceSwitch({
  value,
}: Readonly<{ value: AudienceWorkspaceDestination }>) {
  const searchParams = useSearchParams();
  const audienceHref =
    value === 'contacts' ? buildAudienceWorkspaceHref(searchParams) : undefined;
  return (
    <RouteSegmentControl
      value={value}
      aria-label='Audience Workspace'
      className='max-w-72'
      options={getAudienceWorkspaceNavigation(audienceHref)}
    />
  );
}
