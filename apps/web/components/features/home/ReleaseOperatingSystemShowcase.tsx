import { Radar } from 'lucide-react';
import { MarketingSurfaceCard } from '@/components/marketing/MarketingSurfaceCard';
import { AiDemo } from '@/features/home/AiDemo';
import { HomepageLabelLogoMark } from '@/features/home/HomepageLabelLogoMark';
import {
  HOME_OPERATING_MONITORING_SIGNALS,
  HOME_RELEASE_AI_CONTEXT,
} from '@/features/home/home-surface-seed';
import { getMarketingExportImage } from '@/lib/screenshots/registry';

const RELEASE_TASKS_IMAGE = getMarketingExportImage('release-tasks-desktop');

function MonitoringPanel() {
  return (
    <div
      data-testid='homepage-release-operating-system-monitoring'
      className='system-b-release-operating-system-monitoring-panel'
    >
      <div className='system-b-release-operating-system-monitoring-header'>
        <div>
          <p className='system-b-release-operating-system-monitoring-kicker'>
            Monitoring
          </p>
          <p className='system-b-release-operating-system-monitoring-title'>
            Coverage and sync
          </p>
        </div>
        <Radar
          className='system-b-release-operating-system-monitoring-icon'
          aria-hidden='true'
        />
      </div>

      <div className='system-b-release-operating-system-monitoring-list'>
        {HOME_OPERATING_MONITORING_SIGNALS.map(item => (
          <div
            key={item.partner}
            className='system-b-release-operating-system-monitoring-row'
          >
            <HomepageLabelLogoMark
              partner={item.partner}
              className='system-b-release-operating-system-label-logo'
            />
            <span className='system-b-release-operating-system-monitoring-status'>
              {item.status}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

export function ReleaseOperatingSystemShowcase() {
  return (
    <div
      data-testid='homepage-release-operating-system-surface'
      className='system-b-release-operating-system-surface'
    >
      <div className='system-b-release-operating-system-mobile-stack'>
        <div
          data-testid='homepage-release-operating-system-tasks'
          className='system-b-release-operating-system-slot'
          data-slot='tasks'
          data-layout='mobile'
        >
          <MarketingSurfaceCard
            src={RELEASE_TASKS_IMAGE.publicUrl}
            alt='Jovie release task manager with a populated campaign checklist'
            aspectRatio='16 / 10'
            objectPosition='center top'
            variant='panel'
            glowTone='amber'
            chrome='full-bleed'
          />
        </div>

        <div
          data-testid='homepage-release-operating-system-ai'
          className='system-b-release-operating-system-slot'
          data-slot='ai'
          data-layout='mobile'
        >
          <AiDemo variant='premium' contextChips={HOME_RELEASE_AI_CONTEXT} />
        </div>

        <MonitoringPanel />
      </div>

      <div className='system-b-release-operating-system-desktop-stage'>
        <div
          aria-hidden='true'
          className='system-b-release-operating-system-desktop-glow'
        />
        <div
          aria-hidden='true'
          className='system-b-release-operating-system-desktop-seam'
        />

        <div
          className='system-b-release-operating-system-slot'
          data-slot='ai'
          data-layout='desktop'
          data-testid='homepage-release-operating-system-ai'
        >
          <AiDemo variant='premium' contextChips={HOME_RELEASE_AI_CONTEXT} />
        </div>

        <div
          className='system-b-release-operating-system-slot'
          data-slot='tasks'
          data-layout='desktop'
          data-testid='homepage-release-operating-system-tasks'
        >
          <MarketingSurfaceCard
            src={RELEASE_TASKS_IMAGE.publicUrl}
            alt='Jovie release task manager with a populated campaign checklist'
            aspectRatio='16 / 10'
            objectPosition='center top'
            variant='panel'
            glowTone='amber'
            chrome='full-bleed'
          />
        </div>

        <div
          className='system-b-release-operating-system-slot'
          data-slot='monitoring'
          data-layout='desktop'
        >
          <MonitoringPanel />
        </div>
      </div>
    </div>
  );
}
