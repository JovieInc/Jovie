import type { ReactNode, Ref } from 'react';
import { MarketingContainer } from '@/components/marketing';
import { cn } from '@/lib/utils';

interface ArtistProfileSectionShellProps {
  readonly id?: string;
  readonly width?: 'landing' | 'page' | 'prose';
  readonly sectionRef?: Ref<HTMLElement>;
  readonly className?: string;
  readonly containerClassName?: string;
  readonly children: ReactNode;
}

export function ArtistProfileSectionShell({
  id,
  width = 'page',
  sectionRef,
  className,
  containerClassName,
  children,
}: Readonly<ArtistProfileSectionShellProps>) {
  return (
    <section
      ref={sectionRef}
      id={id}
      className={cn('relative py-20 sm:py-24 lg:py-28', className)}
    >
      <MarketingContainer width={width} className={containerClassName}>
        {children}
      </MarketingContainer>
    </section>
  );
}
