'use client';

import { Button } from '@jovie/ui';

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
      <Button
        type='button'
        variant='ghost'
        onClick={onToggle}
        aria-expanded={isOpen}
        className='flex h-auto w-full items-center justify-start gap-2 rounded-none px-(--linear-app-content-padding-x) py-3 text-left hover:bg-transparent'
      >
        <ChevronRight
          className={cn(
            'h-3.5 w-3.5 shrink-0 text-tertiary-token transition-transform duration-subtle',
            isOpen && 'rotate-90'
          )}
        />
        <span className='text-app font-medium text-primary-token'>{title}</span>
      </Button>
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
        title='Intake & Keywords'
        isOpen={openSections.has(0)}
        onToggle={() => toggle(0)}
      >
        {everOpened.has(0) && (
          <div className='space-y-4 px-(--linear-app-content-padding-x) py-(--linear-app-content-padding-y)'>
            <GrowthIntakeComposer
              initialMode={initialOpen === 'ingest' ? 'queue' : 'single'}
            />
            <LeadKeywordsManager embedded />
          </div>
        )}
      </AccordionSection>

      <AccordionSection
        title='Advanced Settings'
        isOpen={openSections.has(1)}
        onToggle={() => toggle(1)}
      >
        {everOpened.has(1) && (
          <div className='px-(--linear-app-content-padding-x) py-(--linear-app-content-padding-y)'>
            <LeadPipelineControls hideMainSwitch embedded />
          </div>
        )}
      </AccordionSection>

      <AccordionSection
        title='Outreach & Campaigns'
        isOpen={openSections.has(2)}
        onToggle={() => toggle(2)}
      >
        {everOpened.has(2) && (
          <div className='space-y-4 px-(--linear-app-content-padding-x) py-(--linear-app-content-padding-y)'>
            <OutreachOverviewPanel embedded />
            <InviteCampaignManager embedded />
          </div>
        )}
      </AccordionSection>
    </div>
  );
}
