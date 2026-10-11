'use client';

import Link from 'next/link';
import type { ReactNode } from 'react';
import {
  articleIdFromPathname,
  trackHelpCenterEvent,
} from '@/lib/help-analytics.mjs';

type TrackedGuideLinkProps = {
  readonly href: string;
  readonly sourceArticleId: string;
  readonly children: ReactNode;
};

/** Related-guide link that records selection with source context. */
export function TrackedGuideLink({
  href,
  sourceArticleId,
  children,
}: TrackedGuideLinkProps) {
  return (
    <Link
      href={href}
      onClick={() => {
        void trackHelpCenterEvent('related_guide_selected', {
          article_id: articleIdFromPathname(href) ?? undefined,
          source_article_id: sourceArticleId,
          source_surface: 'related_guides',
        });
      }}
    >
      {children}
    </Link>
  );
}
