'use client';

import { Badge, Button } from '@jovie/ui';
import Image from 'next/image';
import { Icon } from '@/components/atoms/Icon';
import type { ProviderKey, ReleaseViewModel } from '@/lib/discography/types';
import { cn } from '@/lib/utils';
import { getBaseUrl } from '@/lib/utils/platform-detection';

interface ProviderConfig {
  label: string;
  accent: string;
}

function ProviderStatusDot({
  status,
  accent,
}: {
  status: 'available' | 'manual' | 'missing';
  accent: string;
}) {
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
        <span className='absolute -right-0.5 -top-0.5 h-1.5 w-1.5 rounded-full bg-amber-500' />
      )}
    </span>
  );
}

interface ReleaseTableRowProps {
  release: ReleaseViewModel;
  index: number;
  totalRows: number;
  primaryProviders: ProviderKey[];
  providerConfig: Record<ProviderKey, ProviderConfig>;
  onCopy: (path: string, label: string, testId: string) => Promise<string>;
  onEdit: (release: ReleaseViewModel) => void;
}

export function ReleaseTableRow({
  release,
  index,
  totalRows,
  primaryProviders,
  providerConfig,
  onCopy,
  onEdit,
}: ReleaseTableRowProps) {
  const manualOverrideCount = release.providers.filter(
    provider => provider.source === 'manual'
  ).length;

  return (
    <tr
      className={cn(
        'group transition-colors duration-200 hover:bg-surface-2/50',
        index !== totalRows - 1 && 'border-b border-subtle'
      )}
    >
      {/* Release info cell */}
      <td className='px-4 py-4 align-middle sm:px-6'>
        <div className='flex items-center gap-3'>
          {/* Artwork thumbnail */}
          <div className='relative h-12 w-12 shrink-0 overflow-hidden rounded-lg bg-surface-2 shadow-sm'>
            {release.artworkUrl ? (
              <Image
                src={release.artworkUrl}
                alt={`${release.title} artwork`}
                fill
                className='object-cover'
                sizes='48px'
              />
            ) : (
              <div className='flex h-full w-full items-center justify-center'>
                <Icon
                  name='Disc3'
                  className='h-6 w-6 text-tertiary-token'
                  aria-hidden='true'
                />
              </div>
            )}
          </div>
          {/* Title and metadata */}
          <div className='min-w-0 flex-1'>
            <div className='flex items-center gap-2'>
              <span className='truncate text-sm font-semibold text-primary-token'>
                {release.title}
              </span>
              {manualOverrideCount > 0 && (
                <Badge
                  variant='secondary'
                  className='shrink-0 border border-amber-200 bg-amber-50 text-[10px] text-amber-900 dark:border-amber-900/50 dark:bg-amber-900/20 dark:text-amber-200'
                >
                  {manualOverrideCount} edited
                </Badge>
              )}
            </div>
            <p className='mt-0.5 text-xs text-secondary-token'>
              {release.releaseDate
                ? new Date(release.releaseDate).toLocaleDateString('en-US', {
                    month: 'short',
                    day: 'numeric',
                    year: 'numeric',
                  })
                : 'Release date TBD'}
            </p>
          </div>
        </div>
      </td>

      {/* Smart link cell */}
      <td className='px-4 py-4 align-middle sm:px-6'>
        <Button
          variant='secondary'
          size='sm'
          data-testid={`smart-link-copy-${release.id}`}
          data-url={`${getBaseUrl()}${release.smartLinkPath}`}
          onClick={() =>
            void onCopy(
              release.smartLinkPath,
              `${release.title} smart link`,
              `smart-link-copy-${release.id}`
            )
          }
          className='inline-flex items-center gap-2 text-xs'
        >
          <Icon name='Link' className='h-3.5 w-3.5' aria-hidden='true' />
          Copy link
        </Button>
      </td>

      {/* Provider cells */}
      {primaryProviders.map(providerKey => {
        const provider = release.providers.find(
          item => item.key === providerKey
        );
        const available = Boolean(provider?.url);
        const isManual = provider?.source === 'manual';
        const testId = `provider-copy-${release.id}-${providerKey}`;
        const status = isManual
          ? 'manual'
          : available
            ? 'available'
            : 'missing';

        return (
          <td key={providerKey} className='px-4 py-4 align-middle sm:px-6'>
            <div className='flex items-center gap-3'>
              <ProviderStatusDot
                status={status}
                accent={providerConfig[providerKey].accent}
              />
              {available ? (
                <button
                  type='button'
                  data-testid={testId}
                  data-url={
                    provider?.path
                      ? `${getBaseUrl()}${provider.path}`
                      : undefined
                  }
                  onClick={() => {
                    if (!provider?.path) return;
                    void onCopy(
                      provider.path,
                      `${release.title} – ${providerConfig[providerKey].label}`,
                      testId
                    );
                  }}
                  className='group/btn inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-xs text-secondary-token transition-colors hover:bg-surface-2 hover:text-primary-token'
                >
                  <Icon
                    name='Copy'
                    className='h-3.5 w-3.5 opacity-0 transition-opacity group-hover/btn:opacity-100'
                    aria-hidden='true'
                  />
                  <span>{isManual ? 'Custom' : 'Detected'}</span>
                </button>
              ) : (
                <span className='text-xs text-tertiary-token'>Not found</span>
              )}
            </div>
          </td>
        );
      })}

      {/* Actions cell */}
      <td className='px-4 py-4 align-middle text-right sm:px-6'>
        <Button
          variant='ghost'
          size='sm'
          className='inline-flex items-center gap-1.5 text-xs opacity-0 transition-opacity group-hover:opacity-100 focus:opacity-100'
          data-testid={`edit-links-${release.id}`}
          onClick={() => onEdit(release)}
        >
          <Icon name='PencilLine' className='h-3.5 w-3.5' aria-hidden='true' />
          Edit
        </Button>
      </td>
    </tr>
  );
}
