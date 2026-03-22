import { Disc, Music, Youtube } from 'lucide-react';
import Image from 'next/image';
import { RELEASES } from './releases-data';
import { TIM_WHITE_PROFILE } from './tim-white';

/**
 * Static phone mockup for the hero section showing an artist profile page.
 * Overlaps the dashboard scene to demonstrate both sides of the product:
 * the public profile (phone) and the dashboard tools (desktop).
 */
export function HeroPhoneMockup() {
  const release = RELEASES[0];

  return (
    <div
      className='relative mx-auto flex flex-col items-center'
      style={{ width: 240, height: 504 }}
    >
      {/* Outer bezel */}
      <div
        className='relative h-full w-full overflow-hidden rounded-[1.75rem] p-px'
        style={{
          backgroundColor:
            'color-mix(in oklab, var(--linear-bg-surface-1) 92%, var(--linear-bg-page))',
          boxShadow: [
            '0 0 0 1px var(--linear-border-default)',
            '0 0 0 3px rgba(255,255,255,0.02)',
            '0 16px 40px rgba(0,0,0,0.4)',
            '0 32px 72px rgba(0,0,0,0.28)',
          ].join(', '),
        }}
      >
        {/* Notch */}
        <div
          aria-hidden='true'
          className='absolute left-1/2 top-1.5 z-10 -translate-x-1/2'
          style={{
            width: 68,
            height: 20,
            borderRadius: 10,
            backgroundColor: 'var(--linear-bg-page)',
          }}
        />

        {/* Inner screen */}
        <div
          className='relative flex h-full w-full flex-col overflow-hidden rounded-[1.65rem]'
          style={{ backgroundColor: 'var(--linear-bg-page)' }}
        >
          {/* Profile header */}
          <div className='flex flex-col items-center px-4 pt-10 pb-3'>
            <div className='relative h-14 w-14 overflow-hidden rounded-full bg-surface-2'>
              <Image
                src={TIM_WHITE_PROFILE.avatarSrc}
                alt={TIM_WHITE_PROFILE.name}
                fill
                sizes='56px'
                className='object-cover'
              />
            </div>
            <p className='mt-2 text-[14px] font-semibold text-primary-token'>
              {TIM_WHITE_PROFILE.name}
            </p>
            <p className='mt-0.5 text-[11px] text-tertiary-token'>
              Never Say A Word out now
            </p>
          </div>

          {/* Now playing card */}
          <div className='mx-3 rounded-[0.85rem] border border-white/[0.06] bg-white/[0.04] p-2.5'>
            <div className='flex items-center gap-2.5'>
              <div className='relative h-10 w-10 shrink-0 overflow-hidden rounded-[0.6rem] bg-surface-2'>
                <Image
                  src={release.artwork}
                  alt={release.title}
                  fill
                  sizes='40px'
                  className='object-cover'
                />
              </div>
              <div className='min-w-0 flex-1'>
                <p className='truncate text-[12px] font-medium text-primary-token'>
                  {release.title}
                </p>
                <p className='truncate text-[10px] text-tertiary-token'>
                  {TIM_WHITE_PROFILE.name} · {release.year}
                </p>
              </div>
            </div>
          </div>

          {/* DSP links */}
          <div className='mt-3 flex flex-col gap-1.5 px-3'>
            {[
              { name: 'Spotify', icon: Disc, color: '#1DB954' },
              { name: 'Apple Music', icon: Music, color: '#FA243C' },
              { name: 'YouTube', icon: Youtube, color: '#FF0000' },
            ].map(dsp => {
              const Icon = dsp.icon;
              return (
                <div
                  key={dsp.name}
                  className='flex items-center justify-between rounded-[0.75rem] border border-white/[0.06] bg-white/[0.03] px-3 py-2'
                >
                  <div className='flex items-center gap-2'>
                    <div className='flex h-6 w-6 items-center justify-center rounded-md bg-white/[0.06]'>
                      <Icon className='h-3 w-3' style={{ color: dsp.color }} />
                    </div>
                    <span className='text-[11px] font-medium text-white/90'>
                      {dsp.name}
                    </span>
                  </div>
                  <span className='rounded-full bg-white px-2.5 py-0.5 text-[10px] font-medium text-black'>
                    Play
                  </span>
                </div>
              );
            })}
          </div>

          {/* Tour dates preview */}
          <div className='mt-3 px-3'>
            <p className='mb-1.5 text-[10px] font-medium uppercase tracking-[0.1em] text-quaternary-token'>
              Upcoming shows
            </p>
            {[
              { city: 'Atlanta', venue: 'The Masquerade', date: 'Mar 28' },
              { city: 'Nashville', venue: 'Exit/In', date: 'Apr 2' },
            ].map(show => (
              <div
                key={show.city}
                className='flex items-center justify-between border-t border-white/[0.04] py-2'
              >
                <div>
                  <p className='text-[11px] font-medium text-primary-token'>
                    {show.city}
                  </p>
                  <p className='text-[9px] text-tertiary-token'>
                    {show.venue} · {show.date}
                  </p>
                </div>
                <span className='rounded-full border border-white/[0.08] px-2 py-0.5 text-[9px] font-medium text-secondary-token'>
                  Tickets
                </span>
              </div>
            ))}
          </div>

          {/* Bottom bar */}
          <div className='mt-auto border-t border-white/[0.04] px-4 py-2.5'>
            <p className='text-center text-[9px] text-quaternary-token'>
              jov.ie/{TIM_WHITE_PROFILE.handle}
            </p>
          </div>
        </div>

        {/* Home indicator */}
        <div
          aria-hidden='true'
          className='absolute bottom-1.5 left-1/2 -translate-x-1/2'
          style={{
            width: 100,
            height: 3,
            borderRadius: 2,
            backgroundColor: 'rgba(255, 255, 255, 0.15)',
          }}
        />
      </div>
    </div>
  );
}
