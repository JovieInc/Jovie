'use client';

import {
  type MouseEvent,
  memo,
  useCallback,
  useEffect,
  useRef,
  useState,
} from 'react';
import { APP_CONTROL_BUTTON_CLASS } from '@/components/atoms/AppIconButton';
import { Icon } from '@/components/atoms/Icon';
import { DrawerInlineIconButton } from '@/components/molecules/drawer';
import type { ProviderKey, ReleaseViewModel } from '@/lib/discography/types';
import { cn } from '@/lib/utils';
import { getBaseUrl } from '@/lib/utils/platform-detection';
import { AddProviderUrlPopover, ProviderStatusDot } from '../components';

interface ProviderConfig {
  label: string;
  readonly accent: string;
}

interface ProviderActionButtonsProps {
  readonly provider: { url: string; path?: string };
  readonly testId: string;
  readonly isCopied: boolean;
  readonly onCopyClick: (event: MouseEvent<HTMLButtonElement>) => void;
}

function ProviderActionButtons({
  provider,
  testId,
  isCopied,
  onCopyClick,
}: ProviderActionButtonsProps) {
  return (
    <div
      className={cn(
        APP_CONTROL_BUTTON_CLASS,
        'inline-flex h-7 gap-1 rounded-full px-1.5 py-0 text-secondary-token'
      )}
    >
      <DrawerInlineIconButton
        title='Open'
        onClick={event => {
          event.stopPropagation();
          globalThis.open(provider.url, '_blank', 'noopener,noreferrer');
        }}
        className='p-1 text-secondary-token'
      >
        <Icon name='ExternalLink' className='h-3.5 w-3.5' aria-hidden='true' />
        <span className='sr-only'>Open</span>
      </DrawerInlineIconButton>
      <DrawerInlineIconButton
        title={isCopied ? 'Copied' : 'Copy'}
        data-testid={testId}
        data-url={provider.path ? `${getBaseUrl()}${provider.path}` : undefined}
        onClick={onCopyClick}
        className={cn(
          'p-1 text-secondary-token',
          isCopied && 'text-success hover:text-success'
        )}
      >
        <span className='relative flex h-3.5 w-3.5 items-center justify-center'>
          <Icon
            name='Copy'
            className={`absolute h-3.5 w-3.5 transition-all duration-150 ${
              isCopied ? 'scale-50 opacity-0' : 'scale-100 opacity-100'
            }`}
            aria-hidden='true'
          />
          <Icon
            name='Check'
            className={`absolute h-3.5 w-3.5 transition-all duration-150 ${
              isCopied ? 'scale-100 opacity-100' : 'scale-50 opacity-0'
            }`}
            aria-hidden='true'
          />
        </span>
        <span className='sr-only'>{isCopied ? 'Copied' : 'Copy'}</span>
      </DrawerInlineIconButton>
    </div>
  );
}

interface ProviderCellProps {
  readonly release: ReleaseViewModel;
  readonly provider: ProviderKey;
  readonly config: ProviderConfig;
  readonly onCopy: (
    path: string,
    label: string,
    testId: string
  ) => Promise<string>;
  readonly onAddUrl?: (
    releaseId: string,
    provider: ProviderKey,
    url: string
  ) => Promise<void>;
  readonly isAddingUrl?: boolean;
}

/**
 * ProviderCell - Display and interact with provider links
 *
 * States:
 * - Available: Shows status dot + copy link button
 * - Manual: Shows status dot with warning + copy link button
 * - Missing: Shows status dot + "Add URL" popover trigger
 */
export const ProviderCell = memo(function ProviderCell({
  release,
  provider: providerKey,
  config,
  onCopy,
  onAddUrl,
  isAddingUrl,
}: ProviderCellProps) {
  const [copiedTestId, setCopiedTestId] = useState<string | null>(null);
  const copyTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Cleanup timeout on unmount
  useEffect(() => {
    return () => {
      if (copyTimeoutRef.current) {
        clearTimeout(copyTimeoutRef.current);
      }
    };
  }, []);

  const handleCopyWithFeedback = useCallback(
    async (path: string, label: string, testId: string) => {
      try {
        await onCopy(path, label, testId);
        setCopiedTestId(testId);

        // Clear existing timeout before setting a new one
        if (copyTimeoutRef.current) {
          clearTimeout(copyTimeoutRef.current);
        }
        copyTimeoutRef.current = setTimeout(() => setCopiedTestId(null), 2000);
      } catch {
        setCopiedTestId(null);
      }
    },
    [onCopy]
  );

  const handleAddUrl = useCallback(
    async (url: string) => {
      if (!onAddUrl) return;
      await onAddUrl(release.id, providerKey, url);
    },
    [onAddUrl, release.id, providerKey]
  );

  const provider = release.providers.find(item => item.key === providerKey);
  const available = Boolean(provider?.url);
  const isManual = provider?.source === 'manual';
  const testId = `provider-copy-${release.id}-${providerKey}`;
  const isCopied = copiedTestId === testId;

  // Determine provider status for visual indicator
  let status: 'available' | 'manual' | 'missing';
  if (isManual) {
    status = 'manual';
  } else if (available) {
    status = 'available';
  } else {
    status = 'missing';
  }

  const renderProviderContent = () => {
    if (available && provider?.url) {
      return (
        <ProviderActionButtons
          provider={{ url: provider.url, path: provider.path }}
          testId={testId}
          isCopied={isCopied}
          onCopyClick={event => {
            event.stopPropagation();
            if (!provider.path) return;
            handleCopyWithFeedback(
              provider.path,
              `${release.title} – ${config.label}`,
              testId
            ).catch(() => {});
          }}
        />
      );
    }

    if (onAddUrl) {
      return (
        <AddProviderUrlPopover
          providerLabel={config.label}
          providerKey={providerKey}
          accent={config.accent}
          onSave={handleAddUrl}
          isSaving={isAddingUrl}
        />
      );
    }

    return (
      <span className='inline-flex items-center gap-1.5 px-2 py-1 text-2xs text-tertiary-token'>
        —
      </span>
    );
  };

  return (
    <div className='flex items-center gap-2.5'>
      <ProviderStatusDot status={status} accent={config.accent} />
      {renderProviderContent()}
    </div>
  );
});
