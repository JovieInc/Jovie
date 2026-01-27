'use client';

import { Button } from '@jovie/ui';
import { Icon } from '@/components/atoms/Icon';
import { PROFILE_URL } from '@/constants/domains';
import { useClipboard } from '@/hooks/useClipboard';

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

function getButtonLabel(
  isSuccess: boolean,
  isError: boolean,
  successLabel: string,
  errorLabel: string,
  idleLabel: string
): string {
  if (isSuccess) return successLabel;
  if (isError) return errorLabel;
  return idleLabel;
}

function getButtonIcon(
  isSuccess: boolean,
  isError: boolean,
  iconName?: string
): string | undefined {
  if (isSuccess) return 'Check';
  if (isError) return 'X';
  return iconName;
}

function getStatusMessage(status: 'idle' | 'success' | 'error'): string {
  if (status === 'success') return 'Profile URL copied to clipboard';
  if (status === 'error') return 'Failed to copy profile URL';
  return '';
}

export function CopyToClipboardButton({
  relativePath,
  idleLabel = 'Copy URL',
  successLabel = 'Copied!',
  errorLabel = 'Failed to copy',
  className,
  iconName,
  onCopySuccess,
  onCopyError,
}: CopyToClipboardButtonProps) {
  const { copy, status, isSuccess, isError } = useClipboard({
    onSuccess: onCopySuccess,
    onError: onCopyError,
  });

  const handleCopy = () => {
    // Profile URLs should always use PROFILE_URL to ensure correct domain
    const url = `${PROFILE_URL}${relativePath}`;
    copy(url);
  };

  const currentLabel = getButtonLabel(
    isSuccess,
    isError,
    successLabel,
    errorLabel,
    idleLabel
  );
  const currentIcon = getButtonIcon(isSuccess, isError, iconName);

  return (
    <div className='relative'>
      <Button
        variant='secondary'
        size='sm'
        onClick={handleCopy}
        className={className}
      >
        {iconName ? (
          <>
            <Icon
              name={currentIcon ?? iconName}
              className='h-4 w-4'
              aria-hidden='true'
            />
            <span className='sr-only'>{currentLabel}</span>
          </>
        ) : (
          currentLabel
        )}
      </Button>

      {/* NOSONAR S6819: role="status" is correct for live announcements; <output> is for form results */}
      <span className='sr-only' aria-live='polite' role='status'>
        {getStatusMessage(status)}
      </span>
    </div>
  );
}
