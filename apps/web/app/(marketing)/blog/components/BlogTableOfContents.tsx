import { PublicTableOfContents } from '@/components/molecules/PublicTableOfContents';
import type { TocEntry } from '@/types/docs';

export interface BlogTableOfContentsProps {
  readonly toc: TocEntry[];
}

export function BlogTableOfContents({ toc }: BlogTableOfContentsProps) {
  return (
    <PublicTableOfContents
      toc={toc}
      stickyClassName='max-lg:hidden lg:sticky lg:top-24 lg:self-start'
      trackActiveHeading
    />
  );
}
