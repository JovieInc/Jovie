import { ExternalLink } from 'lucide-react';
import { HOSTNAME } from '@/constants/domains';

export const SIDEBAR_IDENTITY_SPLIT_FIXTURE_TEST_ID =
  'sidebar-identity-split-fixture';
export const SIDEBAR_IDENTITY_SPLIT_FIXTURE_GROUP_COUNT = 2;
export const SIDEBAR_IDENTITY_SPLIT_FIXTURE_RED_CLASS = 'outline-[#ff0000]';

export interface SidebarIdentitySplitLayoutFixtureProps {
  readonly profileHref: string;
  readonly displayName: string;
}

/**
 * Deliberate-red split-layout fixture.
 *
 * This is the forbidden adjacent-row pattern: Public Profile and creator
 * identity as two top-level groups with independent chrome. Production must
 * never match this structure. The red outline exists so a visual/regression
 * sweep can see the split immediately.
 */
export function SidebarIdentitySplitLayoutFixture({
  profileHref,
  displayName,
}: SidebarIdentitySplitLayoutFixtureProps) {
  const profileDisplayHref = `${HOSTNAME}${profileHref}`;

  return (
    <div
      data-testid={SIDEBAR_IDENTITY_SPLIT_FIXTURE_TEST_ID}
      data-identity-split-fixture=''
      className={`flex flex-col gap-1 outline outline-2 ${SIDEBAR_IDENTITY_SPLIT_FIXTURE_RED_CLASS}`}
    >
      <fieldset
        aria-label='Public Profile'
        data-sidebar='public-profile-row'
        className='m-0 rounded-md border-0 p-0 px-2 py-1'
      >
        <a href={profileHref} className='flex items-center gap-2'>
          <ExternalLink aria-hidden='true' className='size-3.5' />
          <span>
            <span className='block'>Public Profile</span>
            <span className='block text-2xs'>{profileDisplayHref}</span>
          </span>
        </a>
      </fieldset>
      <fieldset
        aria-label='Creator Identity'
        data-sidebar='creator-identity-row'
        className='m-0 rounded-md border-0 p-0 px-2 py-1'
      >
        <button type='button'>{displayName}</button>
      </fieldset>
    </div>
  );
}
