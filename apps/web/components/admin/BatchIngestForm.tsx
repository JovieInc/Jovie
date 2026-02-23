'use client';

import { Button, Card, CardContent, CardHeader, Textarea } from '@jovie/ui';
import {
  CheckCircle2,
  ChevronRight,
  CircleAlert,
  CircleMinus,
} from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { AnimatedAccordion } from '@/components/organisms/AnimatedAccordion';
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

interface BatchIngestFormProps {
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

export function BatchIngestForm({
  onComplete,
}: Readonly<BatchIngestFormProps>) {
  const [value, setValue] = useState('');
  const [isOpen, setIsOpen] = useState(false);
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

  // Auto-expand when results arrive
  useEffect(() => {
    if (result) {
      setIsOpen(true);
    }
  }, [result]);

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
        headers: {
          'Content-Type': 'application/json',
        },
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

  const summaryText = result
    ? `${result.summary.success} created, ${result.summary.skipped} skipped, ${result.summary.error} errors`
    : parsedCount > 0
      ? `${parsedCount} URL${parsedCount === 1 ? '' : 's'} ready`
      : null;

  return (
    <Card>
      <CardHeader className='p-0'>
        <button
          type='button'
          onClick={() => setIsOpen(open => !open)}
          className='flex w-full items-center gap-2 px-4 py-2.5 text-left'
        >
          <ChevronRight
            className={cn(
              'h-3.5 w-3.5 shrink-0 text-tertiary-token transition-transform duration-200',
              isOpen && 'rotate-90'
            )}
          />
          <span className='text-app font-medium'>Batch Spotify ingest</span>
          {summaryText && !isOpen && (
            <span className='ml-auto text-2xs text-tertiary-token'>
              {summaryText}
            </span>
          )}
        </button>
      </CardHeader>
      <AnimatedAccordion isOpen={isOpen}>
        <CardContent className='space-y-2 pt-0'>
          <Textarea
            rows={4}
            value={value}
            onChange={event => setValue(event.target.value)}
            placeholder='https://open.spotify.com/artist/...
https://open.spotify.com/artist/...
4Z8W4fKeB5YxbusRsdQVPb'
          />
          <div className='flex items-center justify-between text-2xs text-tertiary-token'>
            <span>
              {parsedCount} artist {parsedCount === 1 ? 'URL' : 'URLs'} parsed
            </span>
            <Button
              type='button'
              size='sm'
              onClick={handleSubmit}
              disabled={isSubmitting}
            >
              {isSubmitting ? 'Ingesting\u2026' : 'Run batch ingest'}
            </Button>
          </div>

          {result && (
            <div className='space-y-1.5 rounded-md border border-subtle p-2 text-2xs'>
              <p className='font-medium text-secondary-token'>
                Results: {result.summary.success} created &middot;{' '}
                {result.summary.skipped} skipped &middot; {result.summary.error}{' '}
                errors
              </p>
              <ul className='max-h-40 space-y-0.5 overflow-y-auto'>
                {result.results.map(item => {
                  const config = STATUS_CONFIG[item.status];
                  const Icon = config.icon;
                  return (
                    <li
                      key={`${item.input}-${item.status}`}
                      className='flex items-start gap-1.5'
                    >
                      <Icon
                        className={cn(
                          'mt-0.5 h-3 w-3 shrink-0',
                          config.className
                        )}
                      />
                      <span className={cn('font-medium', config.className)}>
                        {config.label}
                      </span>
                      <span className='truncate font-mono text-tertiary-token'>
                        {item.input}
                      </span>
                      {item.username && (
                        <span className='shrink-0 text-secondary-token'>
                          &rarr; @{item.username}
                        </span>
                      )}
                      {item.reason && (
                        <span className='shrink-0 text-tertiary-token'>
                          ({item.reason})
                        </span>
                      )}
                    </li>
                  );
                })}
              </ul>
            </div>
          )}
        </CardContent>
      </AnimatedAccordion>
    </Card>
  );
}
