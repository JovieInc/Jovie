'use client';

import { Button, Textarea } from '@jovie/ui';
import {
  CheckCircle2,
  ChevronRight,
  CircleAlert,
  CircleMinus,
} from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { ContentSurfaceCard } from '@/components/molecules/ContentSurfaceCard';
import { AnimatedAccordion } from '@/components/organisms/AnimatedAccordion';
import {
  type BatchIngestApiResponse,
  useBatchIngestMutation,
} from '@/lib/queries';
import { cn } from '@/lib/utils';
import { parseBatchUrls } from './batch-url-utils';

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
  const [result, setResult] = useState<BatchIngestApiResponse | null>(null);

  const { mutateAsync, isPending } = useBatchIngestMutation({
    onSuccess: data => {
      setResult(data);
      onComplete?.();
    },
  });

  const parsedCount = useMemo(() => parseBatchUrls(value).length, [value]);

  // Auto-expand when results arrive
  useEffect(() => {
    if (result) {
      setIsOpen(true);
    }
  }, [result]);

  const handleSubmit = async () => {
    const urls = parseBatchUrls(value);
    if (urls.length === 0) return;
    await mutateAsync({ urls });
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
    <ContentSurfaceCard className='overflow-hidden'>
      <div className='p-0'>
        <button
          type='button'
          onClick={() => setIsOpen(open => !open)}
          className='flex w-full items-center gap-2 border-b border-subtle px-4 py-3 text-left'
        >
          <ChevronRight
            className={cn(
              'h-3.5 w-3.5 shrink-0 text-tertiary-token transition-transform duration-200',
              isOpen && 'rotate-90'
            )}
          />
          <span className='text-[13px] font-[510] text-primary-token'>
            Batch URL import
          </span>
          {summaryText && !isOpen && (
            <span className='ml-auto text-[11px] text-tertiary-token'>
              {summaryText}
            </span>
          )}
        </button>
      </div>
      <AnimatedAccordion isOpen={isOpen}>
        <div className='space-y-2 px-4 py-3'>
          <Textarea
            rows={4}
            value={value}
            onChange={event => setValue(event.target.value)}
            placeholder='https://linktr.ee/artistname
https://open.spotify.com/artist/...
https://www.instagram.com/artistname, https://artist-website.com'
          />
          <div className='flex flex-col gap-2 text-[11px] text-tertiary-token sm:flex-row sm:items-center sm:justify-between'>
            <span>
              {parsedCount} URL{parsedCount === 1 ? '' : 's'} parsed
            </span>
            <Button
              type='button'
              size='sm'
              onClick={handleSubmit}
              disabled={isPending}
              className='w-full sm:w-auto'
            >
              {isPending ? 'Ingesting\u2026' : 'Run batch import'}
            </Button>
          </div>

          {result && (
            <div className='space-y-2 rounded-[10px] border border-subtle bg-surface-0 p-3 text-[12px] text-secondary-token'>
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
                        {item.username ? ` \u2192 @${item.username}` : ''}
                        {item.reason ? ` (${item.reason})` : ''}
                      </span>
                    </li>
                  );
                })}
              </ul>
            </div>
          )}
        </div>
      </AnimatedAccordion>
    </ContentSurfaceCard>
  );
}
