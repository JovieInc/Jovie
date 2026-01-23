'use client';

/**
 * Reusable clipboard hook with modern API support and fallback.
 * Reduces duplicated clipboard logic across components.
 */

import { useCallback, useEffect, useRef, useState } from 'react';

export type ClipboardStatus = 'idle' | 'success' | 'error';

export interface UseClipboardOptions {
  /** Duration in ms to show success/error status before returning to idle (default: 2000) */
  resetDelay?: number;
  /** Callback when copy succeeds */
  onSuccess?: () => void;
  /** Callback when copy fails */
  onError?: (error: Error) => void;
}

export interface UseClipboardReturn {
  /** Current status of the clipboard operation */
  status: ClipboardStatus;
  /** Whether a copy operation is currently in progress */
  isCopying: boolean;
  /** Whether the last copy was successful */
  isSuccess: boolean;
  /** Whether the last copy failed */
  isError: boolean;
  /** Copy text to clipboard */
  copy: (text: string) => Promise<boolean>;
  /** Reset status to idle */
  reset: () => void;
}

/**
 * Fallback copy method using textarea selection.
 * Used when Clipboard API is not available.
 */
function fallbackCopy(text: string): boolean {
  try {
    const textarea = document.createElement('textarea');
    textarea.value = text;
    textarea.style.position = 'fixed';
    textarea.style.left = '-999999px';
    textarea.style.top = '-999999px';
    textarea.style.opacity = '0';
    document.body.appendChild(textarea);

    textarea.focus();
    textarea.select();
    const successful = document.execCommand('copy');

    textarea.remove();
    return successful;
  } catch {
    return false;
  }
}

/**
 * Hook for copying text to clipboard with status management.
 *
 * @example
 * ```tsx
 * const { copy, status, isSuccess } = useClipboard();
 *
 * return (
 *   <button onClick={() => copy('Hello!')}>
 *     {isSuccess ? 'Copied!' : 'Copy'}
 *   </button>
 * );
 * ```
 */
export function useClipboard(
  options: UseClipboardOptions = {}
): UseClipboardReturn {
  const { resetDelay = 2000, onSuccess, onError } = options;

  const [status, setStatus] = useState<ClipboardStatus>('idle');
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Cleanup timeout on unmount
  useEffect(() => {
    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
    };
  }, []);

  const reset = useCallback(() => {
    setStatus('idle');
  }, []);

  const copy = useCallback(
    async (text: string): Promise<boolean> => {
      let success = false;
      let lastError: Error | null = null;

      try {
        // Try modern Clipboard API first
        if (navigator.clipboard && navigator.clipboard.writeText) {
          await navigator.clipboard.writeText(text);
          success = true;
        } else {
          // Fall back to textarea selection method
          success = fallbackCopy(text);
        }
      } catch (error) {
        lastError =
          error instanceof Error ? error : new Error('Copy failed (clipboard)');
        // Try fallback if modern API failed
        try {
          success = fallbackCopy(text);
        } catch {
          success = false;
        }
      }

      if (success) {
        setStatus('success');
        onSuccess?.();
      } else {
        setStatus('error');
        if (onError) {
          onError(lastError ?? new Error('Copy failed'));
        } else {
          console.error('Failed to copy to clipboard');
        }
      }

      // Reset status after delay
      if (resetDelay > 0) {
        if (timeoutRef.current) {
          clearTimeout(timeoutRef.current);
        }
        timeoutRef.current = setTimeout(() => setStatus('idle'), resetDelay);
      }

      return success;
    },
    [resetDelay, onSuccess, onError]
  );

  return {
    status,
    isCopying: false, // Async operation is fast enough that we don't track "copying" state
    isSuccess: status === 'success',
    isError: status === 'error',
    copy,
    reset,
  };
}

/**
 * Utility function for one-off clipboard copy without React state.
 * Use this when you don't need to track status in UI.
 *
 * @example
 * ```ts
 * const success = await copyToClipboard('Hello!');
 * if (success) {
 *   toast.success('Copied!');
 * }
 * ```
 */
export async function copyToClipboard(text: string): Promise<boolean> {
  try {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      await navigator.clipboard.writeText(text);
      return true;
    }
    return fallbackCopy(text);
  } catch {
    try {
      return fallbackCopy(text);
    } catch {
      return false;
    }
  }
}
