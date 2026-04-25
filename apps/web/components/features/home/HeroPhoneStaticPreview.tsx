import Image from 'next/image';
import { VerifiedBadge } from '@/components/atoms/VerifiedBadge';
import { TIM_WHITE_PROFILE } from '@/lib/tim-white';
import { PhoneFrame } from './PhoneFrame';

const ARTIST = {
  avatarSrc: TIM_WHITE_PROFILE.avatarSrc,
  handle: TIM_WHITE_PROFILE.handle,
  name: TIM_WHITE_PROFILE.name,
} as const;

export function HeroPhoneStaticPreview() {
  return (
    <div className='flex flex-col items-center'>
      <PhoneFrame>
        <div className='flex flex-col items-center px-5 pt-14 pb-3'>
          <div className='rounded-full p-[2px] ring-1 ring-white/6 shadow-sm'>
            <div className='size-32 overflow-hidden rounded-full bg-surface-1'>
              <Image
                src={ARTIST.avatarSrc}
                alt=''
                aria-hidden='true'
                className='h-full w-full object-cover object-center'
                height={128}
                loading='lazy'
                sizes='128px'
                width={128}
              />
            </div>
          </div>
          <div className='mt-2.5 text-center'>
            <p className='text-xl font-semibold text-primary-token sm:text-2xl'>
              <span className='inline-flex items-center justify-center gap-1'>
                <span>{ARTIST.name}</span>
                <VerifiedBadge className='shrink-0 text-accent' size='sm' />
              </span>
            </p>
          </div>
        </div>

        <div className='relative overflow-hidden px-5' style={{ height: 196 }}>
          <div className='flex h-full flex-col justify-center gap-3'>
            <div className='flex items-center gap-3 rounded-xl bg-surface-1 p-2.5'>
              <div
                className='h-14 w-14 shrink-0 overflow-hidden rounded-lg shadow-sm'
                style={{
                  background:
                    'linear-gradient(135deg, rgba(113,112,255,0.3) 0%, rgba(113,112,255,0.08) 100%)',
                }}
              />
              <div className='min-w-0 flex-1'>
                <p className='text-[10px] font-medium uppercase tracking-[0.12em] text-tertiary-token'>
                  Out now
                </p>
                <p className='truncate text-[13px] font-semibold text-primary-token'>
                  New Single
                </p>
              </div>
              <span className='shrink-0 rounded-lg bg-btn-primary px-3.5 py-1.5 text-[12px] font-semibold text-btn-primary-foreground shadow-sm'>
                Listen
              </span>
            </div>
          </div>
        </div>

        <div className='pb-3 pt-1 text-center'>
          <p className='text-[9px] uppercase tracking-[0.15em] text-secondary-token'>
            Powered by Jovie
          </p>
        </div>
      </PhoneFrame>
    </div>
  );
}
