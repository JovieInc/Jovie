'use client';

import { Button } from '@jovie/ui';
import { Check, Copy, ExternalLink, Share2 } from 'lucide-react';
import { useState } from 'react';
import { toast } from '@/components/feedback';
import {
  type LibraryShareExpiryPreset,
  resolveLibraryShareExpiryIso,
} from '@/lib/library-share/expiry';

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
  const [expiryPreset, setExpiryPreset] =
    useState<LibraryShareExpiryPreset>('never');
  const [passphrase, setPassphrase] = useState('');
  const [loading, setLoading] = useState(false);
  const [createdUrl, setCreatedUrl] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  async function copyShareUrl(url: string) {
    try {
      await globalThis.navigator?.clipboard?.writeText(url);
      setCopied(true);
      toast.success('Share link copied');
      globalThis.setTimeout?.(() => setCopied(false), 2000);
    } catch {
      toast.error('Could not copy link');
    }
  }

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
          expiresAt: resolveLibraryShareExpiryIso(expiryPreset),
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

      setCreatedUrl(body.shareUrl);
      await copyShareUrl(body.shareUrl);
      onCreated?.(body.shareUrl);
    } catch (error) {
      const messageText =
        error instanceof Error ? error.message : 'Failed to create share drop';
      toast.error(messageText);
    } finally {
      setLoading(false);
    }
  }

  if (createdUrl) {
    return (
      <div
        className='rounded-2xl border border-subtle bg-surface-0 p-4'
        data-testid='library-share-created-panel'
      >
        <p className='text-sm font-semibold text-primary-token'>
          Share drop ready
        </p>
        <p className='mt-1 text-xs text-secondary-token'>
          Anyone with this link can view the press kit.
        </p>
        <div className='mt-3 flex items-center gap-1.5 rounded-xl border border-subtle bg-surface-1 p-1 pl-3'>
          <span
            className='min-w-0 flex-1 truncate text-xs text-primary-token'
            title={createdUrl}
            data-testid='library-share-created-url'
          >
            {createdUrl}
          </span>
          <Button
            type='button'
            variant='outline'
            size='sm'
            onClick={() => {
              copyShareUrl(createdUrl).catch(() => {});
            }}
            aria-label='Copy Share Link'
            className='h-7 shrink-0 gap-1 rounded-lg px-2 text-xs font-medium normal-case'
            data-testid='library-share-copy-button'
          >
            {copied ? (
              <Check className='h-3.5 w-3.5' strokeWidth={2.25} />
            ) : (
              <Copy className='h-3.5 w-3.5' strokeWidth={2.25} />
            )}
            {copied ? 'Copied' : 'Copy'}
          </Button>
          <a
            href={createdUrl}
            target='_blank'
            rel='noopener noreferrer'
            aria-label='Open Share Link In New Tab'
            className='inline-flex h-7 shrink-0 items-center gap-1 rounded-lg border border-subtle px-2 text-xs font-medium text-primary-token transition-colors hover:bg-surface-2'
            data-testid='library-share-open-button'
          >
            <ExternalLink className='h-3.5 w-3.5' strokeWidth={2.25} />
            Open
          </a>
        </div>
        <Button
          type='button'
          variant='link'
          size='sm'
          onClick={() => {
            setCreatedUrl(null);
            setCopied(false);
            setOpen(false);
          }}
          className='mt-3 h-auto p-0 text-xs font-medium text-secondary-token normal-case hover:text-primary-token'
          data-testid='library-share-done-button'
        >
          Done
        </Button>
      </div>
    );
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
          Expires
          <select
            value={expiryPreset}
            onChange={event =>
              setExpiryPreset(event.target.value as LibraryShareExpiryPreset)
            }
            className='mt-1 w-full rounded-xl border border-subtle bg-surface-1 px-3 py-2 text-sm text-primary-token'
            data-testid='library-share-expiry-select'
          >
            <option value='never'>Never</option>
            <option value='7d'>7 days</option>
            <option value='30d'>30 days</option>
            <option value='90d'>90 days</option>
          </select>
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
          className='rounded-xl border border-(--linear-btn-primary-border) bg-btn-primary px-4 py-2 text-sm font-medium text-btn-primary-foreground shadow-button-inset transition-colors hover:border-(--linear-btn-primary-hover) hover:bg-btn-primary-hover disabled:opacity-50'
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
