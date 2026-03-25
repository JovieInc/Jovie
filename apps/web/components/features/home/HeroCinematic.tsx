'use client';

import { Bell } from 'lucide-react';
import { ArtistName } from '@/components/atoms/ArtistName';
import { CircleIconButton } from '@/components/atoms/CircleIconButton';
import { Avatar } from '@/components/molecules/Avatar';
import { Container } from '@/components/site/Container';
import { ClaimHandleForm } from './claim-handle';
import { PhoneFrame } from './PhoneFrame';
import {
  MOCK_ARTIST,
  MODE_CONTENT,
  PHONE_CONTENT_HEIGHT,
} from './phone-mode-content';

function HeroPhone() {
  return (
    <PhoneFrame>
      <div className='flex items-center justify-end px-4 pt-10 pb-1'>
        <CircleIconButton size='xs' variant='ghost' ariaLabel='Notifications'>
          <Bell className='h-4 w-4' />
        </CircleIconButton>
      </div>

      <div className='flex flex-col items-center px-5 pb-2'>
        <div className='rounded-full p-[2px] ring-1 ring-white/6 shadow-sm'>
          <Avatar
            src={MOCK_ARTIST.image}
            alt={MOCK_ARTIST.name}
            name={MOCK_ARTIST.name}
            size='display-md'
            verified={false}
          />
        </div>
        <div className='mt-2.5 text-center'>
          <ArtistName
            name={MOCK_ARTIST.name}
            handle={MOCK_ARTIST.handle}
            isVerified={MOCK_ARTIST.isVerified}
            size='md'
            showLink={false}
            as='p'
          />
          <p className='mt-0.5 text-xs text-tertiary-token tracking-[0.2em] uppercase'>
            Artist
          </p>
        </div>
      </div>

      <div
        className='relative overflow-hidden px-5'
        style={{ height: PHONE_CONTENT_HEIGHT }}
      >
        {MODE_CONTENT.profile}
      </div>

      <div className='pb-3 pt-1 text-center'>
        <p className='text-[9px] uppercase tracking-[0.15em] text-quaternary-token'>
          Powered by Jovie
        </p>
      </div>
    </PhoneFrame>
  );
}

export function HeroCinematic() {
  return (
    <section className='relative overflow-hidden pb-0 pt-[5.5rem] md:pt-[6.1rem] lg:pt-[6.6rem] xl:pt-[6.9rem]'>
      <div
        aria-hidden='true'
        className='pointer-events-none absolute inset-0'
        style={{ background: 'var(--linear-hero-backdrop)' }}
      />
      <div className='hero-glow pointer-events-none absolute inset-0' />

      <Container size='homepage'>
        <div className='mx-auto max-w-[1120px]'>
          <div className='hero-stagger'>
            {/* Desktop: two-column | Mobile: single column */}
            <div className='flex flex-col items-center gap-10 lg:flex-row lg:items-center lg:gap-16'>
              {/* Left: Copy + Claim Form */}
              <div className='max-w-[44rem] text-center lg:flex-1 lg:text-left'>
                <p className='homepage-section-eyebrow'>
                  Built for independent artists
                </p>

                <h1 className='marketing-h1-linear mt-5 text-primary-token lg:text-left'>
                  The link your music deserves.
                </h1>

                <p className='marketing-lead-linear mx-auto mt-4 max-w-[31rem] text-secondary-token md:mt-5 lg:mx-0'>
                  Smart links, release automation, and fan insight that keep
                  every launch moving.
                </p>

                <div className='mx-auto mt-6 w-full max-w-[27rem] md:mt-7 lg:mx-0'>
                  <ClaimHandleForm size='hero' />
                </div>

                <p className='mt-3.5 text-[11px] tracking-[0.01em] text-quaternary-token md:mt-4 lg:text-left'>
                  Start free with your artist page and next release ready to go.
                </p>
              </div>

              {/* Right: Phone */}
              <div className='relative flex-shrink-0 lg:flex-none'>
                <div
                  className='animate-hero-phone-float'
                  style={{
                    filter: 'drop-shadow(0 25px 60px rgba(0,0,0,0.35))',
                  }}
                >
                  <HeroPhone />
                </div>
              </div>
            </div>
          </div>
        </div>
      </Container>
    </section>
  );
}
