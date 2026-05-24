import type { ReactNode, Ref } from 'react';
import { MarketingContainer } from '@/components/marketing';
import { cn } from '@/lib/utils';

const PAGE_CHROME_ALIGNED_CONTAINER_CLASS =
  '!max-w-[var(--linear-content-max)] !px-5 sm:!px-6 lg:!px-0';

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
      className={cn(
        // Inside .frame-skin, padding + hairline divider come from the
        // .frame-section utility (declared in home.css). Outside frame-skin
        // we keep the previous SaaS-rhythm padding so other surfaces are
        // unaffected by this redesign.
        'frame-section relative py-20 sm:py-24 lg:py-28',
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
