import { Radar } from 'lucide-react';
import { AiDemo } from '@/features/home/AiDemo';
import { HomepageLabelLogoMark } from '@/features/home/HomepageLabelLogoMark';
import {
  HOME_OPERATING_MONITORING_SIGNALS,
  HOME_RELEASE_AI_CONTEXT,
} from '@/features/home/home-surface-seed';
import { MarketingSurfaceCard } from '@/features/home/MarketingSurfaceCard';

function MonitoringPanel() {
  return (
    <div
      data-testid='homepage-release-operating-system-monitoring'
      className='rounded-[1.15rem] border border-white/10 bg-[linear-gradient(180deg,rgba(18,20,28,0.96),rgba(10,12,18,0.94))] p-4 shadow-[0_24px_80px_rgba(0,0,0,0.3)]'
    >
      <div className='flex items-center justify-between gap-3 border-b border-white/6 pb-3'>
        <div>
          <p className='text-[10px] font-medium text-white/42'>Monitoring</p>
          <p className='mt-1 text-[12px] font-semibold text-white'>
            Coverage and sync
          </p>
        </div>
        <Radar className='h-4 w-4 text-white/34' aria-hidden='true' />
      </div>

      <div className='mt-3 space-y-2'>
        {HOME_OPERATING_MONITORING_SIGNALS.map(item => (
          <div
            key={item.partner}
            className='flex items-center justify-between rounded-full border border-white/8 bg-white/[0.03] px-3 py-2 text-[11px] text-white/78'
          >
            <HomepageLabelLogoMark
              partner={item.partner}
              className='text-white/70'
            />
            <span className='text-white/40'>{item.status}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

export function ReleaseOperatingSystemShowcase() {
  return (
    <div data-testid='homepage-release-operating-system-surface'>
      <div className='space-y-4 lg:hidden'>
        <div data-testid='homepage-release-operating-system-tasks'>
          <MarketingSurfaceCard
            src='/product-screenshots/release-tasks-active.png'
            alt='Jovie release task manager with a populated campaign checklist'
            aspectRatio='16 / 10'
            objectPosition='center top'
            variant='panel'
            glowTone='amber'
            chrome='full-bleed'
          />
        </div>

        <div data-testid='homepage-release-operating-system-ai'>
          <AiDemo variant='premium' contextChips={HOME_RELEASE_AI_CONTEXT} />
        </div>

        <MonitoringPanel />
      </div>

      <div className='relative hidden min-h-[36rem] overflow-hidden rounded-[2rem] border border-white/8 bg-[linear-gradient(180deg,rgba(14,16,22,0.82),rgba(8,10,15,0.64))] p-6 shadow-[0_36px_110px_rgba(0,0,0,0.34)] lg:block'>
        <div
          aria-hidden='true'
          className='pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(96,165,250,0.12),transparent_30%),radial-gradient(circle_at_bottom_right,rgba(251,191,36,0.1),transparent_34%)]'
        />
        <div
          aria-hidden='true'
          className='pointer-events-none absolute inset-x-0 top-0 h-px bg-[linear-gradient(90deg,transparent,rgba(255,255,255,0.35),transparent)]'
        />

        <div
          className='absolute left-6 top-6 z-20 w-[19rem]'
          data-testid='homepage-release-operating-system-ai'
        >
          <AiDemo variant='premium' contextChips={HOME_RELEASE_AI_CONTEXT} />
        </div>

        <div
          className='absolute right-6 top-6 z-10 w-[38rem]'
          data-testid='homepage-release-operating-system-tasks'
        >
          <MarketingSurfaceCard
            src='/product-screenshots/release-tasks-active.png'
            alt='Jovie release task manager with a populated campaign checklist'
            aspectRatio='16 / 10'
            objectPosition='center top'
            variant='panel'
            glowTone='amber'
            chrome='full-bleed'
          />
        </div>

        <div className='absolute bottom-6 left-6 z-30 w-[17rem]'>
          <MonitoringPanel />
        </div>
      </div>
    </div>
  );
}
