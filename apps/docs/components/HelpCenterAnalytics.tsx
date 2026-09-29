'use client';

import { usePathname } from 'next/navigation';
import { useEffect, useRef } from 'react';
import {
  articleIdFromPathname,
  categoryIdForPathname,
  trackHelpCenterEvent,
} from '@/lib/help-analytics.mjs';

/**
 * Fires help_center_viewed once per session and article_viewed /
 * category_opened per canonical docs route. Mounted in the root layout so
 * every MDX page is covered without per-page wiring. Never throws.
 */
export function HelpCenterAnalytics() {
  const pathname = usePathname();
  const viewedRef = useRef(false);
  const openedCategoriesRef = useRef(new Set<string>());

  useEffect(() => {
    if (!viewedRef.current) {
      viewedRef.current = true;
      void trackHelpCenterEvent('help_center_viewed', {
        source_surface: pathname === '/' ? 'help_center_home' : 'article',
      });
    }

    const articleId = articleIdFromPathname(pathname);
    if (articleId) {
      const categoryId = categoryIdForPathname(pathname);
      void trackHelpCenterEvent('article_viewed', {
        article_id: articleId,
        category_id: categoryId ?? undefined,
        source_surface: pathname === '/docs' ? 'help_center_home' : 'article',
      });
      if (categoryId && !openedCategoriesRef.current.has(categoryId)) {
        openedCategoriesRef.current.add(categoryId);
        void trackHelpCenterEvent('category_opened', {
          category_id: categoryId,
          article_id: articleId,
          source_surface: 'article',
        });
      }
    }
  }, [pathname]);

  return null;
}
