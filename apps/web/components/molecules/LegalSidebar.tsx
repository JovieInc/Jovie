import { PublicTableOfContents } from '@/components/molecules/PublicTableOfContents';
import { cn } from '@/lib/utils';
import type { TocEntry } from '@/types/docs';

export interface LegalSidebarProps {
  readonly toc: TocEntry[];
  readonly className?: string;
}

export function LegalSidebar({ toc, className }: LegalSidebarProps) {
  return (
    <PublicTableOfContents
      toc={toc}
      ariaLabel='Document navigation'
      className={cn('space-y-1', className)}
    />
  );
}
