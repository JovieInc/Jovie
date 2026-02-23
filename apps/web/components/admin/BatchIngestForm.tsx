'use client';

import {
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  Textarea,
} from '@jovie/ui';
import { useMemo, useState } from 'react';
import { useNotifications } from '@/lib/hooks/useNotifications';

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

export function BatchIngestForm({
  onComplete,
}: Readonly<BatchIngestFormProps>) {
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

  return (
    <Card>
      <CardHeader>
        <CardTitle className='text-base'>Batch Spotify ingest</CardTitle>
      </CardHeader>
      <CardContent className='space-y-3'>
        <Textarea
          rows={7}
          value={value}
          onChange={event => setValue(event.target.value)}
          placeholder='https://open.spotify.com/artist/...
https://open.spotify.com/artist/...
4Z8W4fKeB5YxbusRsdQVPb'
        />
        <div className='flex items-center justify-between text-xs text-tertiary-token'>
          <span>
            {parsedCount} artist {parsedCount === 1 ? 'URL' : 'URLs'} parsed
          </span>
          <Button
            type='button'
            size='sm'
            onClick={handleSubmit}
            disabled={isSubmitting}
          >
            {isSubmitting ? 'Ingesting…' : 'Run batch ingest'}
          </Button>
        </div>

        {result && (
          <div className='space-y-2 rounded-md border border-subtle p-3 text-xs'>
            <p>
              Results: {result.summary.success} created ·{' '}
              {result.summary.skipped} skipped · {result.summary.error} errors
            </p>
            <ul className='max-h-52 space-y-1 overflow-y-auto'>
              {result.results.map(item => (
                <li key={`${item.input}-${item.status}`}>
                  <span className='font-medium'>
                    {item.status.toUpperCase()}
                  </span>{' '}
                  — {item.input}
                  {item.username ? ` → @${item.username}` : ''}
                  {item.reason ? ` (${item.reason})` : ''}
                </li>
              ))}
            </ul>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
