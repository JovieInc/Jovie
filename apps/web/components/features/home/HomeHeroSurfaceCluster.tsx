import { HOME_HERO_RELEASE_MOCK, HOME_HERO_TASKS } from './home-surface-seed';
import { MarketingSurfaceCard } from './MarketingSurfaceCard';
import { ReleaseModeMockCard } from './ReleaseModeMockCard';

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
              className='flex items-start justify-between gap-4 border-b border-white/6 pb-4 last:border-b-0 last:pb-0'
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
    <div
      data-testid='homepage-hero-profile-card'
      className='relative overflow-hidden rounded-[1.5rem] border border-white/10 bg-[linear-gradient(180deg,rgba(18,19,26,0.98),rgba(12,13,19,0.98))] shadow-[0_32px_100px_rgba(0,0,0,0.42)]'
    >
      <div
        aria-hidden='true'
        className='pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top,rgba(255,255,255,0.08),transparent_30%),radial-gradient(circle_at_left,rgba(99,102,241,0.12),transparent_48%)]'
      />
      <div
        aria-hidden='true'
        className='pointer-events-none absolute inset-x-0 top-0 h-px bg-[linear-gradient(90deg,transparent,rgba(255,255,255,0.42),transparent)]'
      />
      <div className='relative min-h-[18rem] w-full px-6 pb-5 pt-5'>
        <div
          aria-hidden='true'
          className='pointer-events-none absolute inset-x-8 bottom-0 h-20 rounded-full bg-[radial-gradient(circle,rgba(0,0,0,0.46),transparent_70%)] blur-2xl'
        />
        <MarketingSurfaceCard
          src='/product-screenshots/profile-phone.png'
          alt='Mobile artist profile showing Tim White identity and fan CTA'
          aspectRatio='390 / 844'
          objectPosition='center top'
          variant='phone-inset'
          chrome='framed'
          glowTone='violet'
          imageClassName='object-contain scale-[1.02]'
          className='relative mx-auto h-full w-full max-w-[12.25rem] bg-[linear-gradient(180deg,rgba(18,19,24,0.94),rgba(8,9,13,0.98))] shadow-[0_34px_90px_rgba(0,0,0,0.5)]'
        />
      </div>
    </div>
  );
}

function HeroSmartLinkPanel() {
  return (
    <ReleaseModeMockCard
      release={HOME_HERO_RELEASE_MOCK}
      variant='compact'
      testId='homepage-hero-release-card'
      className='shadow-[0_30px_90px_rgba(0,0,0,0.44),0_10px_32px_rgba(0,0,0,0.26)]'
    />
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
        </div>
      </div>

      <div className='relative hidden h-[27rem] w-[34.5rem] lg:block'>
        <div className='absolute left-[1.25rem] top-[3.15rem] z-20 w-[8.4rem] rotate-[-1.5deg]'>
          <HeroSmartLinkPanel />
        </div>

        <div className='absolute right-[0.75rem] top-[0.35rem] z-10 w-[19.75rem]'>
          <HeroProfilePanel />
        </div>

        <div className='absolute bottom-[1.15rem] right-0 z-30 w-[12.25rem]'>
          <HeroTaskPanel />
        </div>
      </div>
    </>
  );
}
