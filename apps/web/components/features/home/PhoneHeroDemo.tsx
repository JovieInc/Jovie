'use client';

import Image from 'next/image';
import { useState } from 'react';
import { SocialIcon } from '@/components/atoms/SocialIcon';
import { PhoneFrame } from './PhoneFrame';
import { TIM_WHITE_PROFILE } from './tim-white';

type ProfileTab = 'listen' | 'pay' | 'tour';

const TABS: ReadonlyArray<{ id: ProfileTab; label: string }> = [
  { id: 'listen', label: 'Listen' },
  { id: 'pay', label: 'Pay' },
  { id: 'tour', label: 'Tour' },
];

const PROFILE = {
  name: TIM_WHITE_PROFILE.name,
  tagline: 'Indie / Alternative · Los Angeles',
  avatarSrc: TIM_WHITE_PROFILE.avatarSrc,
} as const;

function ListenContent() {
  const dsps = [
    {
      name: 'Spotify',
      icon: <SocialIcon platform='spotify' className='w-3.5 h-3.5' />,
      color: '#1DB954',
    },
    {
      name: 'Apple Music',
      icon: <SocialIcon platform='apple' className='w-3.5 h-3.5' />,
      color: '#FA243C',
    },
    {
      name: 'YouTube',
      icon: <SocialIcon platform='youtube' className='w-3.5 h-3.5' />,
      color: '#FF0000',
    },
  ];
  return (
    <div className='flex flex-col gap-2'>
      {dsps.map(dsp => (
        <div
          key={dsp.name}
          className='flex items-center justify-between p-2.5 rounded-xl'
          style={{
            backgroundColor: 'rgba(255,255,255,0.04)',
            border: '1px solid rgba(255,255,255,0.06)',
          }}
        >
          <div className='flex items-center gap-2.5'>
            <div
              className='w-7 h-7 rounded-lg flex items-center justify-center'
              style={{
                backgroundColor: 'rgba(255,255,255,0.06)',
                color: dsp.color,
              }}
            >
              {dsp.icon}
            </div>
            <span className='text-[13px] font-medium text-white/90'>
              {dsp.name}
            </span>
          </div>
          <span className='px-3 py-1 rounded-full text-[11px] font-medium bg-white text-black'>
            Play
          </span>
        </div>
      ))}
    </div>
  );
}

function PayContent() {
  return (
    <div className='flex flex-col gap-2.5'>
      <p className='text-[10px] font-medium uppercase tracking-[0.15em] text-white/40'>
        Choose amount
      </p>
      <div className='grid grid-cols-3 gap-2'>
        {['$5', '$10', '$20'].map(amt => (
          <div
            key={amt}
            className='aspect-square rounded-xl flex flex-col items-center justify-center gap-0.5'
            style={{
              backgroundColor:
                amt === '$10' ? 'rgb(247,248,248)' : 'rgba(255,255,255,0.04)',
              color: amt === '$10' ? 'rgb(8,9,10)' : 'rgb(247,248,248)',
              border:
                amt === '$10'
                  ? '1px solid transparent'
                  : '1px solid rgba(255,255,255,0.06)',
            }}
          >
            <span
              className='text-[9px] font-medium uppercase tracking-wider'
              style={{
                color:
                  amt === '$10' ? 'rgba(0,0,0,0.5)' : 'rgba(255,255,255,0.4)',
              }}
            >
              USD
            </span>
            <span className='text-xl font-semibold tabular-nums tracking-tight'>
              {amt}
            </span>
          </div>
        ))}
      </div>
      <div className='flex items-center justify-center rounded-xl px-4 py-2.5 text-[13px] font-medium bg-white text-black mt-1'>
        Continue with Venmo
      </div>
    </div>
  );
}

function TourContent() {
  const shows = [
    { city: 'Atlanta, GA', venue: 'The Earl', date: 'Mar 14' },
    { city: 'Nashville, TN', venue: 'Exit/In', date: 'Mar 21' },
    { city: 'Brooklyn, NY', venue: "Baby's All Right", date: 'Apr 4' },
  ];
  return (
    <div className='flex flex-col gap-2'>
      {shows.map(show => (
        <div
          key={show.city}
          className='flex items-center justify-between p-2.5 rounded-xl'
          style={{
            backgroundColor: 'rgba(255,255,255,0.04)',
            border: '1px solid rgba(255,255,255,0.06)',
          }}
        >
          <div className='flex flex-col gap-0.5'>
            <span className='text-[13px] font-medium text-white/90'>
              {show.city}
            </span>
            <span className='text-[11px] text-white/40'>
              {show.date} · {show.venue}
            </span>
          </div>
          <span className='px-3 py-1 rounded-full text-[11px] font-medium bg-white text-black'>
            Tickets
          </span>
        </div>
      ))}
    </div>
  );
}

const TAB_CONTENT: Record<ProfileTab, React.ReactNode> = {
  listen: <ListenContent />,
  pay: <PayContent />,
  tour: <TourContent />,
};

export function PhoneHeroDemo() {
  const [activeTab, setActiveTab] = useState<ProfileTab>('listen');

  return (
    <PhoneFrame>
      {/* Profile header */}
      <div className='flex flex-col items-center pt-10 pb-4 px-5'>
        <div className='w-14 h-14 rounded-full overflow-hidden border border-white/10'>
          <Image
            src={PROFILE.avatarSrc}
            alt='Tim White'
            width={112}
            height={112}
            className='w-full h-full object-cover'
            priority
          />
        </div>
        <p className='mt-2.5 text-[15px] font-semibold text-white'>
          {PROFILE.name}
        </p>
        <p className='mt-0.5 text-[11px] text-white/40 text-center px-4'>
          {PROFILE.tagline}
        </p>
      </div>

      {/* Tab bar */}
      <div
        className='relative flex mx-4 rounded-xl overflow-hidden'
        style={{ backgroundColor: 'rgba(255,255,255,0.04)' }}
      >
        {/* Sliding indicator */}
        <span
          aria-hidden='true'
          className='absolute inset-y-0 left-0 rounded-xl'
          style={{
            width: `${100 / TABS.length}%`,
            transform: `translateX(${TABS.findIndex(t => t.id === activeTab) * 100}%)`,
            backgroundColor: 'rgba(255,255,255,0.08)',
            transition: 'transform 0.25s cubic-bezier(0.16, 1, 0.3, 1)',
          }}
        />
        {TABS.map(tab => (
          <button
            key={tab.id}
            type='button'
            onClick={() => setActiveTab(tab.id)}
            className='relative z-10 flex-1 py-2 text-[11px] font-medium text-center transition-colors'
            style={{
              color:
                tab.id === activeTab
                  ? 'rgb(247,248,248)'
                  : 'rgba(255,255,255,0.4)',
            }}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Tab content */}
      <div className='px-5 pt-4 pb-6 overflow-y-auto' style={{ flex: 1 }}>
        {TABS.map(tab => (
          <div
            key={tab.id}
            style={{
              display: tab.id === activeTab ? 'block' : 'none',
            }}
          >
            {TAB_CONTENT[tab.id]}
          </div>
        ))}
      </div>
    </PhoneFrame>
  );
}
