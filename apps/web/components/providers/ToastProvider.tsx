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
            fontFamily: 'var(--font-sans), system-ui, sans-serif',
          },
          classNames: {
            toast:
              'group bg-surface-3 border border-default rounded-xl shadow-lg',
            title: 'text-primary-token font-medium',
            description: 'text-tertiary-token text-sm',
            actionButton:
              'bg-btn-primary text-btn-primary-foreground font-medium hover:opacity-90 transition-opacity focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2',
            cancelButton:
              'bg-surface-2 text-secondary-token font-medium hover:bg-surface-1 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2',
            closeButton:
              'bg-surface-2 border-subtle text-tertiary-token hover:bg-surface-1 hover:text-primary-token transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2',
            // Type-specific styles using design tokens
            success: 'border-success [&>svg]:text-success',
            error: 'border-error [&>svg]:text-error',
            warning: 'border-warning [&>svg]:text-warning',
            info: 'border-info [&>svg]:text-info',
            loading: 'border-accent [&>svg]:text-accent',
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
