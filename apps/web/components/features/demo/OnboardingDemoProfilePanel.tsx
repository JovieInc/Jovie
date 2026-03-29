'use client';

import { Disc3 } from 'lucide-react';
import Image from 'next/image';
import { useMemo } from 'react';
import { SocialIcon } from '@/components/atoms/SocialIcon';
import { Avatar } from '@/components/molecules/Avatar';
import { DrawerLinkSection } from '@/components/molecules/drawer/DrawerLinkSection';
import { DrawerStatGrid } from '@/components/molecules/drawer/DrawerStatGrid';
import { EntityHeaderCard } from '@/components/molecules/drawer/EntityHeaderCard';
import { SidebarLinkRow } from '@/components/molecules/drawer/SidebarLinkRow';
import { StatTile } from '@/components/molecules/drawer/StatTile';
import { SIDEBAR_WIDTH } from '@/lib/constants/layout';
import {
  DEMO_DISCOVERY_SNAPSHOT,
  DEMO_SELECTED_ARTIST,
} from './mock-onboarding-data';
import type { StepId } from './OnboardingDemoSteps';

/**
 * Which profile sections are visible at each step.
 * The panel progressively reveals content as the user advances.
 */
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
    header: true, // always show identity
    hasArtist: idx >= 2, // after spotify confirm
    stats: idx >= 4, // after upgrade, when DSPs start
    dsps: idx >= 4, // dsp step and beyond
    social: idx >= 5, // social step and beyond
    releases: idx >= 6, // releases step and beyond
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
      <div className='space-y-4 px-3 py-8'>
        {/* Identity card — always visible, progressively fills */}
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

        {/* Stats — visible from DSP step onward */}
        {visible.stats ? (
          <DrawerStatGrid variant='card'>
            <StatTile
              label='Releases'
              value={
                visible.releases ? String(snapshot.counts.releaseCount) : '—'
              }
            />
            <StatTile label='DSPs' value={String(confirmedDsps.length)} />
            <StatTile
              label='Social'
              value={
                visible.social ? String(snapshot.counts.activeSocialCount) : '—'
              }
            />
          </DrawerStatGrid>
        ) : null}

        {/* DSPs — visible from DSP step onward */}
        {visible.dsps && confirmedDsps.length > 0 ? (
          <DrawerLinkSection title='Platforms' isEmpty={false}>
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
          </DrawerLinkSection>
        ) : null}

        {/* Social links — visible from social step onward */}
        {visible.social && activeLinks.length > 0 ? (
          <DrawerLinkSection title='Social' isEmpty={false}>
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
          </DrawerLinkSection>
        ) : null}

        {/* Releases — visible from releases step onward */}
        {visible.releases && snapshot.releases.length > 0 ? (
          <DrawerLinkSection title='Releases' isEmpty={false}>
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
                    ? String(new Date(release.releaseDate).getFullYear())
                    : undefined
                }
              />
            ))}
          </DrawerLinkSection>
        ) : null}
      </div>
    </aside>
  );
}
