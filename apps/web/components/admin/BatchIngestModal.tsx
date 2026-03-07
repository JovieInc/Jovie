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
import { useNotifications } from '@/lib/hooks/useNotifications';
import { cn } from '@/lib/utils';

interface BatchResult {
  input: string;
  status: 'success' | 'skipped' | 'error';
  reason?: string;
  username?: string;
}

interface BatchIngestApiResponse {
  results: BatchResult[];
  summary: {
    total: number;
    success: number;
    skipped: number;
    error: number;
  };
}

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
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [result, setResult] = useState<BatchIngestApiResponse | null>(null);
  const notifications = useNotifications();

  const parsedCount = useMemo(
    () =>
      value
        .split('\n')
        .map(line => line.trim())
        .filter(Boolean).length,
    [value]
  );

  // Reset state when modal closes
  useEffect(() => {
    if (!open) {
      setValue('');
      setResult(null);
    }
  }, [open]);

  const handleSubmit = async () => {
    const spotifyUrls = value
      .split('\n')
      .map(line => line.trim())
      .filter(Boolean);

    if (spotifyUrls.length === 0) {
      notifications.error('Paste at least one Spotify artist URL.');
      return;
    }

    setIsSubmitting(true);

    try {
      const response = await fetch('/api/admin/batch-ingest', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ spotifyUrls }),
      });

      const payload = (await response.json()) as BatchIngestApiResponse & {
        error?: string;
        details?: string;
      };

      if (!response.ok) {
        notifications.error(
          payload.details ?? payload.error ?? 'Batch ingest failed.'
        );
        return;
      }

      setResult(payload);
      notifications.success(
        `Batch complete: ${payload.summary.success} created, ${payload.summary.skipped} skipped, ${payload.summary.error} errors.`
      );
      onComplete?.();
    } catch (error) {
      notifications.error(
        error instanceof Error
          ? error.message
          : 'Failed to ingest Spotify artists.'
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onClose={() => onOpenChange(false)} size='md'>
      <DialogTitle>Batch Spotify ingest</DialogTitle>
      <DialogBody className='space-y-3'>
        <p className='text-xs text-tertiary-token'>
          Paste Spotify artist URLs or IDs, one per line. Artists with
          1,000-50,000 followers will be ingested.
        </p>
        <Textarea
          rows={5}
          value={value}
          onChange={event => setValue(event.target.value)}
          placeholder={
            'https://open.spotify.com/artist/...\nhttps://open.spotify.com/artist/...\n4Z8W4fKeB5YxbusRsdQVPb'
          }
          disabled={isSubmitting}
        />
        <p className='text-2xs text-tertiary-token'>
          {parsedCount} artist {parsedCount === 1 ? 'URL' : 'URLs'} parsed
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
          disabled={isSubmitting}
        >
          {result ? 'Close' : 'Cancel'}
        </Button>
        {!result && (
          <Button
            type='button'
            variant='primary'
            size='sm'
            onClick={handleSubmit}
            disabled={isSubmitting || parsedCount === 0}
          >
            {isSubmitting ? 'Ingesting\u2026' : 'Run batch ingest'}
          </Button>
        )}
      </DialogActions>
    </Dialog>
  );
}
