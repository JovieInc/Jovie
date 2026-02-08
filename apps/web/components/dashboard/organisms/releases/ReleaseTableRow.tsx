'use client';

import { Badge, Button } from '@jovie/ui';
import { PencilLine, Trash2 } from 'lucide-react';
import Image from 'next/image';
import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Icon } from '@/components/atoms/Icon';
import { TableActionMenu } from '@/components/atoms/table-action-menu';
import type { ProviderKey, ReleaseViewModel } from '@/lib/discography/types';
import { cn } from '@/lib/utils';
import { getBaseUrl } from '@/lib/utils/platform-detection';
import { buildUTMContext, getUTMShareActionMenuItems } from '@/lib/utm';
import {
  AddProviderUrlPopover,
  NotFoundCopyButton,
  ProviderCopyButton,
  ProviderStatusDot,
} from './components';

interface ProviderConfig {
  label: string;
  accent: string;
}

interface ReleaseTableRowProps {
  readonly release: ReleaseViewModel;
  readonly index: number;
  readonly totalRows: number;
  readonly primaryProviders: ProviderKey[];
  readonly providerConfig: Record<ProviderKey, ProviderConfig>;
  readonly onCopy: (
    path: string,
    label: string,
    testId: string
  ) => Promise<string>;
  readonly onEdit: (release: ReleaseViewModel) => void;
  readonly onAddUrl?: (
    releaseId: string,
    provider: ProviderKey,
    url: string
  ) => Promise<void>;
  readonly isAddingUrl?: boolean;
  readonly artistName?: string | null;
}

export const ReleaseTableRow = memo(function ReleaseTableRow({
  release,
  index,
  totalRows,
  primaryProviders,
  providerConfig,
  onCopy,
  onEdit,
  onAddUrl,
  isAddingUrl,
  artistName,
}: Readonly<ReleaseTableRowProps>) {
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const copyTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (copyTimeoutRef.current) clearTimeout(copyTimeoutRef.current);
    };
  }, []);

  const handleCopyWithFeedback = useCallback(
    async (path: string, label: string, testId: string) => {
      await onCopy(path, label, testId);
      setCopiedId(testId);
      if (copyTimeoutRef.current) clearTimeout(copyTimeoutRef.current);
      copyTimeoutRef.current = setTimeout(() => setCopiedId(null), 2000);
    },
    [onCopy]
  );

  const handleEdit = useCallback(() => onEdit(release), [onEdit, release]);

  const handleCopySmartLink = useCallback(() => {
    void handleCopyWithFeedback(
      release.smartLinkPath,
      `${release.title} smart link`,
      `action-copy-${release.id}`
    );
  }, [
    handleCopyWithFeedback,
    release.smartLinkPath,
    release.title,
    release.id,
  ]);

  const smartLinkUrl = `${getBaseUrl()}${release.smartLinkPath}`;

  const utmShareItems = useMemo(
    () =>
      getUTMShareActionMenuItems({
        smartLinkUrl,
        context: buildUTMContext({
          smartLinkUrl,
          releaseSlug: release.slug,
          releaseTitle: release.title,
          releaseDate: release.releaseDate,
        }),
      }),
    [smartLinkUrl, release.slug, release.title, release.releaseDate]
  );

  const menuItems = useMemo(
    () => [
      {
        id: 'edit',
        label: 'Edit links',
        icon: PencilLine,
        onClick: handleEdit,
      },
      {
        id: 'copy-smart-link',
        label: 'Copy smart link',
        icon: <Icon name='Copy' className='h-3.5 w-3.5' />,
        onClick: handleCopySmartLink,
      },
      ...utmShareItems,
      {
        id: 'separator-1',
        label: 'separator',
        onClick: () => {},
      },
      {
        id: 'delete',
        label: 'Delete release',
        icon: Trash2,
        variant: 'destructive' as const,
        onClick: () => {
          // See JOV-478: Implement delete confirmation dialog
          console.log('Delete release:', release.id);
        },
        disabled: true,
      },
    ],
    [handleEdit, handleCopySmartLink, utmShareItems, release.id]
  );

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
      <td className='px-4 py-4 align-middle'>
        <div className='flex items-center gap-3'>
          {/* Artwork thumbnail */}
          <div className='relative h-10 w-10 shrink-0 overflow-hidden rounded-lg bg-surface-2 shadow-sm'>
            {release.artworkUrl ? (
              <Image
                src={release.artworkUrl}
                alt={`${release.title} artwork`}
                fill
                className='object-cover'
                sizes='40px'
              />
            ) : (
              <div className='flex h-full w-full items-center justify-center'>
                <Icon
                  name='Disc3'
                  className='h-5 w-5 text-tertiary-token'
                  aria-hidden='true'
                />
              </div>
            )}
          </div>
          {/* Title and metadata */}
          <div className='min-w-0 flex-1'>
            <div className='flex items-center gap-2'>
              <span className='line-clamp-1 text-sm font-semibold text-primary-token'>
                {release.title}
              </span>
              {manualOverrideCount > 0 && (
                <Badge
                  variant='secondary'
                  className='shrink-0 border border-(--color-warning) bg-(--color-warning-subtle) text-[10px] text-(--color-warning-foreground)'
                >
                  {manualOverrideCount} edited
                </Badge>
              )}
            </div>
            {artistName && (
              <div className='mt-0.5 line-clamp-1 text-xs text-secondary-token'>
                {artistName}
              </div>
            )}
          </div>
        </div>
      </td>

      {/* Release date cell */}
      <td className='px-4 py-4 align-middle'>
        <span className='line-clamp-1 text-xs text-secondary-token'>
          {release.releaseDate
            ? new Date(release.releaseDate).toLocaleDateString('en-US', {
                month: 'short',
                day: 'numeric',
                year: 'numeric',
              })
            : 'TBD'}
        </span>
      </td>

      {/* Smart link cell */}
      <td className='px-4 py-4 align-middle'>
        {(() => {
          const smartLinkTestId = `smart-link-copy-${release.id}`;
          const isCopied = copiedId === smartLinkTestId;
          return (
            <Button
              variant='secondary'
              size='sm'
              data-testid={smartLinkTestId}
              data-url={`${getBaseUrl()}${release.smartLinkPath}`}
              onClick={() =>
                void handleCopyWithFeedback(
                  release.smartLinkPath,
                  `${release.title} smart link`,
                  smartLinkTestId
                )
              }
              className={cn(
                'inline-flex items-center text-xs transition-colors',
                isCopied &&
                  'bg-green-100 text-green-700 hover:bg-green-100 dark:bg-green-900/30 dark:text-green-400 dark:hover:bg-green-900/30'
              )}
            >
              <span className='relative mr-1 flex h-3.5 w-3.5 items-center justify-center'>
                <Icon
                  name='Link'
                  className={cn(
                    'absolute h-3.5 w-3.5 transition-all duration-150',
                    isCopied ? 'scale-50 opacity-0' : 'scale-100 opacity-100'
                  )}
                  aria-hidden='true'
                />
                <Icon
                  name='Check'
                  className={cn(
                    'absolute h-3.5 w-3.5 transition-all duration-150',
                    isCopied ? 'scale-100 opacity-100' : 'scale-50 opacity-0'
                  )}
                  aria-hidden='true'
                />
              </span>
              <span className='line-clamp-1'>
                {isCopied ? 'Copied!' : 'Copy link'}
              </span>
            </Button>
          );
        })()}
      </td>

      {/* Provider cells */}
      {primaryProviders.map(providerKey => {
        const provider = release.providers.find(
          item => item.key === providerKey
        );
        const available = Boolean(provider?.url);
        const isManual = provider?.source === 'manual';
        const testId = `provider-copy-${release.id}-${providerKey}`;
        const isCopied = copiedId === testId;
        const notFoundTestId = `not-found-copy-${release.id}-${providerKey}`;
        const isNotFoundCopied = copiedId === notFoundTestId;
        // Determine provider status for visual indicator
        let status: 'manual' | 'available' | 'missing';
        if (isManual) {
          status = 'manual';
        } else if (available) {
          status = 'available';
        } else {
          status = 'missing';
        }

        return (
          <td key={providerKey} className='px-4 py-4 align-middle'>
            <div className='flex items-center gap-3'>
              <ProviderStatusDot
                status={status}
                accent={providerConfig[providerKey].accent}
              />
              {available && (
                <ProviderCopyButton
                  testId={testId}
                  path={provider?.path}
                  releaseTitle={release.title}
                  providerLabel={providerConfig[providerKey].label}
                  isCopied={isCopied}
                  isManual={isManual}
                  onCopy={handleCopyWithFeedback}
                />
              )}
              {!available && onAddUrl && (
                <AddProviderUrlPopover
                  providerLabel={providerConfig[providerKey].label}
                  accent={providerConfig[providerKey].accent}
                  onSave={url => onAddUrl(release.id, providerKey, url)}
                  isSaving={isAddingUrl}
                />
              )}
              {!available && !onAddUrl && (
                <NotFoundCopyButton
                  testId={notFoundTestId}
                  releaseTitle={release.title}
                  smartLinkPath={release.smartLinkPath}
                  isCopied={isNotFoundCopied}
                  onCopy={handleCopyWithFeedback}
                />
              )}
            </div>
          </td>
        );
      })}

      {/* Actions cell */}
      <td className='px-4 py-4 align-middle text-right'>
        <div className='flex justify-end'>
          <TableActionMenu items={menuItems} />
        </div>
      </td>
    </tr>
  );
});
