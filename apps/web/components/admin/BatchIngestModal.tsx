'use client';

import { Button, Textarea } from '@jovie/ui';
import { CheckCircle2, CircleAlert, CircleMinus } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import {
  Dialog,
  DialogActions,
  DialogBody,
  DialogTitle,
} from '@/components/organisms/Dialog';
import {
  type BatchIngestApiResponse,
  useBatchIngestMutation,
} from '@/lib/queries/useBatchIngestMutation';
import { cn } from '@/lib/utils';
import { parseBatchUrls } from './batch-url-utils';

interface BatchIngestModalProps {
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
  readonly onComplete?: () => void;
}

const STATUS_CONFIG = {
  success: {
    icon: CheckCircle2,
    className: 'text-success',
    label: 'Created',
  },
  skipped: {
    icon: CircleMinus,
    className: 'text-warning',
    label: 'Skipped',
  },
  error: {
    icon: CircleAlert,
    className: 'text-error',
    label: 'Error',
  },
} as const;

export function BatchIngestModal({
  open,
  onOpenChange,
  onComplete,
}: Readonly<BatchIngestModalProps>) {
  const [value, setValue] = useState('');
  const [result, setResult] = useState<BatchIngestApiResponse | null>(null);

  const { mutateAsync, isPending } = useBatchIngestMutation({
    onSuccess: data => {
      setResult(data);
      onComplete?.();
    },
  });

  const parsedCount = useMemo(() => parseBatchUrls(value).length, [value]);

  // Reset state when modal closes
  useEffect(() => {
    if (!open) {
      setValue('');
      setResult(null);
    }
  }, [open]);

  const handleSubmit = async () => {
    const urls = parseBatchUrls(value);
    if (urls.length === 0) return;
    await mutateAsync({ urls });
  };

  return (
    <Dialog open={open} onClose={() => onOpenChange(false)} size='md'>
      <DialogTitle>Batch URL import</DialogTitle>
      <DialogBody className='space-y-3'>
        <p className='text-xs text-tertiary-token'>
          Paste URLs one per line or comma-separated. Linktree, Spotify, Apple
          Music, Instagram, and website URLs are all supported.
        </p>
        <Textarea
          rows={5}
          value={value}
          onChange={event => setValue(event.target.value)}
          placeholder={
            'https://linktr.ee/artistname\nhttps://open.spotify.com/artist/...\nhttps://www.instagram.com/artistname, https://artist-website.com'
          }
          disabled={isPending}
        />
        <p className='text-2xs text-tertiary-token'>
          {parsedCount} URL{parsedCount === 1 ? '' : 's'} parsed
        </p>

        {result && (
          <div className='space-y-2 rounded-md border border-subtle p-3 text-xs'>
            <div className='flex items-center gap-3'>
              {result.summary.success > 0 && (
                <span className='inline-flex items-center gap-1 text-success'>
                  <CheckCircle2 className='size-3' />
                  {result.summary.success} created
                </span>
              )}
              {result.summary.skipped > 0 && (
                <span className='inline-flex items-center gap-1 text-warning'>
                  <CircleMinus className='size-3' />
                  {result.summary.skipped} skipped
                </span>
              )}
              {result.summary.error > 0 && (
                <span className='inline-flex items-center gap-1 text-error'>
                  <CircleAlert className='size-3' />
                  {result.summary.error} errors
                </span>
              )}
            </div>
            <ul className='max-h-52 space-y-1 overflow-y-auto'>
              {result.results.map(item => {
                const config = STATUS_CONFIG[item.status];
                const StatusIcon = config.icon;
                return (
                  <li
                    key={`${item.input}-${item.status}`}
                    className='flex items-start gap-1.5'
                  >
                    <StatusIcon
                      className={cn('mt-0.5 size-3 shrink-0', config.className)}
                    />
                    <span>
                      <span className={cn('font-medium', config.className)}>
                        {config.label}
                      </span>{' '}
                      {item.input}
                      {item.username ? ` \u2192 @${item.username}` : ''}
                      {item.reason ? ` (${item.reason})` : ''}
                    </span>
                  </li>
                );
              })}
            </ul>
          </div>
        )}
      </DialogBody>
      <DialogActions>
        <Button
          type='button'
          variant='ghost'
          size='sm'
          onClick={() => onOpenChange(false)}
          disabled={isPending}
        >
          {result ? 'Close' : 'Cancel'}
        </Button>
        {!result && (
          <Button
            type='button'
            variant='primary'
            size='sm'
            onClick={handleSubmit}
            disabled={isPending || parsedCount === 0}
          >
            {isPending ? 'Ingesting\u2026' : 'Run batch import'}
          </Button>
        )}
      </DialogActions>
    </Dialog>
  );
}
