'use client';

import { Button, Textarea } from '@jovie/ui';
import { Loader2, Upload } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';
import { ContentSectionHeader } from '@/components/molecules/ContentSectionHeader';
import { ContentSurfaceCard } from '@/components/molecules/ContentSurfaceCard';

interface UnifiedUrlIntakeProps {
  readonly onSubmitted?: () => void;
}

export function UnifiedUrlIntake({ onSubmitted }: UnifiedUrlIntakeProps) {
  const [input, setInput] = useState('');
  const [submitting, setSubmitting] = useState(false);

  async function submitUrls() {
    const urls = input
      .split('\n')
      .map(url => url.trim())
      .filter(Boolean);

    if (urls.length === 0) {
      toast.error('Paste at least one URL to start intake');
      return;
    }

    setSubmitting(true);
    try {
      const res = await fetch('/api/admin/leads', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ urls }),
      });

      const data = (await res.json()) as {
        summary?: { created: number; duplicate: number; invalid: number };
        error?: string;
      };

      if (!res.ok) {
        throw new Error(data.error ?? 'Failed to process URLs');
      }

      toast.success(
        `Queued ${data.summary?.created ?? 0} URL${data.summary?.created === 1 ? '' : 's'} (${data.summary?.duplicate ?? 0} duplicates, ${data.summary?.invalid ?? 0} invalid)`
      );
      setInput('');
      onSubmitted?.();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'URL intake failed');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <ContentSurfaceCard as='section' className='overflow-hidden p-0'>
      <ContentSectionHeader
        title='Unified URL intake'
        subtitle='Paste Linktree, Spotify, Instagram, Apple Music, or website URLs. The pipeline classifies and queues them in one place.'
        className='px-5 py-3'
      />
      <div className='space-y-3 px-5 py-4'>
        <Textarea
          rows={5}
          value={input}
          onChange={event => setInput(event.target.value)}
          placeholder='https://linktr.ee/artist\nhttps://open.spotify.com/artist/...\nhttps://instagram.com/artist'
          className='text-xs'
        />
        <div className='flex justify-end'>
          <Button
            size='sm'
            onClick={() => void submitUrls()}
            disabled={submitting || input.trim().length === 0}
          >
            {submitting ? (
              <Loader2 className='mr-2 h-4 w-4 animate-spin' />
            ) : (
              <Upload className='mr-2 h-4 w-4' />
            )}
            Queue URLs
          </Button>
        </div>
      </div>
    </ContentSurfaceCard>
  );
}
