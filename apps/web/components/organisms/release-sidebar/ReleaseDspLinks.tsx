'use client';

/**
 * ReleaseDspLinks Component
 *
 * DSP links section with per-row status, last-verified timestamp,
 * quick actions (open/copy handled by SidebarLinkRow), and a visually
 * distinct "missing" section for providers we know about but haven't
 * resolved yet.
 */

import {
  Input,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  SimpleTooltip,
} from '@jovie/ui';
import { AlertTriangle } from 'lucide-react';
import { type ChangeEvent, type KeyboardEvent } from 'react';

import { ProviderIcon } from '@/components/atoms/ProviderIcon';
import {
  DrawerButton,
  DrawerFormGridRow,
  DrawerLinkSection,
  DrawerSurfaceCard,
  SidebarLinkRow,
} from '@/components/molecules/drawer';
import { LINEAR_SURFACE } from '@/features/dashboard/tokens';
import type {
  ProviderConfidence,
  ProviderKey,
  ProviderSource,
} from '@/lib/discography/types';
import { cn } from '@/lib/utils';
import { formatTimeAgo } from '@/lib/utils/date-formatting';

import type { Release } from './types';
import { isValidUrl } from './utils';

type DspStatus = 'connected' | 'pending' | 'error' | 'missing';

interface DspStatusVisual {
  readonly label: string;
  readonly description: string;
  readonly dotClassName: string;
}

const STATUS_VISUALS: Record<DspStatus, DspStatusVisual> = {
  connected: {
    label: 'Connected',
    description: 'Link verified against the provider.',
    dotClassName: 'bg-success',
  },
  pending: {
    label: 'Pending',
    description: 'Link resolved via search fallback and not yet verified.',
    dotClassName: 'bg-warning',
  },
  error: {
    label: 'Error',
    description: 'Link is present but looks invalid.',
    dotClassName: 'bg-destructive',
  },
  missing: {
    label: 'Missing',
    description: "We haven't found this provider for this release yet.",
    dotClassName: 'bg-tertiary-token',
  },
};

function resolveProviderStatus(params: {
  url: string;
  source: ProviderSource;
  confidence?: ProviderConfidence;
}): DspStatus {
  const { url, source, confidence } = params;
  if (!url || !isValidUrl(url)) return 'error';
  if (source === 'manual') return 'connected';
  switch (confidence) {
    case 'canonical':
    case 'manual_override':
      return 'connected';
    case 'search_fallback':
    case 'unknown':
      return 'pending';
    case undefined:
      return 'connected';
    default:
      return 'pending';
  }
}

function StatusDot({ status }: { readonly status: DspStatus }) {
  const visual = STATUS_VISUALS[status];
  return (
    <SimpleTooltip
      content={`${visual.label}: ${visual.description}`}
      side='top'
    >
      <span
        className='inline-flex h-4 w-4 items-center justify-center'
        aria-label={visual.label}
        role='img'
      >
        <span
          className={cn('h-1.5 w-1.5 rounded-full', visual.dotClassName)}
          aria-hidden='true'
        />
      </span>
    </SimpleTooltip>
  );
}

interface ReleaseDspLinksProps {
  readonly release: Release;
  readonly providerConfig: Record<
    ProviderKey,
    { label: string; accent: string }
  >;
  readonly isEditable: boolean;
  readonly isAddingLink: boolean;
  readonly newLinkUrl: string;
  readonly selectedProvider: ProviderKey | null;
  readonly isAddingDspLink: boolean;
  readonly isRemovingDspLink: string | null;
  readonly onSetIsAddingLink: (value: boolean) => void;
  readonly onSetNewLinkUrl: (value: string) => void;
  readonly onSetSelectedProvider: (value: ProviderKey | null) => void;
  readonly onAddLink: () => Promise<void>;
  readonly onRemoveLink: (provider: ProviderKey) => Promise<void>;
  readonly onNewLinkKeyDown: (event: KeyboardEvent<HTMLInputElement>) => void;
  readonly showHeading?: boolean;
}

export function ReleaseDspLinks({
  release,
  providerConfig,
  isEditable,
  isAddingLink,
  newLinkUrl,
  selectedProvider,
  isAddingDspLink,
  isRemovingDspLink,
  onSetIsAddingLink,
  onSetNewLinkUrl,
  onSetSelectedProvider,
  onAddLink,
  onRemoveLink,
  onNewLinkKeyDown,
  showHeading = false,
}: ReleaseDspLinksProps) {
  // Get list of providers that don't have links yet (for the add dropdown)
  const providerKeys = Object.keys(providerConfig) as ProviderKey[];
  const availableProviders = providerKeys
    .filter(key => !release.providers.some(p => p.key === key))
    .map(key => [key, providerConfig[key]] as const);

  // Missing providers: those the backend knows about but hasn't resolved yet.
  // We only surface these if the matrix actually tracked them — we don't
  // invent "missing" for every provider in the universe.
  const unresolvedProviders = (
    release.providerCounts?.unresolvedProviders ?? []
  ).filter(key => !release.providers.some(p => p.key === key));

  const hasAnyRows =
    release.providers.length > 0 || unresolvedProviders.length > 0;

  return (
    <DrawerLinkSection
      title='DSPs'
      showHeading={showHeading}
      isEmpty={!hasAnyRows && !isAddingLink}
      emptyMessage='No DSP links yet.'
    >
      {/* Providers list */}
      {release.providers.length > 0 && (
        <div className='space-y-1.5'>
          {release.providers.map(provider => {
            const config = providerConfig[provider.key];
            const isManual = provider.source === 'manual';
            const status = resolveProviderStatus({
              url: provider.url,
              source: provider.source,
              confidence: provider.confidence,
            });
            const verifiedLabel = provider.updatedAt
              ? `Verified ${formatTimeAgo(provider.updatedAt)}`
              : null;

            return (
              <SidebarLinkRow
                key={provider.key}
                icon={
                  <ProviderIcon
                    provider={provider.key}
                    className='h-4 w-4'
                    aria-label={config?.label || provider.key}
                  />
                }
                label={config?.label || provider.key}
                url={provider.url}
                deepLinkPlatform={provider.key}
                badge={isManual ? 'Custom' : undefined}
                isEditable={isEditable}
                isRemoving={isRemovingDspLink === provider.key}
                onRemove={() => void onRemoveLink(provider.key)}
                surfaceVariant='track'
                trailingContent={
                  <div className='ml-auto flex items-center gap-2'>
                    {verifiedLabel ? (
                      <SimpleTooltip
                        content={`Last verified ${formatTimeAgo(provider.updatedAt)}`}
                        side='top'
                      >
                        <span
                          className='hidden text-[10px] text-tertiary-token md:inline'
                          title={verifiedLabel ?? undefined}
                        >
                          {formatTimeAgo(provider.updatedAt)}
                        </span>
                      </SimpleTooltip>
                    ) : null}
                    <StatusDot status={status} />
                  </div>
                }
              />
            );
          })}
        </div>
      )}

      {/* Missing providers — visually muted, warning affordance */}
      {unresolvedProviders.length > 0 && (
        <div className='mt-3 space-y-1.5'>
          <div className='flex items-center gap-1.5 px-2 text-[10px] font-medium uppercase tracking-wide text-tertiary-token'>
            <AlertTriangle className='h-3 w-3' aria-hidden='true' />
            <span>Missing</span>
          </div>
          <div className='space-y-1'>
            {unresolvedProviders.map(key => {
              const config = providerConfig[key];
              const label = config?.label || key;
              return (
                <div
                  key={`missing-${key}`}
                  className={cn(
                    'group flex min-h-[32px] items-center justify-between rounded-[10px] border border-dashed border-subtle bg-transparent px-2 py-1.5 opacity-75',
                    'transition-[background-color,opacity] duration-150 lg:hover:opacity-100'
                  )}
                  data-dsp-status='missing'
                  data-provider={key}
                >
                  <div className='flex min-w-0 flex-1 items-center gap-2.25'>
                    <span className='flex h-5 w-5 shrink-0 items-center justify-center text-tertiary-token'>
                      <ProviderIcon
                        provider={key}
                        className='h-4 w-4 opacity-60'
                        aria-label={label}
                      />
                    </span>
                    <span className='text-[13px] font-[460] text-secondary-token'>
                      {label}
                    </span>
                    <span className='shrink-0 text-[10px] text-tertiary-token'>
                      Missing
                    </span>
                  </div>
                  <SimpleTooltip
                    content="We haven't found this provider for this release yet."
                    side='top'
                  >
                    <span
                      className='flex h-4 w-4 items-center justify-center text-warning'
                      aria-label='Missing provider'
                      role='img'
                    >
                      <AlertTriangle className='h-3 w-3' aria-hidden='true' />
                    </span>
                  </SimpleTooltip>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Add link form */}
      {isEditable && isAddingLink && (
        <DrawerSurfaceCard
          className={cn(LINEAR_SURFACE.drawerCardSm, 'mt-1.5 space-y-2.5 p-3')}
        >
          <DrawerFormGridRow label='Provider'>
            <Select
              value={selectedProvider ?? ''}
              onValueChange={(value: string) => {
                if (value in providerConfig) {
                  onSetSelectedProvider(value as ProviderKey);
                }
              }}
            >
              <SelectTrigger className='h-[30px] w-full rounded-md border-subtle bg-surface-0 text-[12px]'>
                <SelectValue placeholder='Select provider' />
              </SelectTrigger>
              <SelectContent>
                {availableProviders.map(([key, config]) => {
                  return (
                    <SelectItem key={key} value={key}>
                      <div className='flex items-center gap-2'>
                        <ProviderIcon provider={key} className='h-4 w-4' />
                        {config.label}
                      </div>
                    </SelectItem>
                  );
                })}
              </SelectContent>
            </Select>
          </DrawerFormGridRow>
          <DrawerFormGridRow label='URL'>
            <Input
              type='url'
              value={newLinkUrl}
              onChange={(event: ChangeEvent<HTMLInputElement>) =>
                onSetNewLinkUrl(event.target.value)
              }
              onKeyDown={onNewLinkKeyDown}
              placeholder='https://open.spotify.com/...'
              inputMode='url'
              autoCapitalize='none'
              autoCorrect='off'
              autoFocus
              className='h-8 rounded-md border-subtle bg-surface-0 text-[12px]'
            />
          </DrawerFormGridRow>
          <div className='flex justify-end gap-2 border-t border-(--linear-app-frame-seam) pt-2'>
            <DrawerButton
              type='button'
              onClick={() => {
                onSetIsAddingLink(false);
                onSetNewLinkUrl('');
                onSetSelectedProvider(null);
              }}
              tone='ghost'
            >
              Cancel
            </DrawerButton>
            <DrawerButton
              type='button'
              onClick={() => void onAddLink()}
              disabled={
                !isValidUrl(newLinkUrl) || !selectedProvider || isAddingDspLink
              }
              className='min-w-[68px]'
            >
              {isAddingDspLink ? 'Adding...' : 'Add'}
            </DrawerButton>
          </div>
        </DrawerSurfaceCard>
      )}
    </DrawerLinkSection>
  );
}
