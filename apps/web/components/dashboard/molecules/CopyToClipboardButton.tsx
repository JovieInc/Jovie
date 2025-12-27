'use client';

import { Button } from '@jovie/ui';
import { useState } from 'react';
import { Icon } from '@/components/atoms/Icon';
import { cn } from '@/lib/utils';
import { getBaseUrl } from '@/lib/utils/platform-detection';

type CopyStatus = 'idle' | 'success' | 'error';

export interface CopyToClipboardButtonProps {
  relativePath: string; // e.g. '/artist-handle'
  idleLabel?: string;
  successLabel?: string;
  errorLabel?: string;
  className?: string;
  iconName?: string;
  onCopySuccess?: () => void;
  onCopyError?: () => void;
}

export function CopyToClipboardButton({
  relativePath,
  idleLabel = 'Copy URL',
  successLabel = '✓ Copied!',
  errorLabel = 'Failed to copy',
  className,
  iconName,
  onCopySuccess,
  onCopyError,
}: CopyToClipboardButtonProps) {
  const [status, setStatus] = useState<CopyStatus>('idle');

  const fallbackCopy = (text: string): boolean => {
    try {
      // Create a temporary textarea element
      const textarea = document.createElement('textarea');
      textarea.value = text;
      textarea.style.position = 'fixed';
      textarea.style.left = '-999999px';
      textarea.style.top = '-999999px';
      document.body.appendChild(textarea);

      // Select and copy the text
      textarea.focus();
      textarea.select();
      const successful = document.execCommand('copy');

      // Clean up
      document.body.removeChild(textarea);

      return successful;
    } catch (error) {
      console.error('Fallback copy failed:', error);
      return false;
    }
  };

  const onCopy = async () => {
    const url = `${getBaseUrl()}${relativePath}`;
    let copySuccess = false;

    try {
      // Try modern clipboard API first
      if (navigator.clipboard && navigator.clipboard.writeText) {
        await navigator.clipboard.writeText(url);
        copySuccess = true;
      } else {
        // Fall back to textarea selection method
        copySuccess = fallbackCopy(url);
      }

      if (copySuccess) {
        setStatus('success');
        onCopySuccess?.();
      } else {
        setStatus('error');
        onCopyError?.();
      }
    } catch (error) {
      console.error('Failed to copy URL:', error);

      // Try fallback method if modern API failed
      try {
        copySuccess = fallbackCopy(url);

        if (copySuccess) {
          setStatus('success');
          onCopySuccess?.();
        } else {
          setStatus('error');
          onCopyError?.();
        }
      } catch (fallbackError) {
        console.error('Both copy methods failed:', fallbackError);
        setStatus('error');
        onCopyError?.();
      }
    } finally {
      setTimeout(() => setStatus('idle'), 2000);
    }
  };

  // Build status-based styling for visual feedback
  const statusStyles = cn(
    // Base transition for smooth color changes
    'transition-colors duration-200',
    // Success state: green background and text
    status === 'success' &&
      'bg-emerald-500/10 text-emerald-600 hover:bg-emerald-500/20 dark:text-emerald-200',
    // Error state: red background and text
    status === 'error' &&
      'bg-red-500/10 text-red-600 hover:bg-red-500/20 dark:text-red-200',
    // User-provided className
    className
  );

  return (
    <div className='relative'>
      <Button
        variant='secondary'
        size='sm'
        onClick={onCopy}
        className={statusStyles}
        data-status={status}
      >
        {iconName ? (
          <>
            <Icon
              name={
                status === 'success'
                  ? 'Check'
                  : status === 'error'
                    ? 'X'
                    : iconName
              }
              className='h-4 w-4'
              aria-hidden='true'
            />
            <span className='sr-only'>
              {status === 'success'
                ? successLabel
                : status === 'error'
                  ? errorLabel
                  : idleLabel}
            </span>
          </>
        ) : status === 'success' ? (
          successLabel
        ) : status === 'error' ? (
          errorLabel
        ) : (
          idleLabel
        )}
      </Button>
      <span className='sr-only' aria-live='polite' role='status'>
        {status === 'success'
          ? 'Profile URL copied to clipboard'
          : status === 'error'
            ? 'Failed to copy profile URL'
            : ''}
      </span>
    </div>
  );
}
