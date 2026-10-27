'use client';

// @coverage-via apps/web/tests/components/profile/ProfileDrawerShell.interaction.test.tsx

import { Spinner } from '@jovie/ui';
import dynamic from 'next/dynamic';
import { Suspense, useMemo } from 'react';
import type { ProfileSurfacePresentation } from '@/features/profile/contracts';
import type { AvailableDSP } from '@/lib/dsp';
import type { EntityMentionSegment } from '@/lib/profile/entity-mentions';
import type { ShareContext } from '@/lib/share/types';
import type { TourDateViewModel } from '@/lib/tour-dates/types';
import type { PublicContact, PublicContactChannel } from '@/types/contacts';
import type { Artist, LegacySocialLink } from '@/types/db';
import type { NotificationContentType } from '@/types/notifications';
import type { PressPhoto } from '@/types/press-photos';
import { ProfileDrawerShell } from './ProfileDrawerShell';
import { PROFILE_DRAWER_MENU_ITEM_CLASS } from './profile-drawer-classes';
import type { PublicRelease } from './releases/types';
import { PROFILE_VIEW_REGISTRY } from './views/registry';

// Keep the modal shell synchronous so Escape, cancellation and focus ownership
// are available while only the heavier destination content loads.
const ProfileUnifiedDrawerContent = dynamic(() =>
  import('./ProfileUnifiedDrawerContent').then(
    mod => mod.ProfileUnifiedDrawerContent
  )
);

export type DrawerView =
  | 'menu'
  | 'share'
  | 'notifications'
  | 'about'
  | 'listen'
  | 'subscribe'
  | 'contact'
  | 'pay'
  | 'tour'
  | 'releases';

export interface ProfileUnifiedDrawerProps {
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
  readonly view: DrawerView;
  readonly onViewChange: (view: DrawerView) => void;
  readonly artist: Artist;
  readonly socialLinks: LegacySocialLink[];
  readonly contacts: PublicContact[];
  readonly primaryChannel: (contact: PublicContact) => PublicContactChannel;
  readonly dsps: AvailableDSP[];
  readonly isSubscribed: boolean;
  readonly contentPrefs: Record<NotificationContentType, boolean>;
  readonly onTogglePref: (key: NotificationContentType) => void;
  readonly onUnsubscribe: () => void;
  readonly isUnsubscribing: boolean;
  readonly shareContext: ShareContext;
  readonly enableDynamicEngagement?: boolean;
  readonly subscribeTwoStep?: boolean;
  readonly hasTip: boolean;
  readonly hasContacts: boolean;
  readonly genres?: string[] | null;
  readonly pressPhotos?: readonly PressPhoto[];
  readonly allowPhotoDownloads?: boolean;
  /** Selected-credits segments for the About destination (JOV-6199). */
  readonly creditSegments?: readonly EntityMentionSegment[];
  readonly tourDates?: TourDateViewModel[];
  readonly hasTourDates: boolean;
  readonly hasReleases: boolean;
  readonly releases?: readonly PublicRelease[];
  readonly presentation?: ProfileSurfacePresentation;
  readonly onOpenReleaseCredits?: () => void;
}

function resolveRegistryKey(
  view: DrawerView
): keyof typeof PROFILE_VIEW_REGISTRY {
  return view === 'releases' || view === 'tour' ? 'menu' : view;
}

function resolveViewMeta({
  view,
  canOpenReleasesDrawer,
  canOpenTourDrawer,
  registryKey,
}: {
  readonly view: DrawerView;
  readonly canOpenReleasesDrawer: boolean;
  readonly canOpenTourDrawer: boolean;
  readonly registryKey: keyof typeof PROFILE_VIEW_REGISTRY;
}) {
  if (view === 'releases' && canOpenReleasesDrawer) {
    return { title: 'Releases', subtitle: undefined };
  }

  if (view === 'tour' && canOpenTourDrawer) {
    return { title: 'Events', subtitle: undefined };
  }

  return PROFILE_VIEW_REGISTRY[registryKey];
}

function resolveRenderedView({
  view,
  canOpenReleasesDrawer,
  canOpenTourDrawer,
}: {
  readonly view: DrawerView;
  readonly canOpenReleasesDrawer: boolean;
  readonly canOpenTourDrawer: boolean;
}): DrawerView {
  if (view === 'releases' && !canOpenReleasesDrawer) {
    return 'menu';
  }

  if (view === 'tour' && !canOpenTourDrawer) {
    return 'menu';
  }

  return view;
}

export function ProfileUnifiedDrawer(props: ProfileUnifiedDrawerProps) {
  const {
    open,
    onOpenChange,
    view,
    onViewChange,
    hasReleases,
    hasTourDates,
    releases = [],
    tourDates = [],
    presentation = 'standalone',
  } = props;
  const visibleReleases = useMemo(
    () => releases.filter(release => Boolean(release.slug)),
    [releases]
  );
  const canOpenReleasesDrawer = hasReleases && visibleReleases.length > 0;
  const canOpenTourDrawer = hasTourDates && tourDates.length > 0;
  const meta = resolveViewMeta({
    view,
    canOpenReleasesDrawer,
    canOpenTourDrawer,
    registryKey: resolveRegistryKey(view),
  });
  // Capability churn changes the rendered fallback, never the parent's intent.
  const renderedView = resolveRenderedView({
    view,
    canOpenReleasesDrawer,
    canOpenTourDrawer,
  });
  const isSubView = renderedView !== 'menu';

  return (
    <ProfileDrawerShell
      open={open}
      onOpenChange={onOpenChange}
      title={meta.title}
      subtitle={'subtitle' in meta ? meta.subtitle : undefined}
      onBack={isSubView ? () => onViewChange('menu') : undefined}
      navigationLevel={isSubView ? 'secondary' : 'root'}
      dataTestId='profile-menu-drawer'
      presentation={presentation}
      centerTitle={renderedView === 'pay'}
    >
      <Suspense
        fallback={
          <div className='space-y-3'>
            <div className='flex items-center gap-3 px-4 py-3 text-sm text-secondary-token'>
              <Spinner size='sm' label={`Loading ${meta.title}`} />
              <span>Loading {meta.title}…</span>
            </div>
            <button
              type='button'
              className={PROFILE_DRAWER_MENU_ITEM_CLASS}
              onClick={() => onOpenChange(false)}
            >
              Cancel
            </button>
          </div>
        }
      >
        <ProfileUnifiedDrawerContent
          {...props}
          renderedView={renderedView}
          visibleReleases={visibleReleases}
          canOpenReleasesDrawer={canOpenReleasesDrawer}
          canOpenTourDrawer={canOpenTourDrawer}
        />
      </Suspense>
    </ProfileDrawerShell>
  );
}
