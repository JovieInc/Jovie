'use client';

import {
  ArrowLeft,
  Bell,
  CalendarDays,
  Heart,
  Home,
  Music,
  Share2,
  User,
} from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { ArtistName } from '@/components/atoms/ArtistName';
import { CircleIconButton } from '@/components/atoms/CircleIconButton';
import { SocialIcon } from '@/components/atoms/SocialIcon';
import { Avatar } from '@/components/molecules/Avatar';
import { PhoneFrame } from './PhoneFrame';

/* ------------------------------------------------------------------ */
/*  Types & constants                                                  */
/* ------------------------------------------------------------------ */

type PanelId = 'profile' | 'tour' | 'listen' | 'tip';

const PANELS: ReadonlyArray<{ id: PanelId; label: string }> = [
  { id: 'profile', label: 'Profile' },
  { id: 'tour', label: 'Tour' },
  { id: 'listen', label: 'Listen' },
  { id: 'tip', label: 'Tip' },
];

const SOCIAL_PLATFORMS = ['instagram', 'spotify', 'youtube', 'tiktok'] as const;

const TIP_AMOUNTS = [3, 5, 10] as const;

/* ------------------------------------------------------------------ */
/*  Sidebar context data per panel                                     */
/* ------------------------------------------------------------------ */

const SIDEBAR_STATS: Record<PanelId, { label: string; value: string }[]> = {
  profile: [
    { label: 'Followers', value: '12.4K' },
    { label: 'Streams', value: '1.2M' },
    { label: 'Tips', value: '$842' },
  ],
  tour: [
    { label: 'Upcoming', value: '3' },
    { label: 'Cities', value: '8' },
    { label: 'Sold out', value: '2' },
  ],
  listen: [
    { label: 'Platforms', value: '6' },
    { label: 'Monthly', value: '45K' },
    { label: 'Top city', value: 'LA' },
  ],
  tip: [
    { label: 'Tips', value: '214' },
    { label: 'Avg tip', value: '$7' },
    { label: 'This month', value: '$312' },
  ],
};

const SIDEBAR_ACTIVITY: Record<PanelId, string[]> = {
  profile: [
    'New release added',
    'Bio updated',
    'Profile shared 24 times today',
  ],
  tour: [
    'Atlanta show nearly sold out',
    'New date added: Brooklyn',
    'Nashville tickets on sale',
  ],
  listen: [
    'Spotify streams up 18%',
    'Added to 3 new playlists',
    'Apple Music feature pending',
  ],
  tip: [
    'New tip from @musicfan',
    'Weekly tips up 22%',
    'Top supporter: @superfan',
  ],
};

/* ------------------------------------------------------------------ */
/*  Panel content components                                           */
/* ------------------------------------------------------------------ */

function ProfilePanel() {
  return (
    <div className='flex flex-col items-center gap-4 px-1'>
      {/* CTA button — replicates ProfilePrimaryCTA visual output */}
      <button
        type='button'
        className='inline-flex w-full items-center justify-center gap-2 rounded-xl bg-btn-primary px-8 py-3.5 text-sm font-semibold text-btn-primary-foreground shadow-sm transition-[transform,opacity,filter] duration-150 ease-[cubic-bezier(0.33,.01,.27,1)] hover:opacity-90 active:scale-[0.97]'
      >
        Turn on notifications
      </button>

      {/* Social icon row */}
      <div className='flex items-center justify-center gap-2'>
        {SOCIAL_PLATFORMS.map(platform => (
          <button
            key={platform}
            type='button'
            className='inline-flex h-10 w-10 items-center justify-center rounded-full border border-transparent bg-transparent text-secondary-token transition-colors duration-150 hover:border-subtle hover:bg-surface-2'
            aria-label={platform}
          >
            <SocialIcon platform={platform} size={18} aria-hidden />
          </button>
        ))}
      </div>
    </div>
  );
}

function TourPanel() {
  return (
    <div className='flex flex-col items-center gap-3 px-1 py-2'>
      <div
        className='flex w-full flex-col items-center gap-3 rounded-xl p-6'
        style={{
          backgroundColor: 'rgba(255,255,255,0.04)',
          border: '1px solid rgba(255,255,255,0.06)',
        }}
      >
        <CalendarDays className='h-8 w-8 text-tertiary-token' />
        <p className='text-center text-[13px] text-secondary-token'>
          No upcoming tour dates yet. Check back soon for live shows.
        </p>
      </div>
      <button
        type='button'
        className='inline-flex w-full items-center justify-center gap-2 rounded-xl bg-btn-primary px-8 py-3.5 text-sm font-semibold text-btn-primary-foreground shadow-sm transition-[transform,opacity,filter] duration-150 ease-[cubic-bezier(0.33,.01,.27,1)] hover:opacity-90 active:scale-[0.97]'
      >
        Listen Now
      </button>
    </div>
  );
}

function ListenPanel() {
  const dsps = [
    { platform: 'spotify', label: 'Spotify' },
    { platform: 'applemusic', label: 'Apple Music' },
    { platform: 'youtube', label: 'YouTube' },
  ] as const;

  return (
    <div className='flex flex-col gap-2 px-1'>
      {dsps.map(dsp => (
        <button
          key={dsp.platform}
          type='button'
          className='inline-flex w-full items-center justify-center gap-2.5 rounded-xl bg-btn-primary px-4 py-3.5 text-sm font-semibold text-btn-primary-foreground shadow-sm transition-[transform,opacity,filter] duration-150 ease-[cubic-bezier(0.33,.01,.27,1)] hover:opacity-90 active:scale-[0.97]'
        >
          <SocialIcon platform={dsp.platform} size={18} aria-hidden />
          {dsp.label}
        </button>
      ))}
    </div>
  );
}

function TipPanel() {
  const [selected, setSelected] = useState(1); // default to $5

  return (
    <div className='flex flex-col gap-2.5 px-1'>
      <p className='text-[10px] font-medium uppercase tracking-[0.15em] text-tertiary-token'>
        Choose amount
      </p>
      <div className='grid grid-cols-3 gap-2'>
        {TIP_AMOUNTS.map((amount, i) => (
          <button
            key={amount}
            type='button'
            onClick={() => setSelected(i)}
            aria-pressed={i === selected}
            className={`flex aspect-square flex-col items-center justify-center gap-0.5 rounded-2xl border text-center transition-all duration-150 ease-out ${
              i === selected
                ? 'border-transparent bg-btn-primary text-btn-primary-foreground shadow-sm'
                : 'border-default bg-surface-1 text-primary-token hover:border-strong hover:bg-surface-2'
            }`}
          >
            <span
              className={`text-[10px] font-medium uppercase tracking-wider ${
                i === selected
                  ? 'text-btn-primary-foreground/70'
                  : 'text-secondary-token'
              }`}
              aria-hidden='true'
            >
              USD
            </span>
            <span
              className='text-xl font-semibold tabular-nums tracking-tight'
              aria-hidden='true'
            >
              ${amount}
            </span>
          </button>
        ))}
      </div>
    </div>
  );
}

const PANEL_CONTENT: Record<PanelId, React.ReactNode> = {
  profile: <ProfilePanel />,
  tour: <TourPanel />,
  listen: <ListenPanel />,
  tip: <TipPanel />,
};

/* ------------------------------------------------------------------ */
/*  Main component                                                     */
/* ------------------------------------------------------------------ */

export function HeroProfilePreview() {
  const wrapperRef = useRef<HTMLDivElement>(null);
  const [activeIndex, setActiveIndex] = useState(0);

  const handleScroll = useCallback(() => {
    const wrapper = wrapperRef.current;
    if (!wrapper) return;

    const rect = wrapper.getBoundingClientRect();
    const wrapperTop = rect.top;
    const wrapperHeight = rect.height;
    const viewportHeight = window.innerHeight;

    // How far into the wrapper have we scrolled?
    // wrapperTop starts positive (below viewport top), goes negative as we scroll down
    const scrolledInto = -wrapperTop;
    // Each panel gets one viewport-height of scroll distance
    const panelHeight = (wrapperHeight - viewportHeight) / PANELS.length;

    if (panelHeight <= 0) return;

    const rawIndex = scrolledInto / panelHeight;
    const clampedIndex = Math.max(
      0,
      Math.min(PANELS.length - 1, Math.round(rawIndex))
    );

    setActiveIndex(clampedIndex);
  }, []);

  useEffect(() => {
    window.addEventListener('scroll', handleScroll, { passive: true });
    handleScroll(); // initial check
    return () => window.removeEventListener('scroll', handleScroll);
  }, [handleScroll]);

  const activePanel = PANELS[activeIndex].id;

  return (
    <div
      ref={wrapperRef}
      style={{ height: `${PANELS.length * 100}vh` }}
      className='relative'
    >
      {/* Sticky container — phone + sidebars */}
      <div className='sticky top-1/2 -translate-y-1/2 flex items-center justify-center gap-8 px-4'>
        {/* Left sidebar — stats */}
        <div className='hidden lg:flex flex-col gap-3 w-40'>
          {SIDEBAR_STATS[activePanel].map(stat => (
            <div
              key={stat.label}
              className='flex flex-col gap-0.5 rounded-xl p-3 transition-all duration-300'
              style={{
                backgroundColor: 'rgba(255,255,255,0.03)',
                border: '1px solid rgba(255,255,255,0.06)',
              }}
            >
              <span className='text-[10px] font-medium uppercase tracking-[0.1em] text-tertiary-token'>
                {stat.label}
              </span>
              <span className='text-lg font-semibold text-primary-token tabular-nums'>
                {stat.value}
              </span>
            </div>
          ))}
        </div>

        {/* Phone */}
        <PhoneFrame>
          {/* Nav bar */}
          <div className='flex items-center justify-between px-4 pt-10 pb-2'>
            <CircleIconButton size='xs' variant='ghost' ariaLabel='Back'>
              <ArrowLeft className='h-4 w-4' />
            </CircleIconButton>
            <CircleIconButton
              size='xs'
              variant='ghost'
              ariaLabel='Notifications'
            >
              <Bell className='h-4 w-4' />
            </CircleIconButton>
          </div>

          {/* Artist header — always visible */}
          <div className='flex flex-col items-center px-5 pb-3'>
            <Avatar
              src='/images/avatars/tim-white.jpg'
              alt='Tim White'
              name='Tim White'
              size='lg'
              rounded='full'
              verified
              priority
            />
            <div className='mt-2'>
              <ArtistName
                name='Tim White'
                handle='timwhite'
                isVerified
                size='sm'
                showLink={false}
                as='p'
              />
            </div>
            <p className='mt-0.5 text-[11px] text-secondary-token'>Artist</p>
          </div>

          {/* Panel indicator dots */}
          <div className='flex items-center justify-center gap-1.5 pb-3'>
            {PANELS.map((panel, i) => (
              <span
                key={panel.id}
                className='block rounded-full transition-all duration-300'
                style={{
                  width: i === activeIndex ? 16 : 6,
                  height: 6,
                  backgroundColor:
                    i === activeIndex
                      ? 'rgb(247,248,248)'
                      : 'rgba(255,255,255,0.2)',
                }}
              />
            ))}
          </div>

          {/* Scrolling content panels */}
          <div className='relative flex-1 overflow-hidden px-4 pb-2'>
            <div
              className='flex transition-transform duration-500 ease-[cubic-bezier(0.33,.01,.27,1)]'
              style={{
                transform: `translateX(-${activeIndex * 100}%)`,
              }}
            >
              {PANELS.map(panel => (
                <div
                  key={panel.id}
                  className='w-full flex-shrink-0'
                  style={{ minWidth: '100%' }}
                >
                  {PANEL_CONTENT[panel.id]}
                </div>
              ))}
            </div>
          </div>

          {/* Bottom nav */}
          <div className='flex items-center justify-around px-4 pb-3 pt-1'>
            <CircleIconButton size='xs' variant='surface' ariaLabel='Home'>
              <Home className='h-4 w-4' />
            </CircleIconButton>
            <CircleIconButton size='xs' variant='surface' ariaLabel='Music'>
              <Music className='h-4 w-4' />
            </CircleIconButton>
            <CircleIconButton size='xs' variant='surface' ariaLabel='Favorites'>
              <Heart className='h-4 w-4' />
            </CircleIconButton>
            <CircleIconButton size='xs' variant='surface' ariaLabel='Share'>
              <Share2 className='h-4 w-4' />
            </CircleIconButton>
            <CircleIconButton size='xs' variant='surface' ariaLabel='Profile'>
              <User className='h-4 w-4' />
            </CircleIconButton>
          </div>
        </PhoneFrame>

        {/* Right sidebar — activity */}
        <div className='hidden lg:flex flex-col gap-3 w-44'>
          {SIDEBAR_ACTIVITY[activePanel].map(item => (
            <div
              key={item}
              className='rounded-xl p-3 text-[12px] text-secondary-token transition-all duration-300'
              style={{
                backgroundColor: 'rgba(255,255,255,0.03)',
                border: '1px solid rgba(255,255,255,0.06)',
              }}
            >
              {item}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
