'use client';

import { Disc3 } from 'lucide-react';
import Image from 'next/image';
import { useEffect, useMemo, useState } from 'react';
import { SocialIcon } from '@/components/atoms/SocialIcon';
import { Avatar } from '@/components/molecules/Avatar';
import { DrawerPropertyRow } from '@/components/molecules/drawer/DrawerPropertyRow';
import { DrawerSurfaceCard } from '@/components/molecules/drawer/DrawerSurfaceCard';
import { DrawerTabbedCard } from '@/components/molecules/drawer/DrawerTabbedCard';
import { DrawerTabs } from '@/components/molecules/drawer/DrawerTabs';
import { EntityHeaderCard } from '@/components/molecules/drawer/EntityHeaderCard';
import { SidebarLinkRow } from '@/components/molecules/drawer/SidebarLinkRow';
import {
  DEMO_DISCOVERY_SNAPSHOT,
  DEMO_SELECTED_ARTIST,
} from './mock-onboarding-data';
import type { StepId } from './OnboardingDemoSteps';

/** Slightly narrower than the standard 360px drawer to keep onboarding airy. */
const ONBOARDING_PANEL_WIDTH = 300;

type ProfileTab = 'about' | 'platforms' | 'social' | 'releases';

function getVisibleSections(step: StepId) {
  const order: StepId[] = [
    'handle',
    'spotify',
    'artist-confirm',
    'upgrade',
    'dsp',
    'social',
    'releases',
    'late-arrivals',
    'profile-ready',
  ];
  const idx = order.indexOf(step);
  return {
    hasArtist: idx >= 2,
    dsps: idx >= 4,
    social: idx >= 5,
    releases: idx >= 6,
  };
}

interface OnboardingDemoProfilePanelProps {
  readonly currentStep: StepId;
}

export function OnboardingDemoProfilePanel({
  currentStep,
}: OnboardingDemoProfilePanelProps) {
  const visible = useMemo(() => getVisibleSections(currentStep), [currentStep]);
  const snapshot = DEMO_DISCOVERY_SNAPSHOT;
  const artist = DEMO_SELECTED_ARTIST;
  const profile = snapshot.profile;
  const [activeTab, setActiveTab] = useState<ProfileTab>('about');

  const activeLinks = snapshot.socialItems.filter(
    i => i.kind === 'link' && i.state === 'active'
  );
  const confirmedDsps = snapshot.dspItems.filter(
    i => i.status === 'confirmed' || i.status === 'auto_confirmed'
  );

  const tabOptions = useMemo(() => {
    const tabs: { label: string; value: ProfileTab }[] = [
      { label: 'About', value: 'about' },
    ];
    if (visible.dsps) {
      tabs.push({
        label: `Platforms (${confirmedDsps.length})`,
        value: 'platforms',
      });
    }
    if (visible.social) {
      tabs.push({
        label: `Social (${activeLinks.length})`,
        value: 'social',
      });
    }
    if (visible.releases) {
      tabs.push({
        label: `Releases (${snapshot.releases.length})`,
        value: 'releases',
      });
    }
    return tabs;
  }, [
    visible.dsps,
    visible.social,
    visible.releases,
    confirmedDsps.length,
    activeLinks.length,
    snapshot.releases.length,
  ]);

  // Reset to 'about' when the active tab is no longer available (e.g. navigating backward)
  useEffect(() => {
    if (!tabOptions.some(t => t.value === activeTab)) {
      setActiveTab('about');
    }
  }, [tabOptions, activeTab]);

  const tabContent = (() => {
    switch (activeTab) {
      case 'about':
        return (
          <div className='space-y-2'>
            {profile.bio ? (
              <p className='text-[12px] leading-[1.6] text-secondary-token'>
                {profile.bio}
              </p>
            ) : null}
            <div className='space-y-0.5'>
              {profile.location ? (
                <DrawerPropertyRow label='Location' value={profile.location} />
              ) : null}
              {profile.hometown ? (
                <DrawerPropertyRow label='Hometown' value={profile.hometown} />
              ) : null}
              {profile.activeSinceYear ? (
                <DrawerPropertyRow
                  label='Active since'
                  value={String(profile.activeSinceYear)}
                />
              ) : null}
            </div>
          </div>
        );

      case 'platforms':
        if (!visible.dsps) return null;
        return (
          <div>
            {confirmedDsps.map(item => (
              <SidebarLinkRow
                key={item.id}
                icon={
                  <SocialIcon
                    platform={item.providerId}
                    className='h-4 w-4'
                    aria-hidden
                  />
                }
                label={item.providerLabel}
                url={item.externalArtistUrl || '#'}
              />
            ))}
          </div>
        );

      case 'social':
        if (!visible.social) return null;
        return (
          <div>
            {activeLinks.map(link => (
              <SidebarLinkRow
                key={`${link.kind}:${link.id}`}
                icon={
                  <SocialIcon
                    platform={link.platform}
                    className='h-4 w-4'
                    aria-hidden
                  />
                }
                label={link.platformLabel}
                url={link.url}
                deepLinkPlatform={link.platform}
              />
            ))}
          </div>
        );

      case 'releases':
        if (!visible.releases) return null;
        return (
          <div>
            {snapshot.releases.slice(0, 4).map(release => (
              <SidebarLinkRow
                key={release.id}
                icon={
                  release.artworkUrl ? (
                    <Image
                      src={release.artworkUrl}
                      alt=''
                      width={20}
                      height={20}
                      className='h-5 w-5 rounded-[3px] object-cover'
                      unoptimized
                    />
                  ) : (
                    <Disc3 className='h-4 w-4' />
                  )
                }
                label={release.title}
                url='#'
                badge={
                  release.releaseDate
                    ? String(
                        new Date(
                          `${release.releaseDate}T00:00:00Z`
                        ).getUTCFullYear()
                      )
                    : undefined
                }
              />
            ))}
          </div>
        );
    }
  })();

  return (
    <aside
      className='hidden shrink-0 overflow-y-auto overscroll-contain xl:block'
      style={{ width: ONBOARDING_PANEL_WIDTH }}
    >
      <div className='space-y-3 px-3 py-8'>
        {/* Identity card */}
        <DrawerSurfaceCard variant='card' className='p-4'>
          <EntityHeaderCard
            image={
              <Avatar
                src={visible.hasArtist ? profile.avatarUrl : null}
                alt={visible.hasArtist ? artist.name : 'Your profile'}
                name={visible.hasArtist ? artist.name : '?'}
                size='xl'
                rounded='full'
              />
            }
            title={visible.hasArtist ? artist.name : 'Your profile'}
            subtitle={`@${profile.username}`}
            meta={
              visible.hasArtist && profile.genres?.length ? (
                <div className='mt-1.5 flex flex-wrap gap-1.5'>
                  {profile.genres.slice(0, 3).map(genre => (
                    <span
                      key={genre}
                      className='rounded-full bg-surface-2 px-2 py-0.5 text-[10px] font-medium capitalize text-secondary-token'
                    >
                      {genre}
                    </span>
                  ))}
                </div>
              ) : null
            }
          />
        </DrawerSurfaceCard>

        {/* Tabbed content card — tabs inside the card */}
        {visible.hasArtist ? (
          <DrawerTabbedCard
            tabs={
              <DrawerTabs
                value={activeTab}
                onValueChange={setActiveTab}
                options={tabOptions}
                ariaLabel='Profile sections'
                overflowMode='scroll'
              />
            }
          >
            {tabContent}
          </DrawerTabbedCard>
        ) : null}
      </div>
    </aside>
  );
}
