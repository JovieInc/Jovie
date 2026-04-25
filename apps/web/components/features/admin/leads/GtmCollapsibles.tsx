'use client';

import { ChevronRight } from 'lucide-react';
import dynamic from 'next/dynamic';
import { type ReactNode, useCallback, useEffect, useState } from 'react';
import { ContentSurfaceCard } from '@/components/molecules/ContentSurfaceCard';
import { AnimatedAccordion } from '@/components/organisms/AnimatedAccordion';
import { cn } from '@/lib/utils';
import { GrowthStatusPanel } from './GrowthStatusPanel';

const OutreachOverviewPanel = dynamic(
  () =>
    import('@/components/features/admin/outreach/OutreachOverviewPanel').then(
      m => m.OutreachOverviewPanel
    ),
  { ssr: false }
);

const InviteCampaignManager = dynamic(
  () =>
    import('@/components/features/admin/campaigns/InviteCampaignManager').then(
      m => m.InviteCampaignManager
    ),
  { ssr: false }
);

const GrowthIntakeComposer = dynamic(
  () =>
    import('@/features/admin/leads/GrowthIntakeComposer').then(
      m => m.GrowthIntakeComposer
    ),
  { ssr: false }
);

const LeadKeywordsManager = dynamic(
  () =>
    import('@/features/admin/leads/LeadKeywordsManager').then(
      m => m.LeadKeywordsManager
    ),
  { ssr: false }
);

const LeadPipelineControls = dynamic(
  () =>
    import('@/features/admin/leads/LeadPipelineControls').then(
      m => m.LeadPipelineControls
    ),
  { ssr: false }
);

interface AccordionSectionProps {
  readonly title: string;
  readonly isOpen: boolean;
  readonly onToggle: () => void;
  readonly children: ReactNode;
}

function AccordionSection({
  title,
  isOpen,
  onToggle,
  children,
}: AccordionSectionProps) {
  return (
    <ContentSurfaceCard className='overflow-hidden'>
      <button
        type='button'
        onClick={onToggle}
        aria-expanded={isOpen}
        className='flex w-full items-center gap-2 px-(--linear-app-content-padding-x) py-3 text-left'
      >
        <ChevronRight
          className={cn(
            'h-3.5 w-3.5 shrink-0 text-tertiary-token transition-transform duration-200',
            isOpen && 'rotate-90'
          )}
        />
        <span className='text-app font-medium text-primary-token'>{title}</span>
      </button>
      <AnimatedAccordion isOpen={isOpen}>{children}</AnimatedAccordion>
    </ContentSurfaceCard>
  );
}

// Map URL view params to accordion indices
function viewToAccordionIndex(view?: string): number | null {
  if (!view) return null;
  switch (view) {
    case 'ingest':
      return 0;
    case 'outreach':
    case 'campaigns':
      return 2;
    default:
      return null;
  }
}

interface GtmCollapsiblesProps {
  readonly initialOpen?: string;
}

export function GtmCollapsibles({ initialOpen }: GtmCollapsiblesProps) {
  const defaultIndex = viewToAccordionIndex(initialOpen);
  const [openSections, setOpenSections] = useState<Set<number>>(() => {
    const initial = new Set<number>();
    if (defaultIndex !== null) initial.add(defaultIndex);
    return initial;
  });
  const [everOpened, setEverOpened] = useState<Set<number>>(() => {
    const initial = new Set<number>();
    if (defaultIndex !== null) initial.add(defaultIndex);
    return initial;
  });

  // Resync when initialOpen changes via same-page navigation
  useEffect(() => {
    if (defaultIndex === null) return;

    setOpenSections(prev => {
      if (prev.has(defaultIndex)) return prev;
      const next = new Set(prev);
      next.add(defaultIndex);
      return next;
    });

    setEverOpened(prev => {
      if (prev.has(defaultIndex)) return prev;
      const next = new Set(prev);
      next.add(defaultIndex);
      return next;
    });
  }, [defaultIndex]);

  const toggle = useCallback((index: number) => {
    setOpenSections(prev => {
      const next = new Set(prev);
      if (next.has(index)) {
        next.delete(index);
      } else {
        next.add(index);
        setEverOpened(eo => {
          const nextEo = new Set(eo);
          nextEo.add(index);
          return nextEo;
        });
      }
      return next;
    });
  }, []);

  return (
    <div className='space-y-2'>
      <GrowthStatusPanel />

      <AccordionSection
        title='Tools'
        isOpen={openSections.has(0)}
        onToggle={() => toggle(0)}
      >
        {everOpened.has(0) && (
          <div className='space-y-4 px-(--linear-app-content-padding-x) py-(--linear-app-content-padding-y)'>
            <GrowthIntakeComposer
              initialMode={initialOpen === 'ingest' ? 'queue' : 'single'}
            />
            <LeadKeywordsManager />
          </div>
        )}
      </AccordionSection>

      <AccordionSection
        title='Advanced settings & actions'
        isOpen={openSections.has(1)}
        onToggle={() => toggle(1)}
      >
        {everOpened.has(1) && (
          <div className='px-(--linear-app-content-padding-x) py-(--linear-app-content-padding-y)'>
            <p className='mb-3 text-xs font-book text-secondary-token'>
              These values are set automatically by the speed dial. Override
              here if needed.
            </p>
            <LeadPipelineControls hideMainSwitch />
          </div>
        )}
      </AccordionSection>

      <AccordionSection
        title='Outreach, campaigns & insights'
        isOpen={openSections.has(2)}
        onToggle={() => toggle(2)}
      >
        {everOpened.has(2) && (
          <div className='space-y-4 px-(--linear-app-content-padding-x) py-(--linear-app-content-padding-y)'>
            <OutreachOverviewPanel />
            <InviteCampaignManager />
          </div>
        )}
      </AccordionSection>
    </div>
  );
}
