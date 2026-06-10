'use client';

import { Share2 } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';

interface LibraryShareDropCreatorProps {
  readonly releaseIds: readonly string[];
  readonly defaultTitle: string;
  readonly onCreated?: (shareUrl: string) => void;
}

export function LibraryShareDropCreator({
  releaseIds,
  defaultTitle,
  onCreated,
}: LibraryShareDropCreatorProps) {
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState(defaultTitle);
  const [message, setMessage] = useState('');
  const [layout, setLayout] = useState<'grid' | 'list' | 'reel'>('grid');
  const [downloadsEnabled, setDownloadsEnabled] = useState(true);
  const [passphrase, setPassphrase] = useState('');
  const [loading, setLoading] = useState(false);

  async function handleCreate() {
    setLoading(true);
    try {
      const response = await fetch('/api/library/share-drops', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title,
          message: message.trim() || null,
          layout,
          downloadsEnabled,
          passphrase: passphrase.trim() || null,
          releaseIds,
        }),
      });
      const body = (await response.json()) as {
        readonly shareUrl?: string;
        readonly error?: string;
      };

      if (!response.ok || !body.shareUrl) {
        throw new Error(body.error ?? 'Failed to create share drop');
      }

      await globalThis.navigator?.clipboard?.writeText(body.shareUrl);
      toast.success('Share link copied');
      onCreated?.(body.shareUrl);
      setOpen(false);
    } catch (error) {
      const messageText =
        error instanceof Error ? error.message : 'Failed to create share drop';
      toast.error(messageText);
    } finally {
      setLoading(false);
    }
  }

  if (!open) {
    return (
      <button
        type='button'
        onClick={() => setOpen(true)}
        className='inline-flex items-center gap-1.5 rounded-full border border-subtle px-3 py-1.5 text-xs font-medium text-primary-token transition-colors hover:bg-surface-1'
        data-testid='library-share-create-trigger'
      >
        <Share2 className='h-3.5 w-3.5' strokeWidth={2.25} />
        Share drop
      </button>
    );
  }

  return (
    <div
      className='rounded-2xl border border-subtle bg-surface-0 p-4'
      data-testid='library-share-create-panel'
    >
      <p className='text-sm font-semibold text-primary-token'>
        Create share drop
      </p>
      <p className='mt-1 text-xs text-secondary-token'>
        Send a branded press-kit page with {releaseIds.length} selected asset
        {releaseIds.length === 1 ? '' : 's'}.
      </p>
      <div className='mt-4 space-y-3'>
        <label className='block text-xs font-medium text-secondary-token'>
          Title
          <input
            value={title}
            onChange={event => setTitle(event.target.value)}
            className='mt-1 w-full rounded-xl border border-subtle bg-surface-1 px-3 py-2 text-sm text-primary-token'
          />
        </label>
        <label className='block text-xs font-medium text-secondary-token'>
          Comment
          <textarea
            value={message}
            onChange={event => setMessage(event.target.value)}
            rows={3}
            className='mt-1 w-full rounded-xl border border-subtle bg-surface-1 px-3 py-2 text-sm text-primary-token'
            placeholder='Optional note for press or label review'
          />
        </label>
        <label className='block text-xs font-medium text-secondary-token'>
          Layout
          <select
            value={layout}
            onChange={event =>
              setLayout(event.target.value as 'grid' | 'list' | 'reel')
            }
            className='mt-1 w-full rounded-xl border border-subtle bg-surface-1 px-3 py-2 text-sm text-primary-token'
          >
            <option value='grid'>Grid</option>
            <option value='list'>List</option>
            <option value='reel'>Reel</option>
          </select>
        </label>
        <label className='flex items-center gap-2 text-xs text-secondary-token'>
          <input
            type='checkbox'
            checked={downloadsEnabled}
            onChange={event => setDownloadsEnabled(event.target.checked)}
          />
          Allow downloads
        </label>
        <label className='block text-xs font-medium text-secondary-token'>
          Passphrase (optional)
          <input
            type='password'
            value={passphrase}
            onChange={event => setPassphrase(event.target.value)}
            className='mt-1 w-full rounded-xl border border-subtle bg-surface-1 px-3 py-2 text-sm text-primary-token'
            placeholder='Leave blank for public access'
          />
        </label>
      </div>
      <div className='mt-4 flex items-center gap-2'>
        <button
          type='button'
          disabled={loading || title.trim().length === 0}
          onClick={() => {
            handleCreate().catch(() => {});
          }}
          className='rounded-xl bg-primary-token px-4 py-2 text-sm font-medium text-inverse-token disabled:opacity-50'
        >
          {loading ? 'Creating…' : 'Create link'}
        </button>
        <button
          type='button'
          onClick={() => setOpen(false)}
          className='rounded-xl border border-subtle px-4 py-2 text-sm text-secondary-token'
        >
          Cancel
        </button>
      </div>
    </div>
  );
}
