'use client';

import { Button, Textarea } from '@jovie/ui';
import { Loader2, Upload } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';
import { useQueueLeadUrlsMutation } from '@/lib/queries';

interface UnifiedUrlIntakeProps {
  readonly onSubmitted?: () => void;
}

export function UnifiedUrlIntake({ onSubmitted }: UnifiedUrlIntakeProps) {
  const [input, setInput] = useState('');
  const queueUrlsMutation = useQueueLeadUrlsMutation();

  async function submitUrls() {
    const urls = input
      .split('\n')
      .map(url => url.trim())
      .filter(Boolean);

    if (urls.length === 0) {
      toast.error('Paste at least one URL to start intake');
      return;
    }

    try {
      const data = await queueUrlsMutation.mutateAsync(urls);
      toast.success(
        `Queued ${data.summary.created} URL${data.summary.created === 1 ? '' : 's'} (${data.summary.duplicate} duplicates, ${data.summary.invalid} invalid)`
      );
      setInput('');
      onSubmitted?.();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'URL intake failed');
    }
  }

  return (
    <section className='rounded-lg border border-subtle bg-surface-1 p-4 sm:p-6'>
      <h2 className='text-sm font-semibold text-primary-token'>
        Unified URL intake
      </h2>
      <p className='mt-1 text-xs text-secondary-token'>
        Paste Linktree, Spotify, Instagram, Apple Music, or website URLs. The
        pipeline classifies and queues them in one place.
      </p>
      <div className='mt-3 space-y-3'>
        <Textarea
          rows={5}
          value={input}
          onChange={event => setInput(event.target.value)}
          placeholder='https://linktr.ee/artist\nhttps://open.spotify.com/artist/...\nhttps://instagram.com/artist'
          className='text-xs'
        />
        <Button
          size='sm'
          onClick={() => void submitUrls()}
          disabled={queueUrlsMutation.isPending || input.trim().length === 0}
        >
          {queueUrlsMutation.isPending ? (
            <Loader2 className='mr-2 h-4 w-4 animate-spin' />
          ) : (
            <Upload className='mr-2 h-4 w-4' />
          )}
          Queue URLs
        </Button>
      </div>
    </section>
  );
}
