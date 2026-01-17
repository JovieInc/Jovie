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
  useCallback,
  useEffect,
  useRef,
  useState,
} from 'react';
import { Icon } from '@/components/atoms/Icon';
import type { ProviderKey, ReleaseViewModel } from '@/lib/discography/types';
import { cn } from '@/lib/utils';
import { getBaseUrl } from '@/lib/utils/platform-detection';

// Provider domain mapping for URL validation
const PROVIDER_DOMAINS: Record<ProviderKey, string[]> = {
  apple_music: ['music.apple.com', 'itunes.apple.com'],
  spotify: ['open.spotify.com', 'spotify.com'],
  youtube: ['music.youtube.com', 'youtube.com'],
  soundcloud: ['soundcloud.com'],
  deezer: ['deezer.com'],
  amazon_music: ['music.amazon.com', 'amazon.com'],
  tidal: ['tidal.com'],
  bandcamp: ['bandcamp.com'],
  beatport: ['beatport.com'],
};

interface ProviderConfig {
  label: string;
  accent: string;
}

interface ProviderStatusDotProps {
  status: 'available' | 'manual' | 'missing';
  accent: string;
}

/**
 * ProviderStatusDot - Visual indicator for provider availability
 *
 * Statuses:
 * - available: Solid colored dot
 * - manual: Colored dot with warning ring
 * - missing: Gray outlined dot
 */
function ProviderStatusDot({ status, accent }: ProviderStatusDotProps) {
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
}

interface AddProviderUrlPopoverProps {
  providerLabel: string;
  providerKey: ProviderKey;
  accent: string;
  onSave: (url: string) => Promise<void>;
  isSaving?: boolean;
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
      setValidationError(
        `URL must be from ${allowedDomains.length === 1 ? allowedDomains[0] : `one of: ${allowedDomains.join(', ')}`}`
      );
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
          <span className='line-clamp-1 group-hover/add:hidden'>Not found</span>
          <span className='line-clamp-1 hidden group-hover/add:inline'>
            Click to add
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

interface ProviderCellProps {
  release: ReleaseViewModel;
  provider: ProviderKey;
  config: ProviderConfig;
  onCopy: (path: string, label: string, testId: string) => Promise<string>;
  onAddUrl?: (
    releaseId: string,
    provider: ProviderKey,
    url: string
  ) => Promise<void>;
  isAddingUrl?: boolean;
}

/**
 * ProviderCell - Display and interact with provider links
 *
 * States:
 * - Available: Shows status dot + copy link button
 * - Manual: Shows status dot with warning + copy link button
 * - Missing: Shows status dot + "Add URL" popover trigger
 */
export function ProviderCell({
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
  const status = isManual ? 'manual' : available ? 'available' : 'missing';

  return (
    <div className='flex items-center gap-3'>
      <ProviderStatusDot status={status} accent={config.accent} />

      {available ? (
        <button
          type='button'
          data-testid={testId}
          data-url={
            provider?.path ? `${getBaseUrl()}${provider.path}` : undefined
          }
          onClick={() => {
            if (!provider?.path) return;
            handleCopyWithFeedback(
              provider.path,
              `${release.title} – ${config.label}`,
              testId
            ).catch(() => {});
          }}
          className={cn(
            'inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-xs text-secondary-token transition-colors hover:bg-surface-2 hover:text-primary-token',
            isCopied &&
              'text-green-600 hover:text-green-600 dark:text-green-400'
          )}
        >
          <Icon
            name={isCopied ? 'Check' : 'ExternalLink'}
            className='h-3.5 w-3.5'
            aria-hidden='true'
          />
          <span className='line-clamp-1'>
            {isCopied ? 'Copied' : 'Copy link'}
          </span>
        </button>
      ) : onAddUrl ? (
        <AddProviderUrlPopover
          providerLabel={config.label}
          providerKey={providerKey}
          accent={config.accent}
          onSave={handleAddUrl}
          isSaving={isAddingUrl}
        />
      ) : (
        <span className='inline-flex items-center gap-1.5 px-2 py-1 text-xs text-tertiary-token'>
          Not found
        </span>
      )}
    </div>
  );
}
