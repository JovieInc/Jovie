'use client';

import {
  BellRing,
  CheckCircle2,
  ChevronDown,
  Clock3,
  Disc3,
  Gauge,
  Home,
  Link2,
  Mail,
  Search,
  Settings2,
  Sparkles,
  Users,
} from 'lucide-react';
import Image from 'next/image';
import { useState } from 'react';
import {
  DrawerSurfaceCard,
  EntityHeaderCard,
} from '@/components/molecules/drawer';
import { LINEAR_SURFACE } from '@/features/dashboard/tokens';
import { RELEASES } from './releases-data';
import { TIM_WHITE_PROFILE } from './tim-white';

const HERO_RELEASES = [
  {
    ...RELEASES[0],
    smartLink: `jov.ie/${RELEASES[0].slug}`,
    status: 'Live',
    updated: '2m ago',
    fans: '4,218',
    clicks: '1,842',
    destinationsCount: '4 DSPs',
    destinations: ['Spotify', 'Apple Music', 'YouTube Music', 'Amazon Music'],
    checklist: [
      'Smart link published',
      'Pixels attached',
      'Notifications queued',
    ],
    activity: [
      'Spotify matched instantly',
      'Apple Music live',
      'Fan campaign prepared',
    ],
  },
  {
    ...RELEASES[1],
    smartLink: `jov.ie/${RELEASES[1].slug}`,
    status: 'Catalog',
    updated: '1d ago',
    fans: '2,146',
    clicks: '963',
    destinationsCount: '3 DSPs',
    destinations: ['Spotify', 'Apple Music', 'YouTube Music'],
    checklist: ['Smart link live', 'Retargeting active', 'Tips enabled'],
    activity: [
      'Profile link updated',
      'Audience source tracked',
      'Playlists captured',
    ],
  },
  {
    ...RELEASES[2],
    smartLink: `jov.ie/${RELEASES[2].slug}`,
    status: 'Catalog',
    updated: '3d ago',
    fans: '1,628',
    clicks: '744',
    destinationsCount: '3 DSPs',
    destinations: ['Spotify', 'Apple Music', 'YouTube Music'],
    checklist: ['Smart link live', 'Profile featured', 'Email capture active'],
    activity: [
      'Tour CTA attached',
      'Instagram traffic routed',
      'Returning fans identified',
    ],
  },
] as const;

const SIDEBAR_PRIMARY = [
  { label: 'Overview', icon: Home },
  { label: 'Releases', icon: Disc3, active: true },
  { label: 'Audience', icon: Users },
  { label: 'Links', icon: Link2 },
  { label: 'Campaigns', icon: Sparkles },
] as const;

const SIDEBAR_SECONDARY = [
  { label: 'Insights', icon: Gauge },
  { label: 'Settings', icon: Settings2 },
] as const;

const HERO_STATS = [
  { label: 'Live smart links', value: '12' },
  { label: 'Fans captured', value: '12.3k' },
  { label: 'Queued notifications', value: '4.2k' },
] as const;

export function HeroDashboardScene() {
  const [activeIndex, setActiveIndex] = useState(0);
  const activeRelease = HERO_RELEASES[activeIndex];

  return (
    <figure
      aria-label='Jovie release dashboard'
      className='relative overflow-hidden rounded-[0.95rem] border border-subtle bg-surface-0 shadow-card-elevated md:rounded-[1rem]'
      style={{
        boxShadow:
          '0 0 0 1px var(--linear-app-shell-border), 0 28px 70px rgba(0,0,0,0.28), 0 10px 22px rgba(0,0,0,0.18)',
      }}
    >
      <div
        aria-hidden='true'
        className='pointer-events-none absolute inset-x-0 top-0 z-10 h-px'
        style={{
          background:
            'linear-gradient(90deg, transparent, rgba(255,255,255,0.16) 24%, rgba(255,255,255,0.22) 50%, rgba(255,255,255,0.16) 76%, transparent)',
        }}
      />

      <div className='flex h-11 items-center border-b border-subtle bg-surface-1 px-4 sm:px-5'>
        <div className='flex gap-2' aria-hidden='true'>
          <div className='h-3 w-3 rounded-full border border-black/10 bg-[#ED6A5E]' />
          <div className='h-3 w-3 rounded-full border border-black/10 bg-[#F4BF4F]' />
          <div className='h-3 w-3 rounded-full border border-black/10 bg-[#61C554]' />
        </div>
        <div className='flex-1 text-center text-xs text-tertiary-token'>
          Jovie
        </div>
        <div className='w-[52px]' />
      </div>

      <div className='grid lg:grid-cols-[216px_minmax(0,1fr)_312px] xl:grid-cols-[224px_minmax(0,1fr)_320px]'>
        <aside className='hidden border-r border-subtle bg-surface-1/75 px-4 py-4 lg:flex lg:flex-col'>
          <div className='flex items-center justify-between rounded-[0.85rem] border border-subtle bg-surface-0 px-3 py-2.5'>
            <div className='min-w-0'>
              <p className='truncate text-sm font-medium text-primary-token'>
                {TIM_WHITE_PROFILE.name}
              </p>
              <p className='text-xs text-tertiary-token'>Release system</p>
            </div>
            <ChevronDown className='h-4 w-4 text-tertiary-token' />
          </div>

          <div className='mt-5 space-y-1.5'>
            {SIDEBAR_PRIMARY.map(item => (
              // Some items are plain nav rows; only the active one carries the flag.
              <div
                key={item.label}
                className='flex items-center gap-3 rounded-[0.8rem] px-3 py-2.5'
                style={{
                  backgroundColor:
                    'active' in item && item.active
                      ? 'rgba(255,255,255,0.06)'
                      : 'transparent',
                }}
              >
                <item.icon
                  className={`h-4 w-4 ${
                    'active' in item && item.active
                      ? 'text-primary-token'
                      : 'text-tertiary-token'
                  }`}
                />
                <span
                  className={`text-sm ${
                    'active' in item && item.active
                      ? 'text-primary-token'
                      : 'text-secondary-token'
                  }`}
                >
                  {item.label}
                </span>
              </div>
            ))}
          </div>

          <div className='mt-6 border-t border-subtle pt-4'>
            {SIDEBAR_SECONDARY.map(item => (
              <div
                key={item.label}
                className='flex items-center gap-3 rounded-[0.8rem] px-3 py-2.5'
              >
                <item.icon className='h-4 w-4 text-tertiary-token' />
                <span className='text-sm text-secondary-token'>
                  {item.label}
                </span>
              </div>
            ))}
          </div>

          <div className='mt-auto rounded-[0.9rem] border border-subtle bg-surface-0 p-3.5'>
            <p className='text-[11px] uppercase tracking-[0.08em] text-quaternary-token'>
              Active workspace
            </p>
            <p className='mt-2 text-sm font-medium text-primary-token'>
              Links, notifications, and fan data in one place.
            </p>
          </div>
        </aside>

        <div className='min-w-0 border-b border-subtle lg:border-b-0 lg:border-r lg:border-subtle'>
          <div className='flex flex-wrap items-center justify-between gap-3 border-b border-subtle px-4 py-4 sm:px-5'>
            <div>
              <p className='text-lg font-semibold tracking-tight text-primary-token'>
                Releases
              </p>
              <p className='mt-1 text-sm text-secondary-token'>
                Catalog synced from Spotify. Every release gets a smart link and
                a tracked launch surface.
              </p>
            </div>

            <div className='flex items-center gap-2'>
              <div className='hidden items-center gap-2 rounded-full border border-subtle bg-surface-1 px-3 py-2 text-xs text-tertiary-token sm:flex'>
                <Search className='h-3.5 w-3.5' />
                Search releases
              </div>
              <div className='rounded-full border border-subtle bg-surface-1 px-3 py-2 text-xs font-medium text-secondary-token'>
                All releases
              </div>
            </div>
          </div>

          <div className='grid gap-3 border-b border-subtle px-4 py-4 sm:grid-cols-3 sm:px-5'>
            {HERO_STATS.map(stat => (
              <div
                key={stat.label}
                className='rounded-[0.85rem] border border-subtle bg-surface-1 px-3.5 py-3'
              >
                <p className='text-[11px] uppercase tracking-[0.08em] text-quaternary-token'>
                  {stat.label}
                </p>
                <p className='mt-1 text-lg font-semibold tracking-tight text-primary-token'>
                  {stat.value}
                </p>
              </div>
            ))}
          </div>

          <div className='px-4 py-3 sm:px-5'>
            <div className='grid grid-cols-[minmax(0,1.1fr)_auto_auto_auto_auto] items-center gap-3 border-b border-subtle px-3 py-2 text-[11px] font-medium uppercase tracking-[0.08em] text-quaternary-token'>
              <span>Release</span>
              <span className='hidden sm:block'>Status</span>
              <span className='hidden md:block'>Fans</span>
              <span className='hidden xl:block'>Destinations</span>
              <span className='hidden md:block'>Updated</span>
            </div>

            <div className='space-y-1.5 pt-2'>
              {HERO_RELEASES.map((release, index) => {
                const isActive = index === activeIndex;
                return (
                  <button
                    key={release.id}
                    type='button'
                    onMouseEnter={() => setActiveIndex(index)}
                    onFocus={() => setActiveIndex(index)}
                    onClick={() => setActiveIndex(index)}
                    className='grid w-full grid-cols-[minmax(0,1.1fr)_auto_auto_auto_auto] items-center gap-3 rounded-[0.9rem] px-3 py-3 text-left transition-colors'
                    style={{
                      backgroundColor: isActive
                        ? 'rgba(255,255,255,0.055)'
                        : 'transparent',
                    }}
                  >
                    <div className='flex min-w-0 items-center gap-3'>
                      <div className='relative h-11 w-11 shrink-0 overflow-hidden rounded-[0.7rem] bg-surface-2'>
                        <Image
                          src={release.artwork}
                          alt={release.title}
                          fill
                          sizes='44px'
                          className='object-cover'
                        />
                      </div>
                      <div className='min-w-0'>
                        <div className='flex items-center gap-2'>
                          <p className='truncate text-sm font-medium text-primary-token'>
                            {release.title}
                          </p>
                          <span className='hidden rounded-full bg-surface-1 px-1.5 py-0.5 text-[10px] font-medium text-secondary-token sm:inline-flex'>
                            {release.type}
                          </span>
                        </div>
                        <p className='mt-0.5 truncate text-xs text-tertiary-token'>
                          {release.smartLink}
                        </p>
                      </div>
                    </div>

                    <span
                      className='hidden rounded-full px-2.5 py-1 text-[11px] font-medium sm:inline-flex'
                      style={{
                        color:
                          release.status === 'Live'
                            ? 'rgb(74 222 128)'
                            : 'var(--linear-text-secondary)',
                        backgroundColor:
                          release.status === 'Live'
                            ? 'rgba(74,222,128,0.12)'
                            : 'rgba(255,255,255,0.06)',
                      }}
                    >
                      {release.status}
                    </span>

                    <span className='hidden text-sm font-medium text-secondary-token md:block'>
                      {release.fans}
                    </span>

                    <span className='hidden text-sm text-tertiary-token xl:block'>
                      {release.destinationsCount}
                    </span>

                    <span className='hidden text-sm text-tertiary-token md:block'>
                      {release.updated}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        <aside className='bg-surface-0 px-4 py-4 sm:px-5'>
          <p className='text-[11px] uppercase tracking-[0.08em] text-quaternary-token'>
            Release drawer
          </p>
          <DrawerSurfaceCard
            variant='card'
            className='mt-3 overflow-hidden bg-[color-mix(in_oklab,var(--linear-bg-surface-1)_90%,var(--linear-bg-surface-0))] p-2.5'
          >
            <EntityHeaderCard
              image={
                <div className='relative h-[68px] w-[68px] shrink-0 overflow-hidden rounded-[10px] bg-surface-2'>
                  <Image
                    src={activeRelease.artwork}
                    alt={activeRelease.title}
                    fill
                    sizes='68px'
                    className='object-cover'
                  />
                </div>
              }
              title={activeRelease.title}
              subtitle={`${TIM_WHITE_PROFILE.name} · ${activeRelease.type} · ${activeRelease.year}`}
              meta={
                <div className='mt-1 flex flex-wrap gap-1.5'>
                  <span className='rounded-full border border-subtle bg-surface-0 px-2 py-0.5 text-[10px] font-medium text-secondary-token'>
                    {activeRelease.status}
                  </span>
                  <span className='rounded-full border border-subtle bg-surface-0 px-2 py-0.5 text-[10px] font-medium text-tertiary-token'>
                    {activeRelease.destinationsCount}
                  </span>
                </div>
              }
            />
          </DrawerSurfaceCard>

          <div className='mt-4 grid grid-cols-2 gap-3'>
            <DrawerSurfaceCard
              variant='card'
              className='bg-[color-mix(in_oklab,var(--linear-bg-surface-1)_91%,var(--linear-bg-surface-0))] px-3.5 py-3'
            >
              <p className='text-[11px] uppercase tracking-[0.08em] text-quaternary-token'>
                Fans reached
              </p>
              <p className='mt-1 text-lg font-semibold tracking-tight text-primary-token'>
                {activeRelease.fans}
              </p>
            </DrawerSurfaceCard>
            <DrawerSurfaceCard
              variant='card'
              className='bg-[color-mix(in_oklab,var(--linear-bg-surface-1)_91%,var(--linear-bg-surface-0))] px-3.5 py-3'
            >
              <p className='text-[11px] uppercase tracking-[0.08em] text-quaternary-token'>
                Link clicks
              </p>
              <p className='mt-1 text-lg font-semibold tracking-tight text-primary-token'>
                {activeRelease.clicks}
              </p>
            </DrawerSurfaceCard>
          </div>

          <DrawerSurfaceCard
            variant='card'
            className={['mt-4 p-4', LINEAR_SURFACE.drawerCard].join(' ')}
          >
            <p className='text-[11px] uppercase tracking-[0.08em] text-quaternary-token'>
              Smart link
            </p>
            <div className='mt-3 flex items-center gap-2 rounded-[0.8rem] border border-subtle bg-surface-0 px-3 py-2.5'>
              <span className='inline-flex h-7 w-7 items-center justify-center rounded-[0.7rem] bg-white/[0.05] text-tertiary-token'>
                <Link2 className='h-3.5 w-3.5' />
              </span>
              <div className='min-w-0'>
                <p className='truncate text-sm font-medium text-primary-token'>
                  {activeRelease.smartLink}
                </p>
                <p className='text-xs text-tertiary-token'>
                  Auto-matched across major platforms
                </p>
              </div>
            </div>
          </DrawerSurfaceCard>

          <DrawerSurfaceCard
            variant='card'
            className={['mt-4 p-4', LINEAR_SURFACE.drawerCard].join(' ')}
          >
            <p className='text-[11px] uppercase tracking-[0.08em] text-quaternary-token'>
              Launch status
            </p>
            <div className='mt-3 space-y-2.5'>
              {activeRelease.checklist.map(item => (
                <div key={item} className='flex items-center gap-2.5'>
                  <span className='inline-flex h-5 w-5 items-center justify-center rounded-full bg-emerald-500/12 text-emerald-300'>
                    <CheckCircle2 className='h-3 w-3' />
                  </span>
                  <span className='text-sm text-secondary-token'>{item}</span>
                </div>
              ))}
            </div>
          </DrawerSurfaceCard>

          <DrawerSurfaceCard
            variant='card'
            className={['mt-4 p-4', LINEAR_SURFACE.drawerCard].join(' ')}
          >
            <div className='flex items-center justify-between gap-3'>
              <div>
                <p className='text-[11px] uppercase tracking-[0.08em] text-quaternary-token'>
                  Notification wave
                </p>
                <p className='mt-1 text-sm font-medium text-primary-token'>
                  4,218 fans queued
                </p>
              </div>
              <span className='inline-flex h-9 w-9 items-center justify-center rounded-[0.8rem] bg-emerald-500/12 text-emerald-300'>
                <BellRing className='h-4 w-4' />
              </span>
            </div>
            <p className='mt-2 text-xs leading-5 text-tertiary-token'>
              Paid release notifications trigger when the link is live and the
              release is matched.
            </p>
          </DrawerSurfaceCard>

          <DrawerSurfaceCard
            variant='card'
            className={['mt-4 p-4', LINEAR_SURFACE.drawerCard].join(' ')}
          >
            <p className='text-[11px] uppercase tracking-[0.08em] text-quaternary-token'>
              Destinations
            </p>
            <div className='mt-3 flex flex-wrap gap-2'>
              {activeRelease.destinations.map(destination => (
                <span
                  key={destination}
                  className='rounded-full border border-subtle bg-surface-0 px-2.5 py-1 text-[11px] font-medium text-secondary-token'
                >
                  {destination}
                </span>
              ))}
            </div>
          </DrawerSurfaceCard>

          <DrawerSurfaceCard
            variant='card'
            className={['mt-4 p-4', LINEAR_SURFACE.drawerCard].join(' ')}
          >
            <p className='text-[11px] uppercase tracking-[0.08em] text-quaternary-token'>
              Recent activity
            </p>
            <div className='mt-3 space-y-3'>
              {activeRelease.activity.map((item, itemIndex) => (
                <div key={item} className='flex items-start gap-2.5'>
                  <span className='mt-0.5 inline-flex h-5 w-5 items-center justify-center rounded-full bg-white/[0.06] text-tertiary-token'>
                    {itemIndex === 0 ? (
                      <Mail className='h-3 w-3' />
                    ) : itemIndex === 1 ? (
                      <Link2 className='h-3 w-3' />
                    ) : (
                      <Clock3 className='h-3 w-3' />
                    )}
                  </span>
                  <span className='text-sm text-secondary-token'>{item}</span>
                </div>
              ))}
            </div>
          </DrawerSurfaceCard>
        </aside>
      </div>
    </figure>
  );
}
