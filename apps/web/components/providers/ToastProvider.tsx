'use client';

import { useTheme } from 'next-themes';
import type React from 'react';
import { Toaster } from 'sonner';

interface ToastProviderProps {
  children: React.ReactNode;
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
export function ToastProvider({ children }: ToastProviderProps) {
  const { resolvedTheme } = useTheme();

  return (
    <>
      {children}
      <Toaster
        theme={
          resolvedTheme === 'dark'
            ? 'dark'
            : resolvedTheme === 'light'
              ? 'light'
              : 'system'
        }
        position='bottom-right'
        // Expand stacked notifications on hover
        expand
        richColors
        // Close button on every toast for accessibility
        closeButton
        // Gap between toasts
        gap={8}
        // Visual offset from edges
        offset={16}
        // Maximum visible toasts (stacked)
        visibleToasts={5}
        // Custom styling to match design system
        toastOptions={{
          // Base styles for all toasts
          className: 'font-sans',
          style: {
            // Use CSS custom properties for theme integration
            fontFamily: 'var(--font-geist-sans), system-ui, sans-serif',
          },
          classNames: {
            toast:
              'group border-subtle bg-surface-0/95 backdrop-blur-sm shadow-lg',
            title: 'text-primary-token font-medium',
            description: 'text-secondary-token text-sm',
            actionButton:
              'bg-accent text-white font-medium hover:opacity-90 transition-opacity focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2',
            cancelButton:
              'bg-surface-1 text-secondary-token font-medium hover:bg-surface-2 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2',
            closeButton:
              'bg-surface-1 border-subtle text-secondary-token hover:bg-surface-2 hover:text-primary-token transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2',
            // Type-specific styles
            success:
              'border-emerald-500/30 dark:border-emerald-400/30 [&>svg]:text-emerald-600 dark:[&>svg]:text-emerald-400',
            error:
              'border-red-500/30 dark:border-red-400/30 [&>svg]:text-red-600 dark:[&>svg]:text-red-400',
            warning:
              'border-amber-500/30 dark:border-amber-400/30 [&>svg]:text-amber-600 dark:[&>svg]:text-amber-400',
            info: 'border-sky-500/30 dark:border-sky-400/30 [&>svg]:text-sky-600 dark:[&>svg]:text-sky-400',
            loading:
              'border-violet-500/30 dark:border-violet-400/30 [&>svg]:text-violet-600 dark:[&>svg]:text-violet-400',
          },
          // Type-specific durations
          // Success: short (users just need confirmation)
          // Error: longer (users need time to read and potentially take action)
          // Warning: medium (important but not critical)
          // Info: standard
        }}
      />
    </>
  );
}
