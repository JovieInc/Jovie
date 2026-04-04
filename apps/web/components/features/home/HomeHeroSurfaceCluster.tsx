import { BellRing } from 'lucide-react';
import { HOME_HERO_TASKS } from './home-surface-seed';
import { MarketingSurfaceCard } from './MarketingSurfaceCard';

const TASK_STATUS_STYLES = {
  ready: {
    dotClassName: 'bg-emerald-300',
    pillClassName:
      'border-emerald-400/15 bg-emerald-400/10 text-emerald-100/88',
  },
  blocked: {
    dotClassName: 'bg-amber-300',
    pillClassName: 'border-amber-400/15 bg-amber-400/10 text-amber-100/88',
  },
  today: {
    dotClassName: 'bg-sky-300',
    pillClassName: 'border-sky-400/15 bg-sky-400/10 text-sky-100/88',
  },
} as const;

function HeroTaskPanel() {
  return (
    <div className='relative overflow-hidden rounded-[1.35rem] border border-white/10 bg-[linear-gradient(180deg,rgba(23,24,31,0.98),rgba(13,14,19,0.98))] p-4 shadow-[0_28px_78px_rgba(0,0,0,0.4),0_10px_28px_rgba(0,0,0,0.24)]'>
      <div
        aria-hidden='true'
        className='pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(255,255,255,0.07),transparent_34%)]'
      />
      <div
        aria-hidden='true'
        className='pointer-events-none absolute inset-x-0 top-0 h-px bg-[linear-gradient(90deg,transparent,rgba(255,255,255,0.4),transparent)]'
      />

      <div className='relative flex items-center justify-between gap-3'>
        <div>
          <p className='text-[10px] font-medium tracking-[0.02em] text-white/42'>
            Release Tasks
          </p>
        </div>
        <span className='rounded-full border border-white/10 bg-white/[0.04] px-2.5 py-1 text-[10px] font-medium text-white/62'>
          3 Open
        </span>
      </div>

      <div className='relative mt-4 space-y-4'>
        {HOME_HERO_TASKS.map((task, index) => {
          const statusStyle = TASK_STATUS_STYLES[task.statusTone];

          return (
            <div
              key={task.id}
              data-testid={`homepage-hero-task-card-${index + 1}`}
              className='flex items-start justify-between gap-2 border-b border-white/6 pb-4 last:border-b-0 last:pb-0'
            >
              <div className='min-w-0'>
                <div className='flex items-center gap-2'>
                  <span
                    aria-hidden='true'
                    className={`h-1.5 w-1.5 rounded-full ${statusStyle.dotClassName}`}
                  />
                  <p className='text-[12.5px] font-[560] leading-5 tracking-[-0.01em] text-white'>
                    {task.title}
                  </p>
                </div>
                <div className='mt-1 flex items-center gap-2 text-[11px] text-white/40'>
                  <span>{task.meta}</span>
                  <span
                    aria-hidden='true'
                    className='h-1 w-1 rounded-full bg-white/20'
                  />
                  <span>{task.dueLabel}</span>
                </div>
              </div>

              <span
                className={`shrink-0 rounded-full border px-2.5 py-1 text-[10px] font-medium ${statusStyle.pillClassName}`}
              >
                {task.statusLabel}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function HeroProfilePanel() {
  return (
    <div data-testid='homepage-hero-profile-card'>
      <MarketingSurfaceCard
        src='/product-screenshots/profile-phone.png'
        alt='Mobile artist profile showing Tim White identity and fan CTA'
        aspectRatio='9 / 16'
        objectPosition='center top'
        variant='phone-inset'
        chrome='framed'
        glowTone='violet'
        imageClassName='object-cover'
        className='shadow-[0_34px_90px_rgba(0,0,0,0.5)]'
      />
    </div>
  );
}

const HERO_DSPS = [
  { name: 'Spotify', action: 'Play' },
  { name: 'Apple Music', action: 'Listen' },
  { name: 'YouTube Music', action: 'Watch' },
  { name: 'Amazon Music', action: 'Stream' },
] as const;

function HeroSmartLinkPanel() {
  return (
    <div
      data-testid='homepage-hero-release-card'
      className='relative overflow-hidden rounded-[2rem] border border-white/10 bg-[linear-gradient(180deg,rgba(16,17,24,0.98),rgba(10,11,16,0.98))] shadow-[0_30px_90px_rgba(0,0,0,0.44)]'
    >
      <div
        aria-hidden='true'
        className='pointer-events-none absolute inset-x-0 top-0 h-px bg-[linear-gradient(90deg,transparent,rgba(255,255,255,0.3),transparent)]'
      />

      <div className='relative p-4'>
        <div className='overflow-hidden rounded-xl bg-[linear-gradient(135deg,rgba(113,112,255,0.5),rgba(46,18,94,0.7))]'>
          <div className='flex min-h-[6rem] flex-col justify-end p-3'>
            <p className='text-[10px] text-white/50'>Single</p>
            <p className='text-[15px] font-[600] text-white'>The Deep End</p>
            <p className='mt-0.5 text-[10px] text-white/50'>Tim White</p>
          </div>
        </div>

        <div className='mt-3 space-y-1.5'>
          {HERO_DSPS.map(dsp => (
            <div
              key={dsp.name}
              className='flex items-center justify-center rounded-full bg-white/[0.06] py-2 text-[10px] font-[530] text-white/70'
            >
              {dsp.name}
            </div>
          ))}
        </div>

        <p className='mt-3 text-center text-[8px] tracking-[0.08em] uppercase text-white/20'>
          Powered by Jovie
        </p>
      </div>
    </div>
  );
}

function HeroNotificationCard() {
  return (
    <div className='rounded-full border border-white/10 bg-[linear-gradient(180deg,rgba(18,20,28,0.96),rgba(10,12,18,0.94))] px-4 py-2.5 shadow-[0_20px_60px_rgba(0,0,0,0.3)]'>
      <div className='flex items-center gap-2.5'>
        <div className='flex h-6 w-6 items-center justify-center rounded-full border border-violet-400/20 bg-violet-400/10'>
          <BellRing className='h-3 w-3 text-violet-300' aria-hidden='true' />
        </div>
        <p className='text-[11px] font-[530] text-white/80'>
          1,247 fans notified
        </p>
      </div>
    </div>
  );
}

export function HomeHeroSurfaceCluster() {
  return (
    <>
      <div className='relative mx-auto w-full max-w-[34rem] lg:hidden'>
        <div className='space-y-4'>
          <div className='grid gap-4 sm:grid-cols-[minmax(0,0.82fr)_minmax(0,1.18fr)]'>
            <HeroSmartLinkPanel />
            <HeroProfilePanel />
          </div>
          <div className='sm:ml-auto sm:max-w-[20rem]'>
            <HeroTaskPanel />
          </div>
          <div className='flex justify-center'>
            <HeroNotificationCard />
          </div>
        </div>
      </div>

      <div className='relative hidden min-h-[30rem] lg:block'>
        <div className='flex items-start gap-4'>
          <div className='w-[10.5rem] shrink-0 pt-8 rotate-[-1.5deg]'>
            <HeroSmartLinkPanel />
          </div>

          <div className='w-[14.5rem] shrink-0'>
            <HeroProfilePanel />
          </div>

          <div className='w-[13rem] shrink-0 pt-12 rotate-[1deg]'>
            <HeroTaskPanel />
            <div className='mt-3'>
              <HeroNotificationCard />
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
