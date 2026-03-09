'use client';

import { Bell, CalendarDays, DollarSign, Mail } from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { ArtistName } from '@/components/atoms/ArtistName';
import { SocialIcon } from '@/components/atoms/SocialIcon';
import { Avatar } from '@/components/molecules/Avatar';
import { PhoneFrame } from './PhoneFrame';

const AUTO_ADVANCE_MS = 3200;

const MOCK_ARTIST = {
  name: 'Tim White',
  handle: 'timwhite',
  image:
    'https://egojgbuon2z2yahy.public.blob.vercel-storage.com/avatars/users/user_38SPgR24re2YSaXT2hVoFtvvlVy/tim-white-profie-pic-e2f4672b-3555-4a63-9fe6-f0d5362218f6.avif',
  isVerified: true,
} as const;

type PreviewTab = 'profile' | 'tour' | 'listen' | 'tip';

const TABS: ReadonlyArray<{ id: PreviewTab; label: string }> = [
  { id: 'profile', label: 'Profile' },
  { id: 'tour', label: 'Tour' },
  { id: 'listen', label: 'Listen' },
  { id: 'tip', label: 'Tip' },
];

/* Social icon row — matches real profile exactly */
const FULL_SOCIALS = [
  { key: 'mail', icon: Mail },
  { key: 'instagram', platform: 'instagram' as const },
  { key: 'youtube', platform: 'youtube' as const },
  { key: 'tiktok', platform: 'tiktok' as const },
  { key: 'calendar', icon: CalendarDays },
  { key: 'dollar', icon: DollarSign },
] as const;

const MINI_SOCIALS = [
  { key: 'mail', icon: Mail },
  { key: 'calendar', icon: CalendarDays },
  { key: 'dollar', icon: DollarSign },
] as const;

function SocialRow({
  items,
}: {
  items: ReadonlyArray<{
    key: string;
    icon?: React.ComponentType<{ className?: string }>;
    platform?: string;
  }>;
}) {
  return (
    <div className='flex justify-center gap-3'>
      {items.map(s => (
        <div
          key={s.key}
          className='flex items-center justify-center w-10 h-10 rounded-full border border-subtle transition-colors'
        >
          {s.platform ? (
            <SocialIcon
              platform={s.platform as 'instagram'}
              className='w-4 h-4 text-primary-token'
            />
          ) : s.icon ? (
            <s.icon className='w-4 h-4 text-primary-token' />
          ) : null}
        </div>
      ))}
    </div>
  );
}

/* ─── Tab contents matching real product ─── */

function ProfileContent() {
  return (
    <div className='flex flex-col items-center gap-5 px-5'>
      <div className='flex flex-col items-center gap-1'>
        <p className='text-[13px] text-secondary-token'>
          Never miss a release.
        </p>
      </div>
      <div
        className='w-full flex items-center justify-center rounded-full py-3 text-[15px] font-semibold text-black'
        style={{ backgroundColor: 'rgb(247,248,248)' }}
      >
        Turn on notifications
      </div>
      <SocialRow items={FULL_SOCIALS} />
    </div>
  );
}

function TourContent() {
  return (
    <div className='flex flex-col items-center px-5'>
      <h3 className='text-[28px] font-semibold tracking-tight text-primary-token self-start'>
        Tour dates
      </h3>
      <p className='text-[13px] text-secondary-token self-start mt-0.5'>
        No upcoming shows
      </p>
      <div
        className='w-full mt-4 rounded-2xl p-5 flex flex-col items-center text-center gap-3'
        style={{
          backgroundColor: 'rgba(255,255,255,0.03)',
          border: '1px solid rgba(255,255,255,0.06)',
        }}
      >
        <CalendarDays className='w-6 h-6 text-tertiary-token' />
        <p className='text-[15px] font-semibold text-primary-token'>
          Not currently on tour
        </p>
        <p className='text-[13px] text-secondary-token leading-relaxed'>
          Tim White isn&apos;t on tour right now. Get notified when dates are
          announced.
        </p>
        <div className='flex items-center gap-1.5 mt-1'>
          <span className='w-4 h-4 rounded-full bg-[var(--linear-success)] flex items-center justify-center'>
            <svg
              width='10'
              height='10'
              viewBox='0 0 24 24'
              fill='none'
              stroke='white'
              strokeWidth='3'
              strokeLinecap='round'
              strokeLinejoin='round'
              aria-hidden='true'
            >
              <title>Check</title>
              <path d='M20 6L9 17l-5-5' />
            </svg>
          </span>
          <span className='text-[13px] text-secondary-token'>
            SMS notifications on
          </span>
        </div>
        <div
          className='w-full mt-2 flex items-center justify-center rounded-full py-3 text-[15px] font-semibold text-black'
          style={{ backgroundColor: 'rgb(247,248,248)' }}
        >
          Listen Now
        </div>
      </div>
      <div className='mt-5'>
        <SocialRow items={MINI_SOCIALS} />
      </div>
    </div>
  );
}

function ListenContent() {
  return (
    <div className='flex flex-col items-center gap-3 px-5'>
      {/* DSP buttons — exact colors from production */}
      {[
        {
          name: 'Open in Spotify',
          bg: '#1DB954',
          platform: 'spotify' as const,
        },
        {
          name: 'Open in SoundCloud',
          bg: '#FF5500',
          platform: 'soundcloud' as const,
        },
        {
          name: 'Open in YouTube Music',
          bg: '#FF0000',
          platform: 'youtube' as const,
        },
      ].map(dsp => (
        <div
          key={dsp.name}
          className='w-full flex items-center justify-center gap-2.5 rounded-full py-3 text-[15px] font-semibold text-white'
          style={{ backgroundColor: dsp.bg }}
        >
          <SocialIcon platform={dsp.platform} className='w-4 h-4' />
          {dsp.name}
        </div>
      ))}
      <p className='text-[11px] text-tertiary-token mt-1'>
        If you have the app installed, it will open automatically
      </p>
      <SocialRow items={MINI_SOCIALS} />
    </div>
  );
}

function TipContent() {
  return (
    <div className='flex flex-col items-center gap-4 px-5'>
      <p className='text-[10px] font-medium uppercase tracking-[0.15em] text-tertiary-token self-start'>
        Choose amount
      </p>
      <div className='grid grid-cols-3 gap-2.5 w-full'>
        {[
          { amt: '$3', selected: false },
          { amt: '$5', selected: true },
          { amt: '$7', selected: false },
        ].map(({ amt, selected }) => (
          <div
            key={amt}
            className='aspect-square rounded-2xl flex flex-col items-center justify-center gap-0.5'
            style={{
              backgroundColor: selected
                ? 'rgb(247,248,248)'
                : 'rgba(255,255,255,0.04)',
              color: selected ? 'rgb(8,9,10)' : 'rgb(247,248,248)',
              border: selected
                ? '1px solid transparent'
                : '1px solid rgba(255,255,255,0.06)',
            }}
          >
            <span
              className='text-[9px] font-medium uppercase tracking-wider'
              style={{
                color: selected ? 'rgba(0,0,0,0.5)' : 'rgba(255,255,255,0.4)',
              }}
            >
              USD
            </span>
            <span className='text-2xl font-semibold tabular-nums tracking-tight'>
              {amt}
            </span>
          </div>
        ))}
      </div>
      <div
        className='w-full flex items-center justify-center gap-2 rounded-full py-3 text-[15px] font-semibold text-black'
        style={{ backgroundColor: 'rgb(247,248,248)' }}
      >
        <span className='text-[#3D95CE] font-bold text-sm'>V</span>
        Continue with Venmo
      </div>
      <SocialRow items={MINI_SOCIALS} />
    </div>
  );
}

/* ─── Shared profile header ─── */

function ProfileHeader({ subtitle }: { subtitle: string }) {
  return (
    <div className='flex flex-col items-center pt-10 pb-4 px-5'>
      <div className='rounded-full p-[2px] ring-1 ring-white/6 shadow-sm'>
        <Avatar
          src={MOCK_ARTIST.image}
          alt={MOCK_ARTIST.name}
          name={MOCK_ARTIST.name}
          size='display-md'
          priority
          verified={false}
        />
      </div>
      <div className='mt-3 text-center'>
        <ArtistName
          name={MOCK_ARTIST.name}
          handle={MOCK_ARTIST.handle}
          isVerified={MOCK_ARTIST.isVerified}
          size='md'
          showLink={false}
          as='p'
        />
        <p className='mt-1 text-[11px] text-secondary-token tracking-[0.2em] uppercase'>
          {subtitle}
        </p>
      </div>
    </div>
  );
}

const SUBTITLES: Record<PreviewTab, string> = {
  profile: 'Artist',
  tour: 'Tour dates',
  listen: 'Choose a Service',
  tip: 'Tip with Venmo',
};

export function HeroProfilePreview() {
  const [activeTab, setActiveTab] = useState<PreviewTab>('profile');
  const [isAutoPlaying, setIsAutoPlaying] = useState(true);
  const containerRef = useRef<HTMLDivElement>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const advanceTab = useCallback(() => {
    setActiveTab(prev => {
      const idx = TABS.findIndex(t => t.id === prev);
      return TABS[(idx + 1) % TABS.length].id;
    });
  }, []);

  useEffect(() => {
    if (!isAutoPlaying) return;
    const el = containerRef.current;
    if (!el) return;

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry?.isIntersecting) {
          timerRef.current = setInterval(advanceTab, AUTO_ADVANCE_MS);
        } else if (timerRef.current) {
          clearInterval(timerRef.current);
          timerRef.current = null;
        }
      },
      { threshold: 0.4 }
    );

    observer.observe(el);
    return () => {
      observer.disconnect();
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [isAutoPlaying, advanceTab]);

  const handleTabClick = (id: PreviewTab) => {
    setIsAutoPlaying(false);
    setActiveTab(id);
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
  };

  return (
    <div ref={containerRef} className='relative flex flex-col items-center'>
      <div className='relative flex items-start justify-center gap-8'>
        {/* Left context — stats */}
        <div
          className='hidden lg:flex flex-col gap-3 mt-24 w-52 shrink-0'
          aria-hidden='true'
        >
          {[
            { label: 'Profile views', value: '2,847', change: '+18%' },
            { label: 'Link clicks', value: '1,204', change: '+24%' },
            { label: 'Email captures', value: '342', change: '+31%' },
          ].map(stat => (
            <div
              key={stat.label}
              className='rounded-xl px-4 py-3'
              style={{
                backgroundColor: 'rgba(255,255,255,0.02)',
                border: '1px solid rgba(255,255,255,0.06)',
              }}
            >
              <p className='text-[11px] font-medium text-tertiary-token'>
                {stat.label}
              </p>
              <div className='flex items-baseline gap-2 mt-1'>
                <span className='text-lg font-semibold text-primary-token tabular-nums'>
                  {stat.value}
                </span>
                <span className='text-[11px] font-medium text-[var(--linear-success)]'>
                  {stat.change}
                </span>
              </div>
            </div>
          ))}
        </div>

        {/* Center — phone */}
        <div className='flex flex-col items-center'>
          <PhoneFrame>
            {/* Nav bar — matches real product */}
            <div className='relative z-10 flex items-center justify-between px-4 pt-9'>
              {activeTab !== 'profile' && (
                <div className='w-7 h-7 rounded-full flex items-center justify-center'>
                  <svg
                    width='16'
                    height='16'
                    viewBox='0 0 24 24'
                    fill='none'
                    stroke='currentColor'
                    strokeWidth='2'
                    strokeLinecap='round'
                    strokeLinejoin='round'
                    className='text-primary-token'
                    aria-hidden='true'
                  >
                    <title>Back</title>
                    <path d='M19 12H5M12 19l-7-7 7-7' />
                  </svg>
                </div>
              )}
              {activeTab === 'profile' && (
                <div className='w-7 h-7 flex items-center justify-center'>
                  <svg
                    width='18'
                    height='18'
                    viewBox='0 0 24 24'
                    fill='currentColor'
                    className='text-primary-token'
                    aria-hidden='true'
                  >
                    <title>Jovie</title>
                    <circle cx='12' cy='12' r='10' />
                  </svg>
                </div>
              )}
              <Bell className='w-4 h-4 text-primary-token' />
            </div>

            {/* Profile header — shared across all modes */}
            <ProfileHeader subtitle={SUBTITLES[activeTab]} />

            {/* Mode content — carousel slide */}
            <div className='relative pb-6 overflow-hidden' style={{ flex: 1 }}>
              <div
                className='flex transition-transform duration-500 ease-[cubic-bezier(0.16,1,0.3,1)]'
                style={{
                  width: `${TABS.length * 100}%`,
                  transform: `translateX(-${(TABS.findIndex(t => t.id === activeTab) * 100) / TABS.length}%)`,
                }}
              >
                <div style={{ width: `${100 / TABS.length}%` }}>
                  <ProfileContent />
                </div>
                <div style={{ width: `${100 / TABS.length}%` }}>
                  <TourContent />
                </div>
                <div style={{ width: `${100 / TABS.length}%` }}>
                  <ListenContent />
                </div>
                <div style={{ width: `${100 / TABS.length}%` }}>
                  <TipContent />
                </div>
              </div>
            </div>

            {/* Footer */}
            <div className='pb-3 text-center'>
              <p className='text-[9px] uppercase tracking-[0.15em] text-tertiary-token/50'>
                Powered by Jovie
              </p>
            </div>
          </PhoneFrame>

          {/* Carousel dots */}
          <div className='flex mt-5 gap-2'>
            {TABS.map(tab => (
              <button
                key={tab.id}
                type='button'
                aria-label={tab.label}
                onClick={() => handleTabClick(tab.id)}
                className='relative w-2 h-2 rounded-full transition-all duration-300'
                style={{
                  backgroundColor:
                    tab.id === activeTab
                      ? 'rgba(255,255,255,0.7)'
                      : 'rgba(255,255,255,0.15)',
                  transform: tab.id === activeTab ? 'scale(1.25)' : 'scale(1)',
                }}
              />
            ))}
          </div>
        </div>

        {/* Right context — activity */}
        <div
          className='hidden lg:flex flex-col gap-3 mt-24 w-52 shrink-0'
          aria-hidden='true'
        >
          {[
            {
              action: 'New subscriber',
              detail: 'alex@gmail.com',
              time: '2m ago',
            },
            {
              action: 'Spotify click',
              detail: 'via Instagram',
              time: '5m ago',
            },
            {
              action: 'Tip received',
              detail: '$5.00 via Venmo',
              time: '12m ago',
            },
          ].map(item => (
            <div
              key={item.action}
              className='rounded-xl px-4 py-3'
              style={{
                backgroundColor: 'rgba(255,255,255,0.02)',
                border: '1px solid rgba(255,255,255,0.06)',
              }}
            >
              <div className='flex items-center justify-between'>
                <p className='text-[12px] font-medium text-primary-token'>
                  {item.action}
                </p>
                <span className='text-[10px] text-tertiary-token'>
                  {item.time}
                </span>
              </div>
              <p className='mt-0.5 text-[11px] text-tertiary-token'>
                {item.detail}
              </p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
