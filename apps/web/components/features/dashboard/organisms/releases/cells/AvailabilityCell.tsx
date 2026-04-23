'use client';

import { Input, Popover, PopoverContent, PopoverTrigger } from '@jovie/ui';
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
import { ProviderIcon } from '@/components/atoms/ProviderIcon';
import { CompactLinkRail } from '@/components/molecules/CompactLinkRail';
import {
  DrawerButton,
  DrawerInlineIconButton,
} from '@/components/molecules/drawer';
import { PROVIDER_DOMAINS } from '@/lib/discography/provider-domains';
import type { ProviderKey, ReleaseViewModel } from '@/lib/discography/types';
import { cn } from '@/lib/utils';

interface ProviderConfig {
  label: string;
  accent: string;
}

interface AvailabilityCellProps {
  readonly release: ReleaseViewModel;
  readonly allProviders: ProviderKey[];
  readonly providerConfig: Record<ProviderKey, ProviderConfig>;
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

function AvailabilityEmptyAction() {
  return (
    <div className='flex min-w-[140px] justify-end'>
      <div className='h-7 w-[76px] rounded-lg border border-dashed border-subtle bg-surface-1' />
    </div>
  );
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
  // Ref for urlInput to avoid recreating handleAddUrl on every keystroke
  const urlInputRef = useRef(urlInput);
  urlInputRef.current = urlInput;

  // Create provider Map for O(1) lookups instead of O(n) .find() operations
  const providerMap = useMemo(() => {
    const map = new Map<ProviderKey, (typeof release.providers)[number]>();
    for (const provider of release.providers) {
      map.set(provider.key, provider);
    }
    return map;
  }, [release]);

  // Count available providers
  const availableCount = release.providers.filter(p => p.url).length;
  const totalCount = allProviders.length;

  // Memoize linked providers for compact display (only show providers with URLs)
  const compactProviders = useMemo(() => {
    const linked = allProviders.filter(key => {
      const provider = providerMap.get(key);
      return provider?.url;
    });
    return linked.slice(0, 4);
  }, [allProviders, providerMap]);

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

      const trimmed = urlInputRef.current.trim();
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
    [addingProvider, onAddUrl, release.id]
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
      return async () => {
        const provider = providerMap.get(providerKey);
        if (provider?.path) {
          const config = providerConfig[providerKey];
          await handleCopyWithFeedback(
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
          aria-haspopup='listbox'
          aria-expanded={open}
          className='inline-flex min-w-0 max-w-full items-center gap-1 rounded-full border border-(--linear-app-frame-seam) bg-[color-mix(in_oklab,var(--linear-bg-surface-1)_82%,var(--linear-bg-surface-0))] px-1.5 py-1 text-[12px] font-normal tracking-[-0.01em] text-secondary-token transition-[background-color,border-color,color,box-shadow] duration-150 hover:border-default hover:bg-surface-1 hover:text-primary-token focus-visible:border-(--color-accent) focus-visible:bg-surface-1 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-(--color-accent)'
        >
          <CompactLinkRail
            items={compactProviders.map(providerKey => ({
              id: providerKey,
              platformIcon: providerKey,
              platformName: providerConfig[providerKey].label,
              primaryText: providerConfig[providerKey].label,
              summaryIcon: (
                <ProviderIcon
                  provider={providerKey}
                  className={cn(
                    'h-2.5 w-2.5',
                    getProviderStatus(providerKey) === 'missing' && 'opacity-35'
                  )}
                  aria-hidden='true'
                />
              ),
            }))}
            countLabel='DSP links'
            summaryCount={availableCount}
            summaryAriaLabel={`${availableCount} of ${totalCount} DSP links`}
            maxVisible={4}
            className='pointer-events-none flex-1 justify-start'
            railClassName='max-w-[164px] lg:max-w-[196px]'
          />
          <Icon
            name='ChevronDown'
            className='h-3 w-3 text-tertiary-token'
            aria-hidden='true'
          />
        </button>
      </PopoverTrigger>

      <PopoverContent
        align='end'
        className='w-[320px] rounded-xl border border-(--linear-app-frame-seam) bg-surface-1 p-0 shadow-popover'
      >
        <div className='border-b border-(--linear-app-frame-seam) px-3 py-2'>
          <p className='text-[12px] font-caption tracking-[-0.01em] text-primary-token'>
            Platform Availability
          </p>
          <p className='text-[11px] text-secondary-token'>
            {availableCount} of {totalCount} platforms linked
          </p>
        </div>

        <div className='max-h-64 overflow-y-auto'>
          {allProviders.map(providerKey => {
            const provider = providerMap.get(providerKey);
            const config = providerConfig[providerKey];
            const status = getProviderStatus(providerKey);
            const testId = `provider-copy-${release.id}-${providerKey}`;
            const isCopied = copiedTestId === testId;
            const isAdding = addingProvider === providerKey;

            return (
              <div
                key={providerKey}
                className='flex min-h-9 items-center justify-between border-b border-(--linear-app-frame-seam) px-3 py-1.5 last:border-b-0'
              >
                <div className='flex min-w-0 items-center gap-2.5'>
                  {/* Status dot with screen reader text */}
                  {status === 'missing' ? (
                    <span
                      className='flex h-2.5 w-2.5 items-center justify-center rounded-full bg-surface-1'
                      aria-hidden='true'
                    >
                      <span className='h-1 w-1 rounded-full bg-(--linear-text-tertiary)' />
                    </span>
                  ) : (
                    <span
                      className={cn(
                        'relative h-2.5 w-2.5 rounded-full',
                        status === 'manual' && 'ring-2 ring-amber-400/30'
                      )}
                      style={{ backgroundColor: config.accent }}
                      aria-hidden='true'
                    >
                      {status === 'manual' && (
                        <span className='absolute -right-0.5 -top-0.5 h-1.5 w-1.5 rounded-full bg-(--color-warning)' />
                      )}
                    </span>
                  )}

                  {/* Provider icon + name */}
                  <ProviderIcon
                    provider={providerKey}
                    className='h-4 w-4'
                    aria-label={config.label}
                  />
                  <span className='truncate text-[12px] font-normal text-primary-token'>
                    {config.label}
                  </span>
                </div>

                {/* Actions */}
                {(() => {
                  if (provider?.url) {
                    return (
                      <div className='flex min-w-[140px] items-center justify-end gap-1'>
                        <DrawerInlineIconButton
                          aria-label={`Open ${config.label} in new tab`}
                          onClick={() =>
                            globalThis.open(
                              provider.url,
                              '_blank',
                              'noopener,noreferrer'
                            )
                          }
                          className='rounded-full p-1 text-tertiary-token hover:bg-surface-1 hover:text-primary-token'
                        >
                          <Icon
                            name='ExternalLink'
                            className='h-3.5 w-3.5'
                            aria-hidden='true'
                          />
                        </DrawerInlineIconButton>
                        <DrawerInlineIconButton
                          aria-label={
                            isCopied
                              ? `Copied ${config.label} link`
                              : `Copy ${config.label} link`
                          }
                          onClick={createCopyHandler(providerKey, testId)}
                          className={cn(
                            'rounded-full p-1.5 text-tertiary-token transition-[background-color,color] duration-150 hover:bg-surface-1 hover:text-primary-token focus-visible:outline-none focus-visible:bg-surface-1 focus-visible:ring-1 focus-visible:ring-(--linear-border-focus)',
                            isCopied && 'text-emerald-600 dark:text-emerald-400'
                          )}
                        >
                          <Icon
                            name={isCopied ? 'Check' : 'Copy'}
                            className='h-3.5 w-3.5'
                            aria-hidden='true'
                          />
                        </DrawerInlineIconButton>
                      </div>
                    );
                  }

                  if (isAdding) {
                    return (
                      <form
                        onSubmit={handleAddUrl}
                        className='flex min-w-[140px] items-center justify-end gap-1'
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
                          className='h-8 w-[150px] rounded-full border-subtle bg-surface-1 text-[12px]'
                          autoFocus
                        />
                        <DrawerButton
                          type='submit'
                          tone='ghost'
                          size='icon'
                          aria-label='Confirm URL'
                          disabled={!urlInput.trim() || isAddingUrl}
                          className='h-8 w-8 rounded-full text-tertiary-token'
                        >
                          <Icon
                            name='Check'
                            className='h-4 w-4'
                            aria-hidden='true'
                          />
                        </DrawerButton>
                        <DrawerButton
                          type='button'
                          tone='ghost'
                          size='icon'
                          aria-label='Cancel adding URL'
                          onClick={() => {
                            setAddingProvider(null);
                            setUrlInput('');
                            setValidationError('');
                          }}
                          className='h-8 w-8 rounded-full text-tertiary-token'
                        >
                          <Icon
                            name='X'
                            className='h-4 w-4'
                            aria-hidden='true'
                          />
                        </DrawerButton>
                      </form>
                    );
                  }

                  if (onAddUrl) {
                    return (
                      <DrawerButton
                        onClick={() => setAddingProvider(providerKey)}
                        tone='secondary'
                        size='sm'
                        className='min-w-[76px] rounded-full text-[11px] font-caption'
                      >
                        + Add link
                      </DrawerButton>
                    );
                  }

                  return <AvailabilityEmptyAction />;
                })()}
              </div>
            );
          })}
        </div>

        {validationError && (
          <div className='min-h-[28px] border-t border-(--linear-app-frame-seam) px-3 py-1.5'>
            <p className='text-[11px] text-error'>{validationError}</p>
          </div>
        )}
      </PopoverContent>
    </Popover>
  );
});
