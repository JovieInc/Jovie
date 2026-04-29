import { ArrowRight, Mic, Sparkles } from 'lucide-react';
import Image from 'next/image';
import Link from 'next/link';
import { BrandLogo } from '@/components/atoms/BrandLogo';
import {
  ArmadaMusicLogo,
  AwalLogo,
  BlackHoleRecordingsLogo,
  TheOrchardLogo,
} from '@/components/features/home/label-logos';
import { APP_ROUTES } from '@/constants/routes';
import { TIM_WHITE_PROFILE } from '@/lib/tim-white';

const SUGGESTIONS = [
  'Plan my next release',
  'Prepare my profile update',
  'Draft a playlist pitch',
  'Turn fans into subscribers',
] as const;

const TRUST_LOGOS = [
  { label: 'AWAL', Logo: AwalLogo },
  { label: 'Armada Music', Logo: ArmadaMusicLogo },
  { label: 'The Orchard', Logo: TheOrchardLogo },
  { label: 'Black Hole Recordings', Logo: BlackHoleRecordingsLogo },
] as const;

export function HomeV1Design() {
  return (
    <div className='min-h-screen bg-[#06070a] text-white [color-scheme:dark]'>
      <section
        className='relative isolate flex min-h-[100svh] overflow-hidden'
        aria-labelledby='home-hero-heading'
      >
        <div
          aria-hidden='true'
          className='absolute inset-0 bg-[radial-gradient(circle_at_50%_16%,rgba(103,232,249,0.12),transparent_34%),linear-gradient(180deg,rgba(255,255,255,0.035),transparent_24%,rgba(0,0,0,0.42)_100%)]'
        />
        <div
          aria-hidden='true'
          className='absolute inset-x-0 bottom-0 h-[34%] bg-[linear-gradient(to_right,rgba(255,255,255,0.045)_1px,transparent_1px),linear-gradient(to_bottom,rgba(255,255,255,0.04)_1px,transparent_1px)] bg-[size:76px_76px] opacity-35 [mask-image:linear-gradient(to_bottom,transparent,black_32%,transparent_100%)]'
        />

        <div className='relative z-10 mx-auto flex w-full max-w-[1180px] flex-col px-5 py-6 sm:px-8 lg:px-10'>
          <nav className='flex h-12 items-center justify-between'>
            <Link
              href={APP_ROUTES.HOME}
              className='inline-flex items-center gap-2 text-white focus-ring-themed rounded-md'
              aria-label='Jovie home'
            >
              <BrandLogo size={20} tone='white' aria-hidden />
              <span className='text-[15px] font-semibold'>Jovie</span>
            </Link>
            <div className='flex items-center gap-2'>
              <Link
                href={APP_ROUTES.SIGNIN}
                className='hidden h-9 items-center rounded-full px-3.5 text-[13px] font-medium text-white/58 transition-colors hover:text-white sm:inline-flex'
              >
                Sign In
              </Link>
              <Link
                href={APP_ROUTES.SIGNUP}
                className='inline-flex h-9 items-center gap-1.5 rounded-full bg-white px-4 text-[13px] font-semibold text-black transition-colors hover:bg-white/90'
              >
                Get Started
                <ArrowRight className='h-3.5 w-3.5' strokeWidth={2.4} />
              </Link>
            </div>
          </nav>

          <div className='flex flex-1 flex-col items-center justify-center py-12 text-center sm:py-16'>
            <div className='mb-8 inline-flex items-center gap-3 rounded-full border border-white/10 bg-white/[0.035] px-3 py-2 text-left shadow-[0_18px_80px_rgba(0,0,0,0.26)] backdrop-blur-xl'>
              <Image
                src={TIM_WHITE_PROFILE.avatarSrc}
                alt=''
                width={36}
                height={36}
                className='h-9 w-9 rounded-full object-cover'
                priority
              />
              <div className='min-w-0 pr-2'>
                <p className='truncate text-[12px] font-semibold text-white'>
                  {TIM_WHITE_PROFILE.name}
                </p>
                <p className='truncate text-[11px] text-white/46'>
                  {TIM_WHITE_PROFILE.publicProfileDisplay}
                </p>
              </div>
            </div>

            <h1
              id='home-hero-heading'
              className='max-w-[12ch] text-[56px] font-semibold leading-[0.88] text-white sm:text-[84px] lg:text-[116px] xl:text-[132px]'
            >
              Release More Music With Less Work.
            </h1>
            <p className='mt-6 max-w-[40rem] text-[17px] leading-7 text-white/62 sm:text-[19px]'>
              Plan releases, create assets, pitch playlists, and promote every
              drop from one AI workspace.
            </p>

            <div className='mt-10 w-full max-w-[760px] rounded-[28px] border border-white/[0.08] bg-[#0b0d11]/88 p-3 text-left shadow-[0_34px_120px_rgba(0,0,0,0.48)] backdrop-blur-2xl'>
              <div className='flex items-start gap-3 rounded-[22px] bg-white/[0.035] px-4 py-4 ring-1 ring-white/[0.04] sm:px-5'>
                <Sparkles className='mt-1 h-4 w-4 shrink-0 text-cyan-200/70' />
                <p className='text-[15px] leading-6 text-white/78'>
                  Tell Jovie what you are releasing next. It turns the plan,
                  assets, profile updates, and fan touchpoints into a working
                  queue.
                </p>
              </div>

              <div className='mt-3 flex flex-col gap-3 rounded-[24px] border border-white/[0.07] bg-black/30 p-3 sm:flex-row sm:items-center'>
                <div className='flex min-h-12 flex-1 items-center gap-3 rounded-full bg-white/[0.04] px-4 text-[14px] text-white/42'>
                  <Mic className='h-4 w-4 shrink-0' />
                  Ask Jovie to build your release plan
                </div>
                <Link
                  href={APP_ROUTES.SIGNUP}
                  className='inline-flex h-12 shrink-0 items-center justify-center gap-2 rounded-full bg-white px-5 text-[14px] font-semibold text-black transition-colors hover:bg-white/90'
                >
                  Start
                  <ArrowRight className='h-4 w-4' strokeWidth={2.4} />
                </Link>
              </div>

              <div className='mt-3 flex flex-wrap gap-2'>
                {SUGGESTIONS.map(suggestion => (
                  <Link
                    key={suggestion}
                    href={APP_ROUTES.SIGNUP}
                    className='rounded-full border border-white/[0.08] px-3 py-1.5 text-[12px] font-medium text-white/56 transition-colors hover:border-white/16 hover:text-white'
                  >
                    {suggestion}
                  </Link>
                ))}
              </div>
            </div>
          </div>

          <div className='grid gap-5 border-t border-white/[0.07] pt-5 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center'>
            <p className='max-w-[30rem] text-[13px] leading-5 text-white/44'>
              Built for artists and teams replacing scattered release work with
              one quiet operating surface.
            </p>
            <div className='flex flex-wrap items-center gap-x-6 gap-y-3 text-white/36'>
              {TRUST_LOGOS.map(({ label, Logo }) => (
                <Logo key={label} className='h-5 w-auto opacity-70' />
              ))}
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
