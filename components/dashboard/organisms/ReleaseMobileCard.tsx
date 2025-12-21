'use client';

import { Badge, Button, Input } from '@jovie/ui';
import { useState, useTransition } from 'react';
import { toast } from 'sonner';
import { Icon } from '@/components/atoms/Icon';
import type { ProviderKey, ReleaseViewModel } from '@/lib/discography/types';
import { cn } from '@/lib/utils';
import { getBaseUrl } from '@/lib/utils/platform-detection';

export interface ReleaseMobileCardProps {
  release: ReleaseViewModel;
  providerConfig: Record<ProviderKey, { label: string; accent: string }>;
  primaryProviders: ProviderKey[];
  onCopy: (path: string, label: string, testId: string) => Promise<string>;
  onSaveOverride: (provider: ProviderKey, url: string) => Promise<void>;
  onResetOverride: (provider: ProviderKey) => Promise<void>;
}

export function ReleaseMobileCard({
  release,
  providerConfig,
  primaryProviders,
  onCopy,
  onSaveOverride,
  onResetOverride,
}: ReleaseMobileCardProps) {
  const [isExpanded, setIsExpanded] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [editingProvider, setEditingProvider] = useState<ProviderKey | null>(
    null
  );
  const [draftUrl, setDraftUrl] = useState('');
  const [isSaving, startSaving] = useTransition();

  const manualOverrideCount = release.providers.filter(
    provider => provider.source === 'manual'
  ).length;

  const primaryProviderLinks = release.providers.filter(provider =>
    primaryProviders.includes(provider.key)
  );

  const secondaryProviderLinks = release.providers.filter(
    provider => !primaryProviders.includes(provider.key)
  );

  const handleStartEdit = (provider: ProviderKey, currentUrl: string) => {
    setEditingProvider(provider);
    setDraftUrl(currentUrl);
    setIsEditing(true);
  };

  const handleCancelEdit = () => {
    setIsEditing(false);
    setEditingProvider(null);
    setDraftUrl('');
  };

  const handleSave = () => {
    if (!editingProvider) return;
    const url = draftUrl.trim();
    if (!url) {
      toast.error('Enter a URL before saving');
      return;
    }

    startSaving(async () => {
      try {
        await onSaveOverride(editingProvider, url);
        handleCancelEdit();
      } catch {
        // Error handled in parent
      }
    });
  };

  const handleReset = () => {
    if (!editingProvider) return;

    startSaving(async () => {
      try {
        await onResetOverride(editingProvider);
        handleCancelEdit();
      } catch {
        // Error handled in parent
      }
    });
  };

  const formattedDate = release.releaseDate
    ? new Date(release.releaseDate).toLocaleDateString('en-US', {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
      })
    : 'Release date TBD';

  return (
    <div
      className='bg-surface-0 border border-subtle rounded-xl overflow-hidden'
      data-testid={`release-mobile-card-${release.id}`}
    >
      {/* Main card content - always visible */}
      <div className='p-4'>
        {/* Header: Title, Badge, Date */}
        <div className='flex items-start justify-between gap-3'>
          <div className='flex-1 min-w-0'>
            <div className='flex items-center gap-2'>
              <h3 className='font-semibold text-primary-token truncate text-base'>
                {release.title}
              </h3>
              {manualOverrideCount > 0 && (
                <Badge
                  variant='secondary'
                  size='sm'
                  className='bg-amber-100/70 text-amber-900 flex-shrink-0'
                >
                  {manualOverrideCount} override
                  {manualOverrideCount > 1 ? 's' : ''}
                </Badge>
              )}
            </div>
            <p className='text-sm text-secondary-token mt-0.5'>
              {formattedDate}
            </p>
          </div>
        </div>

        {/* Smart Link Copy Button */}
        <div className='mt-3'>
          <Button
            variant='primary'
            size='sm'
            data-testid={`smart-link-copy-mobile-${release.id}`}
            data-url={`${getBaseUrl()}${release.smartLinkPath}`}
            onClick={() =>
              void onCopy(
                release.smartLinkPath,
                `${release.title} smart link`,
                `smart-link-copy-${release.id}`
              )
            }
            className='w-full inline-flex items-center justify-center gap-2'
          >
            <Icon name='Copy' className='h-4 w-4' aria-hidden='true' />
            Copy smart link
          </Button>
        </div>

        {/* Primary Provider Quick Links */}
        <div className='mt-3 grid grid-cols-2 gap-2'>
          {primaryProviderLinks.map(provider => {
            const available = Boolean(provider.url);
            const config = providerConfig[provider.key];

            return (
              <Button
                key={provider.key}
                variant='secondary'
                size='sm'
                disabled={!available}
                data-testid={`provider-copy-mobile-${release.id}-${provider.key}`}
                onClick={() => {
                  if (!provider.path) return;
                  void onCopy(
                    provider.path,
                    `${release.title} – ${config.label}`,
                    `provider-copy-${release.id}-${provider.key}`
                  );
                }}
                className='inline-flex items-center justify-center gap-1.5 text-xs'
              >
                <span
                  className='h-2 w-2 rounded-full flex-shrink-0'
                  style={{ backgroundColor: config.accent }}
                  aria-hidden='true'
                />
                {config.label}
                {available && (
                  <Icon name='Copy' className='h-3 w-3' aria-hidden='true' />
                )}
              </Button>
            );
          })}
        </div>

        {/* Action buttons */}
        <div className='flex items-center gap-2 mt-4'>
          <Button
            size='sm'
            variant='ghost'
            onClick={() => setIsExpanded(!isExpanded)}
            className='flex-1'
            aria-expanded={isExpanded}
            aria-label={isExpanded ? 'Show less details' : 'Show more details'}
          >
            {isExpanded ? 'Hide details' : 'View details'}
            <Icon
              name={isExpanded ? 'ChevronUp' : 'ChevronDown'}
              className='h-4 w-4 ml-1'
              aria-hidden='true'
            />
          </Button>
        </div>
      </div>

      {/* Expanded content - Provider details & editing */}
      {isExpanded && (
        <div className='border-t border-subtle bg-surface-1/50 px-4 py-3 space-y-3'>
          {/* Provider list with edit capability */}
          <div className='space-y-2'>
            <p className='text-xs font-semibold uppercase tracking-wide text-secondary-token'>
              All platforms
            </p>

            {/* Editing UI */}
            {isEditing && editingProvider ? (
              <div className='rounded-lg border border-subtle bg-surface-0 p-3 space-y-3'>
                <div className='flex items-center gap-2'>
                  <span
                    className='h-2 w-2 rounded-full'
                    style={{
                      backgroundColor: providerConfig[editingProvider].accent,
                    }}
                    aria-hidden='true'
                  />
                  <p className='text-sm font-semibold text-primary-token'>
                    {providerConfig[editingProvider].label}
                  </p>
                </div>
                <Input
                  value={draftUrl}
                  onChange={event => setDraftUrl(event.target.value)}
                  placeholder={`${providerConfig[editingProvider].label} URL`}
                  data-testid={`provider-input-mobile-${release.id}-${editingProvider}`}
                  className='text-sm'
                />
                <div className='flex items-center gap-2'>
                  <Button
                    variant='primary'
                    size='sm'
                    disabled={isSaving || !draftUrl.trim()}
                    onClick={handleSave}
                    className='flex-1'
                    data-testid={`save-provider-mobile-${release.id}-${editingProvider}`}
                  >
                    {isSaving ? 'Saving…' : 'Save'}
                  </Button>
                  <Button
                    variant='ghost'
                    size='sm'
                    disabled={isSaving}
                    onClick={handleReset}
                    data-testid={`reset-provider-mobile-${release.id}-${editingProvider}`}
                  >
                    Reset
                  </Button>
                  <Button
                    variant='ghost'
                    size='sm'
                    disabled={isSaving}
                    onClick={handleCancelEdit}
                  >
                    Cancel
                  </Button>
                </div>
              </div>
            ) : (
              <>
                {/* Primary Providers */}
                {primaryProviderLinks.map(provider => (
                  <ProviderRow
                    key={provider.key}
                    provider={provider}
                    config={providerConfig[provider.key]}
                    releaseId={release.id}
                    releaseTitle={release.title}
                    onCopy={onCopy}
                    onEdit={() =>
                      handleStartEdit(provider.key, provider.url ?? '')
                    }
                  />
                ))}

                {/* Secondary Providers */}
                {secondaryProviderLinks.length > 0 && (
                  <>
                    <div className='border-t border-subtle my-2' />
                    {secondaryProviderLinks.map(provider => (
                      <ProviderRow
                        key={provider.key}
                        provider={provider}
                        config={providerConfig[provider.key]}
                        releaseId={release.id}
                        releaseTitle={release.title}
                        onCopy={onCopy}
                        onEdit={() =>
                          handleStartEdit(provider.key, provider.url ?? '')
                        }
                      />
                    ))}
                  </>
                )}
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

interface ProviderRowProps {
  provider: ReleaseViewModel['providers'][number];
  config: { label: string; accent: string };
  releaseId: string;
  releaseTitle: string;
  onCopy: (path: string, label: string, testId: string) => Promise<string>;
  onEdit: () => void;
}

function ProviderRow({
  provider,
  config,
  releaseId,
  releaseTitle,
  onCopy,
  onEdit,
}: ProviderRowProps) {
  const available = Boolean(provider.url);

  return (
    <div className='flex items-center justify-between gap-2 py-2'>
      <div className='flex items-center gap-2 min-w-0 flex-1'>
        <span
          className='h-2 w-2 rounded-full flex-shrink-0'
          style={{ backgroundColor: config.accent }}
          aria-hidden='true'
        />
        <span className='text-sm text-primary-token'>{config.label}</span>
        <Badge
          size='sm'
          variant='secondary'
          className={cn(
            'text-[10px] flex-shrink-0',
            provider.source === 'manual'
              ? 'bg-amber-50 text-amber-900'
              : available
                ? 'bg-surface-2/70'
                : 'bg-red-50 text-red-700'
          )}
        >
          {provider.source === 'manual'
            ? 'Manual'
            : available
              ? 'Auto'
              : 'Missing'}
        </Badge>
      </div>
      <div className='flex items-center gap-1'>
        {available && (
          <Button
            variant='ghost'
            size='sm'
            className='h-8 w-8 p-0'
            data-testid={`provider-copy-expanded-${releaseId}-${provider.key}`}
            onClick={() => {
              if (!provider.path) return;
              void onCopy(
                provider.path,
                `${releaseTitle} – ${config.label}`,
                `provider-copy-${releaseId}-${provider.key}`
              );
            }}
            aria-label={`Copy ${config.label} link`}
          >
            <Icon name='Copy' className='h-4 w-4' aria-hidden='true' />
          </Button>
        )}
        <Button
          variant='ghost'
          size='sm'
          className='h-8 w-8 p-0'
          onClick={onEdit}
          aria-label={`Edit ${config.label} link`}
          data-testid={`provider-edit-mobile-${releaseId}-${provider.key}`}
        >
          <Icon name='PencilLine' className='h-4 w-4' aria-hidden='true' />
        </Button>
      </div>
    </div>
  );
}
