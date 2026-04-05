'use client';

import { ChevronRight } from 'lucide-react';
import { type ReactNode, useCallback, useState } from 'react';
import { ContentSurfaceCard } from '@/components/molecules/ContentSurfaceCard';
import { AnimatedAccordion } from '@/components/organisms/AnimatedAccordion';
import { cn } from '@/lib/utils';

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
        className='flex w-full items-center gap-2 px-(--linear-app-content-padding-x) py-3 text-left'
      >
        <ChevronRight
          className={cn(
            'h-3.5 w-3.5 shrink-0 text-tertiary-token transition-transform duration-200',
            isOpen && 'rotate-90'
          )}
        />
        <span className='text-[13px] font-[510] text-primary-token'>
          {title}
        </span>
      </button>
      <AnimatedAccordion isOpen={isOpen}>{children}</AnimatedAccordion>
    </ContentSurfaceCard>
  );
}

// Lazy wrappers for secondary panels (only load when opened)
function LazyOutreachCampaignsInsights({
  hasOpened,
}: Readonly<{ hasOpened: boolean }>) {
  if (!hasOpened) return null;

  // Import inline to avoid loading until needed
  const OutreachOverviewPanel =
    require('@/components/features/admin/outreach/OutreachOverviewPanel').OutreachOverviewPanel;
  const InviteCampaignManager =
    require('@/components/features/admin/campaigns/InviteCampaignManager').InviteCampaignManager;
  const _LeadGtmInsights =
    require('@/components/features/admin/leads/LeadGtmInsights').LeadGtmInsights;

  return (
    <div className='space-y-4 px-(--linear-app-content-padding-x) py-(--linear-app-content-padding-y)'>
      <OutreachOverviewPanel />
      <InviteCampaignManager />
    </div>
  );
}

// Map URL view params to accordion indices
function viewToAccordionIndex(view?: string): number | null {
  if (!view) return null;
  switch (view) {
    case 'outreach':
    case 'campaigns':
    case 'ingest':
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
      <AccordionSection
        title='Tools'
        isOpen={openSections.has(0)}
        onToggle={() => toggle(0)}
      >
        {everOpened.has(0) && <ToolsContent />}
      </AccordionSection>

      <AccordionSection
        title='Advanced settings & actions'
        isOpen={openSections.has(1)}
        onToggle={() => toggle(1)}
      >
        {everOpened.has(1) && <AdvancedSettingsContent />}
      </AccordionSection>

      <AccordionSection
        title='Outreach, campaigns & insights'
        isOpen={openSections.has(2)}
        onToggle={() => toggle(2)}
      >
        <LazyOutreachCampaignsInsights hasOpened={everOpened.has(2)} />
      </AccordionSection>
    </div>
  );
}

function ToolsContent() {
  const UnifiedUrlIntake =
    require('@/features/admin/leads/UnifiedUrlIntake').UnifiedUrlIntake;
  const LeadKeywordsManager =
    require('@/features/admin/leads/LeadKeywordsManager').LeadKeywordsManager;

  return (
    <div className='space-y-4 px-(--linear-app-content-padding-x) py-(--linear-app-content-padding-y)'>
      <UnifiedUrlIntake />
      <LeadKeywordsManager />
    </div>
  );
}

function AdvancedSettingsContent() {
  const LeadPipelineControls =
    require('@/features/admin/leads/LeadPipelineControls').LeadPipelineControls;

  return (
    <div className='px-(--linear-app-content-padding-x) py-(--linear-app-content-padding-y)'>
      <p className='mb-3 text-[12px] font-[450] text-secondary-token'>
        These values are set automatically by the speed dial. Override here if
        needed.
      </p>
      <LeadPipelineControls hideMainSwitch />
    </div>
  );
}
