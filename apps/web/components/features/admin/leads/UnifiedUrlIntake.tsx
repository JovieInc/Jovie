'use client';

import { Button, Textarea } from '@jovie/ui';
import { Loader2, Upload } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';
import { ContentSectionHeader } from '@/components/molecules/ContentSectionHeader';
import { ContentSurfaceCard } from '@/components/molecules/ContentSurfaceCard';
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
    <ContentSurfaceCard className='overflow-hidden'>
      <ContentSectionHeader
        title='Unified URL intake'
        subtitle='Paste Linktree, Spotify, Instagram, Apple Music, or site URLs for one shared queue.'
        className='min-h-0 px-(--linear-app-header-padding-x) py-3'
      />
      <div className='space-y-3 px-(--linear-app-content-padding-x) py-(--linear-app-content-padding-y)'>
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
    </ContentSurfaceCard>
  );
}
