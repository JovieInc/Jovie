'use client';

import { usePathname } from 'next/navigation';
import { useTheme } from 'next-themes';
import type React from 'react';
import { Toaster } from 'sonner';
import { useCookieBannerHeight } from '@/lib/hooks/useCookieBannerHeight';
import { isProfileRoute } from '@/lib/sentry/route-detector';
import { BannerViewport } from './BannerViewport';
import { TOAST_DURATIONS } from './toast';

interface FeedbackProviderProps {
  readonly children: React.ReactNode;
}

/**
 * FeedbackProvider — mounts Jovie's canonical feedback system.
 *
 * Two surfaces, one set of tokens and motion timing:
 * - **Toasts** (bottom-right, ephemeral 3–5s, max 3 visible, close
 *   button): action confirmations and errors. Fire via `toast.*` from
 *   `@/components/feedback`.
 * - **Banners** (top, persistent until dismissed): system status and
 *   announcements. Fire via `banner.*` from `@/components/feedback`.
 *
 * Toast visuals are driven by design-system tokens through the
 * `[data-sonner-toaster]` / `[data-sonner-toast]` overrides in
 * `globals.css` (success green, error red, info blue left-border
 * accents). Do not mount a second Toaster or BannerViewport.
 */
// Map resolved theme to Toaster theme
function getToasterTheme(
  resolvedTheme: string | undefined
): 'dark' | 'light' | 'system' {
  if (resolvedTheme === 'dark') return 'dark';
  if (resolvedTheme === 'light') return 'light';
  return 'system';
}

export function FeedbackProvider({ children }: FeedbackProviderProps) {
  const { resolvedTheme } = useTheme();
  const bottomOffset = useCookieBannerHeight();
  const pathname = usePathname() ?? '';

  // Public profile pages are visitor-facing surfaces — suppress all app
  // feedback chrome (PWA install, error copy, etc.) to keep them clean.
  if (isProfileRoute(pathname)) {
    return <>{children}</>;
  }

  return (
    <>
      {children}
      <BannerViewport />
      <Toaster
        theme={getToasterTheme(resolvedTheme)}
        position='bottom-right'
        // Expand stacked notifications on hover
        expand
        // Manual close affordance on every toast (accessibility)
        closeButton
        // Keep transient feedback quiet and secondary to primary workflows
        richColors={false}
        // Gap between toasts
        gap={8}
        // Dynamic offset: floats toasts above the cookie banner when
        // visible, and always respects the device safe-area inset.
        offset={`calc(${bottomOffset}px + env(safe-area-inset-bottom, 0px))`}
        // Stack limit: max 3 visible toasts; overflow queues
        visibleToasts={3}
        // Styling driven by CSS overrides in globals.css on
        // [data-sonner-toaster] / [data-sonner-toast] selectors.
        // Sonner CSS variables (--normal-bg, --success-bg, etc.) are
        // mapped to design-system tokens there, so we only need
        // lightweight classNames here for icon coloring.
        toastOptions={{
          // Canonical auto-dismiss default (4s, within the 3–5s window).
          // Per-call durations (e.g. useNotifications presets) still win.
          duration: TOAST_DURATIONS.DEFAULT,
          classNames: {
            toast: 'items-start border border-subtle bg-surface-1 shadow-card',
            title: 'font-medium text-secondary-token',
            description: 'font-normal text-tertiary-token',
            actionButton:
              'border border-default bg-transparent text-primary-token font-medium hover:bg-surface-1 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2',
            cancelButton:
              'bg-surface-2 text-secondary-token font-medium hover:bg-surface-1 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2',
            success: '[&>svg]:text-tertiary-token',
            error: '[&>svg]:text-tertiary-token',
            warning: '[&>svg]:text-tertiary-token',
            info: '[&>svg]:text-tertiary-token',
            loading: '[&>svg]:text-tertiary-token',
          },
        }}
      />
    </>
  );
}
