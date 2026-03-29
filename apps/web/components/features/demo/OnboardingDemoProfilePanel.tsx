'use client';

import { Disc3 } from 'lucide-react';
import Image from 'next/image';
import { useMemo } from 'react';
import { SocialIcon } from '@/components/atoms/SocialIcon';
import { Avatar } from '@/components/molecules/Avatar';
import { DrawerSection } from '@/components/molecules/drawer/DrawerSection';
import { DrawerStatGrid } from '@/components/molecules/drawer/DrawerStatGrid';
import { DrawerSurfaceCard } from '@/components/molecules/drawer/DrawerSurfaceCard';
import { EntityHeaderCard } from '@/components/molecules/drawer/EntityHeaderCard';
import { SidebarLinkRow } from '@/components/molecules/drawer/SidebarLinkRow';
import { StatTile } from '@/components/molecules/drawer/StatTile';
import { SIDEBAR_WIDTH } from '@/lib/constants/layout';
import {
  DEMO_DISCOVERY_SNAPSHOT,
  DEMO_SELECTED_ARTIST,
} from './mock-onboarding-data';
import type { StepId } from './OnboardingDemoSteps';

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
    header: true,
    hasArtist: idx >= 2,
    stats: idx >= 4,
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

  const activeLinks = snapshot.socialItems.filter(
    i => i.kind === 'link' && i.state === 'active'
  );
  const confirmedDsps = snapshot.dspItems.filter(
    i => i.status === 'confirmed' || i.status === 'auto_confirmed'
  );

  return (
    <aside
      className='hidden shrink-0 overflow-y-auto overscroll-contain xl:block'
      style={{ width: SIDEBAR_WIDTH }}
    >
      <div className='space-y-3 px-3 py-8'>
        {/* Identity card — always pinned */}
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

          {/* Stats inline under identity */}
          {visible.stats ? (
            <div className='mt-3 border-t border-subtle pt-3'>
              <DrawerStatGrid variant='flush'>
                <StatTile
                  label='Releases'
                  value={
                    visible.releases
                      ? String(snapshot.counts.releaseCount)
                      : '—'
                  }
                />
                <StatTile label='DSPs' value={String(confirmedDsps.length)} />
                <StatTile
                  label='Social'
                  value={
                    visible.social
                      ? String(snapshot.counts.activeSocialCount)
                      : '—'
                  }
                />
              </DrawerStatGrid>
            </div>
          ) : null}
        </DrawerSurfaceCard>

        {/* Collapsible sections */}
        {visible.dsps && confirmedDsps.length > 0 ? (
          <DrawerSection title='Platforms' surface='card'>
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
          </DrawerSection>
        ) : null}

        {visible.social && activeLinks.length > 0 ? (
          <DrawerSection title='Social' surface='card'>
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
          </DrawerSection>
        ) : null}

        {visible.releases && snapshot.releases.length > 0 ? (
          <DrawerSection title='Releases' surface='card'>
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
          </DrawerSection>
        ) : null}
      </div>
    </aside>
  );
}
