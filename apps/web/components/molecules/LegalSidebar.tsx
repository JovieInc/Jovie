import { PublicTableOfContents } from '@/components/molecules/PublicTableOfContents';
import type { TocEntry } from '@/types/docs';

export interface LegalSidebarProps {
  readonly toc: TocEntry[];
}

export function LegalSidebar({ toc }: LegalSidebarProps) {
  return (
    <PublicTableOfContents
      toc={toc}
      ariaLabel='Document navigation'
      className='space-y-1'
    />
  );
}
