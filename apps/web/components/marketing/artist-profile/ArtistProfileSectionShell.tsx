// @coverage-via apps/web/tests/unit/marketing/component-registry.test.ts
import type { ReactNode, Ref } from 'react';
import type { MarketingPenContractId } from '@/data/marketing/penContracts';
import type { MarketingSectionId } from '@/data/marketing/sections';
import { cn } from '@/lib/utils';
import { MarketingContainer } from '../MarketingContainer';

const PAGE_CHROME_ALIGNED_CONTAINER_CLASS = 'ap-section-container !px-0';

interface ArtistProfileSectionShellProps {
  readonly id?: string;
  readonly sectionId?: MarketingSectionId;
  readonly sectionVariant?: string;
  readonly sectionOwner?: string;
  readonly sectionOccurrence?: string;
  readonly width?: 'landing' | 'page' | 'prose';
  readonly sectionRef?: Ref<HTMLElement>;
  readonly className?: string;
  readonly containerClassName?: string;
  readonly children: ReactNode;
  readonly penContractId?: MarketingPenContractId;
}

export function ArtistProfileSectionShell({
  id,
  sectionId,
  sectionVariant,
  sectionOwner,
  sectionOccurrence,
  width = 'page',
  sectionRef,
  className,
  containerClassName,
  children,
  penContractId,
}: Readonly<ArtistProfileSectionShellProps>) {
  return (
    <section
      ref={sectionRef}
      id={id}
      data-testid={sectionId ? `marketing-section-${sectionId}` : undefined}
      data-marketing-variant={sectionVariant}
      data-marketing-owner={sectionOwner}
      data-marketing-occurrence={sectionOccurrence}
      data-pen-contract={penContractId}
      className={cn(
        // Shared rhythm keeps every landing-page chapter on the same vertical
        // cadence while each section controls only its own surface treatment.
        'ap-section-shell frame-section relative py-20 sm:py-24 lg:py-28',
        className
      )}
    >
      <MarketingContainer
        width={width}
        className={cn(
          width === 'page' ? PAGE_CHROME_ALIGNED_CONTAINER_CLASS : null,
          containerClassName
        )}
      >
        {children}
      </MarketingContainer>
    </section>
  );
}
