'use client';

import {
  Badge,
  Button,
  Input,
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@jovie/ui';
import { PencilLine, Trash2 } from 'lucide-react';
import Image from 'next/image';
import { memo, useCallback, useMemo, useRef, useState } from 'react';
import { Icon } from '@/components/atoms/Icon';
import { TableActionMenu } from '@/components/atoms/table-action-menu';
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
}: Readonly<{
  status: 'available' | 'manual' | 'missing';
  accent: string;
}>) {
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
  accent: string;
  onSave: (url: string) => Promise<void>;
  isSaving?: boolean;
}

function AddProviderUrlPopover({
  providerLabel,
  accent,
  onSave,
  isSaving,
}: Readonly<AddProviderUrlPopoverProps>) {
  const [open, setOpen] = useState(false);
  const [url, setUrl] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = url.trim();
    if (!trimmed) return;
    try {
      await onSave(trimmed);
      setUrl('');
      setOpen(false);
    } catch {
      // Error toast is shown by the hook; keep popover open so user can retry
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
          <Input
            ref={inputRef}
            type='url'
            inputSize='sm'
            placeholder='Paste URL here...'
            value={url}
            onChange={e => setUrl(e.target.value)}
            disabled={isSaving}
            autoComplete='off'
            className='text-xs'
          />
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

/**
 * Copy button for available provider links
 */
function ProviderCopyButton({
  testId,
  path,
  releaseTitle,
  providerLabel,
  isCopied,
  isManual,
  onCopy,
}: Readonly<{
  testId: string;
  path: string | undefined;
  releaseTitle: string;
  providerLabel: string;
  isCopied: boolean;
  isManual: boolean;
  onCopy: (path: string, label: string, testId: string) => Promise<void>;
}>) {
  return (
    <button
      type='button'
      data-testid={testId}
      data-url={path ? `${getBaseUrl()}${path}` : undefined}
      onClick={() => {
        if (!path) return;
        void onCopy(path, `${releaseTitle} – ${providerLabel}`, testId);
      }}
      className={cn(
        'group/btn inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-xs transition-colors',
        isCopied
          ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400'
          : 'text-secondary-token hover:bg-surface-2 hover:text-primary-token'
      )}
    >
      <span className='relative flex h-3.5 w-3.5 items-center justify-center'>
        <Icon
          name='Copy'
          className={cn(
            'absolute h-3.5 w-3.5 transition-all duration-150',
            isCopied
              ? 'scale-50 opacity-0'
              : 'scale-100 opacity-0 group-hover/btn:opacity-100'
          )}
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
      <span className='line-clamp-1'>
        {isCopied && 'Copied!'}
        {!isCopied && isManual && 'Custom'}
        {!isCopied && !isManual && 'Detected'}
      </span>
    </button>
  );
}

/**
 * Fallback copy button for missing provider links
 */
function NotFoundCopyButton({
  testId,
  releaseTitle,
  smartLinkPath,
  isCopied,
  onCopy,
}: Readonly<{
  testId: string;
  releaseTitle: string;
  smartLinkPath: string;
  isCopied: boolean;
  onCopy: (path: string, label: string, testId: string) => Promise<void>;
}>) {
  return (
    <button
      type='button'
      className={cn(
        'group/btn inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-xs transition-colors',
        isCopied
          ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400'
          : 'text-tertiary-token hover:bg-surface-2 hover:text-primary-token'
      )}
      onClick={() =>
        void onCopy(smartLinkPath, `${releaseTitle} smart link`, testId)
      }
    >
      <Icon
        name={isCopied ? 'Check' : 'Copy'}
        className={cn(
          'h-3.5 w-3.5 transition-opacity',
          isCopied ? 'opacity-100' : 'opacity-0 group-hover/btn:opacity-100'
        )}
        aria-hidden='true'
      />
      <span className='line-clamp-1 text-tertiary-token/50'>
        {isCopied ? 'Copied!' : '—'}
      </span>
    </button>
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
  onAddUrl?: (
    releaseId: string,
    provider: ProviderKey,
    url: string
  ) => Promise<void>;
  isAddingUrl?: boolean;
  artistName?: string | null;
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

  const handleCopyWithFeedback = useCallback(
    async (path: string, label: string, testId: string) => {
      await onCopy(path, label, testId);
      setCopiedId(testId);
      setTimeout(() => setCopiedId(null), 2000);
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
          // TODO: Implement delete confirmation dialog
          console.log('Delete release:', release.id);
        },
        disabled: true,
      },
    ],
    [handleEdit, handleCopySmartLink, release.id]
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
      <td className='px-4 py-4 align-middle sm:px-6'>
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
      <td className='px-4 py-4 align-middle sm:px-6'>
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
      <td className='px-4 py-4 align-middle sm:px-6'>
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
        const getStatus = () => {
          if (isManual) return 'manual';
          return available ? 'available' : 'missing';
        };
        const status = getStatus();

        return (
          <td key={providerKey} className='px-4 py-4 align-middle sm:px-6'>
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
      <td className='px-4 py-4 align-middle text-right sm:px-6'>
        <div className='flex justify-end'>
          <TableActionMenu items={menuItems} />
        </div>
      </td>
    </tr>
  );
});
