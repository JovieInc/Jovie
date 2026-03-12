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
import { parseBatchUrls } from './batch-url-utils';

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

  const parsedCount = useMemo(() => parseBatchUrls(value).length, [value]);

  // Auto-expand when results arrive
  useEffect(() => {
    if (result) {
      setIsOpen(true);
    }
  }, [result]);

  const handleSubmit = async () => {
    const urls = parseBatchUrls(value);

    if (urls.length === 0) {
      notifications.error('Paste at least one URL to import.');
      return;
    }

    setIsSubmitting(true);

    try {
      const response = await fetch('/api/admin/batch-ingest', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ urls }),
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
        error instanceof Error ? error.message : 'Failed to ingest URLs.'
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  let summaryText: string | null;
  if (result) {
    summaryText = `${result.summary.success} created, ${result.summary.skipped} skipped, ${result.summary.error} errors`;
  } else if (parsedCount > 0) {
    const urlSuffix = parsedCount === 1 ? '' : 's';
    summaryText = `${parsedCount} URL${urlSuffix} ready`;
  } else {
    summaryText = null;
  }

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
          <span className='text-app font-medium'>Batch URL import</span>
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
            placeholder='https://linktr.ee/artistname
https://open.spotify.com/artist/...
https://www.instagram.com/artistname, https://artist-website.com'
          />
          <div className='flex flex-col gap-2 text-2xs text-tertiary-token sm:flex-row sm:items-center sm:justify-between'>
            <span>
              {parsedCount} URL{parsedCount === 1 ? '' : 's'} parsed
            </span>
            <Button
              type='button'
              size='sm'
              onClick={handleSubmit}
              disabled={isSubmitting}
              className='w-full sm:w-auto'
            >
              {isSubmitting ? 'Ingesting\u2026' : 'Run batch import'}
            </Button>
          </div>

          {result && (
            <div className='space-y-2 rounded-md border border-subtle p-3 text-xs'>
              {/* Summary badges */}
              <div className='flex flex-wrap items-center gap-3'>
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
              {/* Individual results */}
              <ul className='max-h-52 space-y-1 overflow-y-auto'>
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
                          'mt-0.5 size-3 shrink-0',
                          config.className
                        )}
                      />
                      <span>
                        <span className={cn('font-medium', config.className)}>
                          {config.label}
                        </span>{' '}
                        {item.input}
                        {item.username ? ` → @${item.username}` : ''}
                        {item.reason ? ` (${item.reason})` : ''}
                      </span>
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
