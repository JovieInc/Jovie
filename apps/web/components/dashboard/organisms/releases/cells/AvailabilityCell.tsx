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
  useMemo,
  useRef,
  useState,
} from 'react';
import { Icon } from '@/components/atoms/Icon';
import { DspProviderIcon } from '@/components/dashboard/atoms/DspProviderIcon';
import type { ProviderKey, ReleaseViewModel } from '@/lib/discography/types';
import type { DspProviderId } from '@/lib/dsp-enrichment/types';
import { cn } from '@/lib/utils';

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

// Maps ProviderKey to DspProviderId for icons
const PROVIDER_TO_DSP: Record<ProviderKey, DspProviderId | null> = {
  spotify: 'spotify',
  apple_music: 'apple_music',
  youtube: 'youtube_music',
  soundcloud: 'soundcloud',
  deezer: 'deezer',
  tidal: 'tidal',
  amazon_music: 'amazon_music',
  bandcamp: null,
  beatport: null,
};

interface ProviderConfig {
  label: string;
  accent: string;
}

interface AvailabilityCellProps {
  release: ReleaseViewModel;
  allProviders: ProviderKey[];
  providerConfig: Record<ProviderKey, ProviderConfig>;
  onCopy: (path: string, label: string, testId: string) => Promise<string>;
  onAddUrl?: (
    releaseId: string,
    provider: ProviderKey,
    url: string
  ) => Promise<void>;
  isAddingUrl?: boolean;
}

/**
 * AvailabilityCell - Consolidated provider availability display
 *
 * Shows a compact summary of available providers with a popover
 * containing full details and actions for all providers.
 */
export const AvailabilityCell = memo(function AvailabilityCell({
  release,
  allProviders,
  providerConfig,
  onCopy,
  onAddUrl,
  isAddingUrl,
}: AvailabilityCellProps) {
  const [open, setOpen] = useState(false);
  const [copiedTestId, setCopiedTestId] = useState<string | null>(null);
  const [addingProvider, setAddingProvider] = useState<ProviderKey | null>(
    null
  );
  const [urlInput, setUrlInput] = useState('');
  const [validationError, setValidationError] = useState('');
  const copyTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Create provider Map for O(1) lookups instead of O(n) .find() operations
  const providerMap = useMemo(() => {
    const map = new Map<ProviderKey, (typeof release.providers)[number]>();
    for (const provider of release.providers) {
      map.set(provider.key, provider);
    }
    return map;
  }, [release.providers]);

  // Count available providers
  const availableCount = release.providers.filter(p => p.url).length;
  const totalCount = allProviders.length;

  // Memoize sliced providers for compact display
  const compactProviders = useMemo(
    () => allProviders.slice(0, 4),
    [allProviders]
  );

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
      } catch {
        // Still show brief feedback even on failure
        setCopiedTestId(testId);
      } finally {
        if (copyTimeoutRef.current) {
          clearTimeout(copyTimeoutRef.current);
        }
        copyTimeoutRef.current = setTimeout(() => setCopiedTestId(null), 2000);
      }
    },
    [onCopy]
  );

  const handleAddUrl = useCallback(
    async (e: FormEvent<HTMLFormElement>) => {
      e.preventDefault();
      if (!addingProvider || !onAddUrl) return;

      const trimmed = urlInput.trim();
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
      const allowedDomains = PROVIDER_DOMAINS[addingProvider];
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

      setValidationError('');
      try {
        await onAddUrl(release.id, addingProvider, trimmed);
        setUrlInput('');
        setAddingProvider(null);
      } catch {
        // Error toast is shown by parent
      }
    },
    [addingProvider, onAddUrl, release.id, urlInput]
  );

  // Get status for a provider
  const getProviderStatus = useCallback(
    (providerKey: ProviderKey) => {
      const provider = providerMap.get(providerKey);
      if (!provider?.url) return 'missing';
      return provider.source === 'manual' ? 'manual' : 'available';
    },
    [providerMap]
  );

  // Create copy handler for a specific provider (extracted to reduce nesting depth)
  const createCopyHandler = useCallback(
    (providerKey: ProviderKey, testId: string) => {
      return () => {
        const provider = providerMap.get(providerKey);
        if (provider?.path) {
          const config = providerConfig[providerKey];
          void handleCopyWithFeedback(
            provider.path,
            `${release.title} – ${config.label}`,
            testId
          );
        }
      };
    },
    [providerMap, providerConfig, release.title, handleCopyWithFeedback]
  );

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type='button'
          aria-label='Show provider availability details'
          aria-haspopup='dialog'
          aria-expanded={open}
          className='inline-flex items-center gap-2 rounded-md px-2 py-1 text-xs transition-colors hover:bg-surface-2'
        >
          {/* Compact provider icons */}
          <div className='flex -space-x-1'>
            {compactProviders.map(providerKey => {
              const status = getProviderStatus(providerKey);
              const dspId = PROVIDER_TO_DSP[providerKey];
              const config = providerConfig[providerKey];

              return (
                <div
                  key={providerKey}
                  className={cn(
                    'relative flex h-5 w-5 items-center justify-center rounded-full border-2 border-surface-1',
                    status === 'missing' ? 'bg-surface-2' : 'bg-surface-1'
                  )}
                >
                  {dspId ? (
                    <DspProviderIcon
                      provider={dspId}
                      size='sm'
                      className={cn(status === 'missing' && 'opacity-30')}
                    />
                  ) : (
                    <span
                      className={cn(
                        'h-2.5 w-2.5 rounded-full',
                        status === 'missing' && 'opacity-30'
                      )}
                      style={{ backgroundColor: config.accent }}
                    />
                  )}
                  {status === 'manual' && (
                    <span className='absolute -right-0.5 -top-0.5 h-1.5 w-1.5 rounded-full bg-(--color-warning)' />
                  )}
                </div>
              );
            })}
          </div>

          {/* Summary text */}
          <span className='text-secondary-token'>
            {availableCount}/{totalCount}
          </span>
          <Icon
            name='ChevronDown'
            className='h-3 w-3 text-tertiary-token'
            aria-hidden='true'
          />
        </button>
      </PopoverTrigger>

      <PopoverContent align='start' className='w-80 p-0'>
        <div className='border-b border-subtle px-3 py-2'>
          <p className='text-xs font-medium text-primary-token'>
            Platform Availability
          </p>
          <p className='text-xs text-secondary-token'>
            {availableCount} of {totalCount} platforms linked
          </p>
        </div>

        <div className='max-h-64 overflow-y-auto'>
          {allProviders.map(providerKey => {
            const provider = providerMap.get(providerKey);
            const config = providerConfig[providerKey];
            const dspId = PROVIDER_TO_DSP[providerKey];
            const status = getProviderStatus(providerKey);
            const testId = `provider-copy-${release.id}-${providerKey}`;
            const isCopied = copiedTestId === testId;
            const isAdding = addingProvider === providerKey;

            return (
              <div
                key={providerKey}
                className='flex items-center justify-between border-b border-subtle px-3 py-2 last:border-b-0'
              >
                <div className='flex items-center gap-2'>
                  {/* Status dot */}
                  {status === 'missing' ? (
                    <span className='flex h-2.5 w-2.5 items-center justify-center rounded-full border border-subtle bg-surface-2'>
                      <span className='h-1 w-1 rounded-full bg-tertiary-token' />
                    </span>
                  ) : (
                    <span
                      className={cn(
                        'relative h-2.5 w-2.5 rounded-full',
                        status === 'manual' && 'ring-2 ring-amber-400/30'
                      )}
                      style={{ backgroundColor: config.accent }}
                    >
                      {status === 'manual' && (
                        <span className='absolute -right-0.5 -top-0.5 h-1.5 w-1.5 rounded-full bg-(--color-warning)' />
                      )}
                    </span>
                  )}

                  {/* Provider icon + name */}
                  {dspId ? (
                    <DspProviderIcon provider={dspId} size='sm' />
                  ) : (
                    <span
                      className='h-4 w-4 rounded-full'
                      style={{ backgroundColor: config.accent }}
                    />
                  )}
                  <span className='text-xs text-primary-token'>
                    {config.label}
                  </span>
                </div>

                {/* Actions */}
                {(() => {
                  if (provider?.url) {
                    return (
                      <div className='flex items-center gap-1'>
                        <button
                          type='button'
                          aria-label={`Open ${config.label} in new tab`}
                          onClick={() =>
                            window.open(
                              provider.url,
                              '_blank',
                              'noopener,noreferrer'
                            )
                          }
                          className='rounded p-1 text-secondary-token hover:bg-surface-2 hover:text-primary-token focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary'
                        >
                          <Icon
                            name='ExternalLink'
                            className='h-4 w-4'
                            aria-hidden='true'
                          />
                        </button>
                        <button
                          type='button'
                          aria-label={
                            isCopied
                              ? `Copied ${config.label} link`
                              : `Copy ${config.label} link`
                          }
                          onClick={createCopyHandler(providerKey, testId)}
                          className={cn(
                            'rounded p-1 text-secondary-token hover:bg-surface-2 hover:text-primary-token focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary',
                            isCopied && 'text-green-600 dark:text-green-400'
                          )}
                        >
                          <Icon
                            name={isCopied ? 'Check' : 'Copy'}
                            className='h-4 w-4'
                            aria-hidden='true'
                          />
                        </button>
                      </div>
                    );
                  }

                  if (isAdding) {
                    return (
                      <form
                        onSubmit={handleAddUrl}
                        className='flex items-center gap-1'
                      >
                        <Input
                          ref={inputRef}
                          type='url'
                          inputSize='sm'
                          placeholder='Paste URL...'
                          value={urlInput}
                          onChange={e => {
                            setUrlInput(e.target.value);
                            setValidationError('');
                          }}
                          disabled={isAddingUrl}
                          className='h-6 w-32 text-xs'
                          autoFocus
                        />
                        <Button
                          type='submit'
                          variant='ghost'
                          size='sm'
                          aria-label='Confirm URL'
                          disabled={!urlInput.trim() || isAddingUrl}
                          className='h-6 px-1.5'
                        >
                          <Icon
                            name='Check'
                            className='h-4 w-4'
                            aria-hidden='true'
                          />
                        </Button>
                        <Button
                          type='button'
                          variant='ghost'
                          size='sm'
                          aria-label='Cancel adding URL'
                          onClick={() => {
                            setAddingProvider(null);
                            setUrlInput('');
                            setValidationError('');
                          }}
                          className='h-6 px-1.5'
                        >
                          <Icon
                            name='X'
                            className='h-4 w-4'
                            aria-hidden='true'
                          />
                        </Button>
                      </form>
                    );
                  }

                  if (onAddUrl) {
                    return (
                      <button
                        type='button'
                        onClick={() => setAddingProvider(providerKey)}
                        className='text-xs text-tertiary-token hover:text-primary-token'
                      >
                        + Add link
                      </button>
                    );
                  }

                  return <span className='text-xs text-tertiary-token'>—</span>;
                })()}
              </div>
            );
          })}
        </div>

        {validationError && (
          <div className='border-t border-subtle px-3 py-2'>
            <p className='text-xs text-(--color-error)'>{validationError}</p>
          </div>
        )}
      </PopoverContent>
    </Popover>
  );
});
