'use client';

import { useTheme } from 'next-themes';
import type React from 'react';
import { Toaster } from 'sonner';

interface ToastProviderProps {
  readonly children: React.ReactNode;
}

/**
 * ToastProvider - World-class toast notification system powered by Sonner
 *
 * Features:
 * - Theme-aware (light/dark/system mode support)
 * - Rich toast types: success, error, info, warning, loading, promise
 * - Action buttons and custom actions
 * - Stacked notifications with expand on hover
 * - Accessible with ARIA live regions and focus-visible keyboard navigation
 * - Close button on all toasts
 *
 * Usage:
 * ```tsx
 * import { toast } from 'sonner';
 *
 * // Simple toasts
 * toast.success('Changes saved');
 * toast.error('Something went wrong');
 * toast.info('New update available');
 * toast.warning('Your session will expire soon');
 *
 * // Loading toast with promise
 * toast.promise(saveData(), {
 *   loading: 'Saving...',
 *   success: 'Saved!',
 *   error: 'Failed to save',
 * });
 *
 * // Toast with action
 * toast('Item deleted', {
 *   action: {
 *     label: 'Undo',
 *     onClick: () => restoreItem(),
 *   },
 * });
 *
 * // Custom duration
 * toast.success('Copied!', { duration: 2000 });
 * ```
 */
// Map resolved theme to Toaster theme
function getToasterTheme(
  resolvedTheme: string | undefined
): 'dark' | 'light' | 'system' {
  if (resolvedTheme === 'dark') return 'dark';
  if (resolvedTheme === 'light') return 'light';
  return 'system';
}

export function ToastProvider({ children }: ToastProviderProps) {
  const { resolvedTheme } = useTheme();

  return (
    <>
      {children}
      <Toaster
        theme={getToasterTheme(resolvedTheme)}
        position='bottom-right'
        // Expand stacked notifications on hover
        expand
        // Close button on every toast for accessibility
        closeButton
        // Gap between toasts
        gap={8}
        // Visual offset from edges
        offset={16}
        // Maximum visible toasts (stacked)
        visibleToasts={5}
        // Styling driven by CSS overrides in globals.css on
        // [data-sonner-toaster] / [data-sonner-toast] selectors.
        // Sonner CSS variables (--normal-bg, --success-bg, etc.) are
        // mapped to design-system tokens there, so we only need
        // lightweight classNames here for icon coloring.
        toastOptions={{
          classNames: {
            actionButton:
              'bg-btn-primary text-btn-primary-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2',
            cancelButton:
              'bg-surface-2 text-secondary-token hover:bg-surface-1 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2',
            success: '[&>svg]:text-success',
            error: '[&>svg]:text-error',
            warning: '[&>svg]:text-warning',
            info: '[&>svg]:text-info',
            loading: '[&>svg]:text-accent',
          },
        }}
      />
    </>
  );
}
