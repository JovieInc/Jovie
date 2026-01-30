'use client';

import {
  Button,
  Input,
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@jovie/ui';
import {
  type FormEvent,
  memo,
  useCallback,
  useEffect,
  useRef,
  useState,
} from 'react';
import { Icon } from '@/components/atoms/Icon';
import { PROVIDER_DOMAINS } from '@/lib/discography/provider-domains';
import type { ProviderKey, ReleaseViewModel } from '@/lib/discography/types';
import { cn } from '@/lib/utils';
import { getBaseUrl } from '@/lib/utils/platform-detection';

interface ProviderConfig {
  readonly label: string;
  readonly accent: string;
}

interface ProviderStatusDotProps {
  readonly status: 'available' | 'manual' | 'missing';
  readonly accent: string;
}

/**
 * ProviderStatusDot - Visual indicator for provider availability
 *
 * Statuses:
 * - available: Solid colored dot
 * - manual: Colored dot with warning ring
 * - missing: Gray outlined dot
 */
const ProviderStatusDot = memo(function ProviderStatusDot({
  status,
  accent,
}: ProviderStatusDotProps) {
  if (status === 'missing') {
    return (
      <span className='flex h-2.5 w-2.5 items-center justify-center rounded-full border border-subtle bg-surface-2'>
        <span className='h-1 w-1 rounded-full bg-tertiary-token' />
      </span>
    );
  }

  return (
    <span
      className={cn(
        'relative flex h-2.5 w-2.5 items-center justify-center rounded-full',
        status === 'manual' && 'ring-2 ring-amber-400/30'
      )}
      style={{ backgroundColor: accent }}
    >
      {status === 'manual' && (
        <span className='absolute -right-0.5 -top-0.5 h-1.5 w-1.5 rounded-full bg-(--color-warning)' />
      )}
    </span>
  );
});

interface AddProviderUrlPopoverProps {
  readonly providerLabel: string;
  readonly providerKey: ProviderKey;
  readonly accent: string;
  readonly onSave: (url: string) => Promise<void>;
  readonly isSaving?: boolean;
}

/**
 * AddProviderUrlPopover - Popover for manually adding provider URLs
 *
 * Features:
 * - Auto-focus input on open
 * - URL validation (valid URL + provider domain check)
 * - Loading state during save
 * - Error handling (parent component shows toast)
 */
function AddProviderUrlPopover({
  providerLabel,
  providerKey,
  accent,
  onSave,
  isSaving,
}: AddProviderUrlPopoverProps) {
  const [open, setOpen] = useState(false);
  const [url, setUrl] = useState('');
  const [validationError, setValidationError] = useState<string>('');
  const inputRef = useRef<HTMLInputElement>(null);
  const isSavingRef = useRef(false);

  const handleSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const trimmed = url.trim();
    if (!trimmed) return;

    // Validate URL format
    let parsedUrl: URL;
    try {
      parsedUrl = new URL(trimmed);
    } catch {
      setValidationError('Please enter a valid URL');
      return;
    }

    // Validate provider domain
    const allowedDomains = PROVIDER_DOMAINS[providerKey];
    const hostname = parsedUrl.hostname.toLowerCase();
    const isValidDomain = allowedDomains.some(
      domain => hostname === domain || hostname.endsWith(`.${domain}`)
    );

    if (!isValidDomain) {
      const domainMsg =
        allowedDomains.length === 1
          ? allowedDomains[0]
          : 'one of: ' + allowedDomains.join(', ');
      setValidationError(`URL must be from ${domainMsg}`);
      return;
    }

    // Clear validation error and proceed with save
    setValidationError('');
    if (isSavingRef.current) return;
    isSavingRef.current = true;
    try {
      await onSave(trimmed);
      setUrl('');
      setOpen(false);
    } catch {
      // Error toast is shown by the hook; keep popover open so user can retry
    } finally {
      isSavingRef.current = false;
    }
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type='button'
          className='group/add inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-xs text-tertiary-token transition-colors hover:bg-surface-2 hover:text-primary-token'
        >
          <Icon
            name='Plus'
            className='h-3.5 w-3.5 opacity-0 transition-opacity group-hover/add:opacity-100'
            aria-hidden='true'
          />
          <span className='line-clamp-1 text-tertiary-token/50 group-hover/add:hidden'>
            —
          </span>
          <span className='line-clamp-1 hidden group-hover/add:inline'>
            Add link
          </span>
        </button>
      </PopoverTrigger>
      <PopoverContent
        align='start'
        className='w-72 p-3'
        onOpenAutoFocus={e => {
          e.preventDefault();
          inputRef.current?.focus();
        }}
      >
        <form onSubmit={handleSubmit} className='space-y-3'>
          <div className='flex items-center gap-2'>
            <span
              className='h-2 w-2 shrink-0 rounded-full'
              style={{ backgroundColor: accent }}
              aria-hidden='true'
            />
            <span className='text-xs font-medium text-primary-token'>
              Add {providerLabel} link
            </span>
          </div>
          <div className='space-y-1'>
            <Input
              ref={inputRef}
              type='url'
              inputSize='sm'
              placeholder='Paste URL here...'
              value={url}
              onChange={e => {
                setUrl(e.target.value);
                setValidationError(''); // Clear error on change
              }}
              disabled={isSaving}
              autoComplete='off'
              className='text-xs'
            />
            {validationError && (
              <p className='text-xs text-(--color-error)'>{validationError}</p>
            )}
          </div>
          <div className='flex justify-end gap-2'>
            <Button
              type='button'
              variant='ghost'
              size='sm'
              onClick={() => {
                setUrl('');
                setOpen(false);
              }}
              className='text-xs'
            >
              Cancel
            </Button>
            <Button
              type='submit'
              variant='primary'
              size='sm'
              disabled={!url.trim() || isSaving}
              className='text-xs'
            >
              {isSaving ? 'Saving...' : 'Save'}
            </Button>
          </div>
        </form>
      </PopoverContent>
    </Popover>
  );
}

interface ProviderActionButtonsProps {
  readonly provider: { url: string; path?: string };
  readonly releaseTitle: string;
  readonly providerLabel: string;
  readonly testId: string;
  readonly isCopied: boolean;
  readonly onCopyClick: () => void;
}

function ProviderActionButtons({
  provider,
  releaseTitle,
  providerLabel,
  testId,
  isCopied,
  onCopyClick,
}: ProviderActionButtonsProps) {
  return (
    <div className='inline-flex items-center overflow-hidden rounded-md border border-subtle'>
      {/* Open button (left) */}
      <button
        type='button'
        title='Open'
        onClick={() => {
          window.open(provider.url, '_blank', 'noopener,noreferrer');
        }}
        className='inline-flex cursor-pointer items-center justify-center p-1.5 text-secondary-token transition-colors hover:bg-surface-2 hover:text-primary-token'
      >
        <Icon name='ExternalLink' className='h-3.5 w-3.5' aria-hidden='true' />
        <span className='sr-only'>Open</span>
      </button>

      {/* Divider */}
      <div className='h-4 w-px bg-subtle' />

      {/* Copy button (right) */}
      <button
        type='button'
        title={isCopied ? 'Copied' : 'Copy'}
        data-testid={testId}
        data-url={provider.path ? `${getBaseUrl()}${provider.path}` : undefined}
        onClick={onCopyClick}
        className={cn(
          'inline-flex cursor-pointer items-center justify-center p-1.5 text-secondary-token transition-colors hover:bg-surface-2 hover:text-primary-token',
          isCopied && 'text-green-600 hover:text-green-600 dark:text-green-400'
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
      </button>
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
      await onCopy(path, label, testId);
      setCopiedTestId(testId);

      // Clear existing timeout before setting a new one
      if (copyTimeoutRef.current) {
        clearTimeout(copyTimeoutRef.current);
      }
      copyTimeoutRef.current = setTimeout(() => setCopiedTestId(null), 2000);
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
          releaseTitle={release.title}
          providerLabel={config.label}
          testId={testId}
          isCopied={isCopied}
          onCopyClick={() => {
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
      <span className='inline-flex items-center gap-1.5 px-2 py-1 text-xs text-tertiary-token/50'>
        —
      </span>
    );
  };

  return (
    <div className='flex items-center gap-3'>
      <ProviderStatusDot status={status} accent={config.accent} />
      {renderProviderContent()}
    </div>
  );
});
