import { CheckCircle2, Circle } from 'lucide-react';
import { HOME_HERO_TASKS } from './home-surface-seed';
import { MarketingSurfaceCard } from './MarketingSurfaceCard';

const TASK_STATUS_STYLES = {
  ready: {
    icon: 'check' as const,
    iconClassName: 'text-emerald-400',
    pillClassName:
      'border-emerald-400/15 bg-emerald-400/10 text-emerald-100/88',
  },
  blocked: {
    icon: 'circle' as const,
    iconClassName: 'text-white/20',
    pillClassName: 'border-amber-400/15 bg-amber-400/10 text-amber-100/88',
  },
  today: {
    icon: 'ring' as const,
    iconClassName: 'border-sky-400',
    pillClassName: 'border-sky-400/15 bg-sky-400/10 text-sky-100/88',
  },
} as const;

function StatusIcon({
  icon,
  className,
}: Readonly<{ icon: 'check' | 'ring' | 'circle'; className: string }>) {
  if (icon === 'check') {
    return (
      <CheckCircle2
        className={`h-3.5 w-3.5 shrink-0 ${className}`}
        aria-hidden='true'
      />
    );
  }
  if (icon === 'ring') {
    return (
      <span
        className={`h-3.5 w-3.5 shrink-0 rounded-full border-2 ${className}`}
      />
    );
  }
  return (
    <Circle
      className={`h-3.5 w-3.5 shrink-0 ${className}`}
      aria-hidden='true'
    />
  );
}

function HeroTaskPanel() {
  return (
    <div className='space-y-2'>
      <div className='flex items-center justify-between px-1'>
        <p className='text-[10px] font-medium tracking-[0.02em] text-white/42'>
          Release Tasks
        </p>
        <span className='rounded-full border border-white/10 bg-white/[0.04] px-2.5 py-1 text-[10px] font-medium text-white/62'>
          {HOME_HERO_TASKS.length} Open
        </span>
      </div>

      {HOME_HERO_TASKS.map((task, index) => {
        const statusStyle = TASK_STATUS_STYLES[task.statusTone];

        return (
          <div
            key={task.id}
            data-testid={`homepage-hero-task-card-${index + 1}`}
            className='relative overflow-hidden rounded-xl border border-white/10 bg-[linear-gradient(180deg,rgba(23,24,31,0.98),rgba(13,14,19,0.98))] p-3 shadow-[0_12px_32px_rgba(0,0,0,0.3)]'
          >
            <div
              aria-hidden='true'
              className='pointer-events-none absolute inset-x-0 top-0 h-px bg-[linear-gradient(90deg,transparent,rgba(255,255,255,0.25),transparent)]'
            />
            <div className='relative flex items-center justify-between gap-2'>
              <div className='flex items-center gap-2 min-w-0'>
                <StatusIcon
                  icon={statusStyle.icon}
                  className={statusStyle.iconClassName}
                />
                <p className='text-[12px] font-[560] leading-5 tracking-[-0.01em] text-white truncate'>
                  {task.title}
                </p>
              </div>
              <span
                className={`shrink-0 rounded-full border px-2 py-0.5 text-[9px] font-medium ${statusStyle.pillClassName}`}
              >
                {task.statusLabel}
              </span>
            </div>
            <div className='mt-1 flex items-center gap-2 pl-[14px] text-[10px] text-white/40'>
              <span>{task.meta}</span>
              <span
                aria-hidden='true'
                className='h-0.5 w-0.5 rounded-full bg-white/20'
              />
              <span>{task.dueLabel}</span>
            </div>
          </div>
        );
      })}
    </div>
  );
}

function HeroProfilePanel() {
  return (
    <div data-testid='homepage-hero-profile-card'>
      <MarketingSurfaceCard
        src='/product-screenshots/tim-white-profile-listen-phone.png'
        alt='Mobile artist profile showing Tim White identity and fan CTA'
        aspectRatio='9 / 16'
        objectPosition='center top'
        variant='phone-inset'
        chrome='framed'
        glowTone='violet'
        imageClassName='object-cover'
        imageSizes='256px'
        className='shadow-[0_34px_90px_rgba(0,0,0,0.5)]'
        priority
      />
    </div>
  );
}

function HeroSmartLinkPanel() {
  return (
    <div data-testid='homepage-hero-release-card'>
      <MarketingSurfaceCard
        src='/product-screenshots/release-deep-end-phone.png'
        alt='The Deep End by Cosmic Gate and Tim White — release page with album art and streaming links'
        aspectRatio='9 / 16'
        objectPosition='center top'
        variant='phone-inset'
        chrome='framed'
        glowTone='blue'
        imageClassName='object-cover'
        imageSizes='208px'
        className='shadow-[0_30px_90px_rgba(0,0,0,0.44)]'
      />
    </div>
  );
}

export function HomeHeroSurfaceCluster() {
  return (
    <>
      {/* Mobile: profile dominant, release + tasks below */}
      <div className='relative mx-auto w-full max-w-[34rem] lg:hidden'>
        <div className='space-y-4'>
          <div className='mx-auto max-w-[14rem]'>
            <HeroProfilePanel />
          </div>
          <div className='grid grid-cols-2 gap-3'>
            <div className='mx-auto w-full max-w-[10rem]'>
              <HeroSmartLinkPanel />
            </div>
            <div className='flex items-center'>
              <HeroTaskPanel />
            </div>
          </div>
        </div>
      </div>

      {/* Desktop: three elements fanned out, staggered vertically */}
      <div
        className='relative hidden lg:block'
        style={{ perspective: '1600px' }}
      >
        {/* Atmospheric glow */}
        <div
          aria-hidden='true'
          className='pointer-events-none absolute inset-0 hero-cluster-glow'
        />

        <div className='relative flex items-start justify-center gap-4 xl:gap-6'>
          {/* Left: release card, tilted + dropped */}
          <div
            className='w-[9.5rem] shrink-0 pt-14 xl:w-[10.5rem]'
            style={{
              transform: 'rotateY(6deg) rotateZ(-1deg)',
              transformStyle: 'preserve-3d',
            }}
          >
            <HeroSmartLinkPanel />
          </div>

          {/* Center: dominant profile phone, elevated */}
          <div className='z-10 w-[12.5rem] shrink-0 xl:w-[14rem]'>
            <HeroProfilePanel />
          </div>

          {/* Right: task panel, tilted opposite + dropped further */}
          <div
            className='w-[11.5rem] shrink-0 pt-20 xl:w-[12.5rem]'
            style={{
              transform: 'rotateY(-4deg) rotateZ(1deg)',
              transformStyle: 'preserve-3d',
            }}
          >
            <HeroTaskPanel />
          </div>
        </div>
      </div>
    </>
  );
}
