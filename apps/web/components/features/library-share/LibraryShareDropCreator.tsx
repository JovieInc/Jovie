'use client';

import { Button } from '@jovie/ui';
import { Check, Copy, ExternalLink, Share2 } from 'lucide-react';
import { useMemo, useState } from 'react';
import { toast } from '@/components/feedback';
import {
  type LibraryShareExpiryPreset,
  resolveLibraryShareExpiryIso,
} from '@/lib/library-share/expiry';

export interface LibraryShareDropCandidate {
  readonly id: string;
  readonly title: string;
}

interface LibraryShareDropCreatorProps {
  /**
   * Default release ids to include. When `candidateAssets` is omitted these are
   * the fixed selection sent on create (legacy single-release path).
   */
  readonly releaseIds: readonly string[];
  /**
   * Optional release assets the artist can curate into the drop. When provided,
   * the create form exposes multi-select so press kits can include a set.
   */
  readonly candidateAssets?: readonly LibraryShareDropCandidate[];
  readonly defaultTitle: string;
  readonly onCreated?: (shareUrl: string) => void;
}

function uniqueIds(ids: readonly string[]): string[] {
  return [...new Set(ids.filter(Boolean))];
}

export function LibraryShareDropCreator({
  releaseIds,
  candidateAssets,
  defaultTitle,
  onCreated,
}: LibraryShareDropCreatorProps) {
  const candidates = useMemo(() => {
    // Explicit empty `candidateAssets` must stay empty (no phantom fallback ids).
    if (candidateAssets) {
      return candidateAssets;
    }
    return releaseIds.map(id => ({ id, title: defaultTitle }));
  }, [candidateAssets, defaultTitle, releaseIds]);

  const defaultSelectedIds = useMemo(() => {
    const preferred = uniqueIds(releaseIds).filter(id =>
      candidates.some(candidate => candidate.id === id)
    );
    if (preferred.length > 0) return preferred;
    return candidates[0] ? [candidates[0].id] : [];
  }, [candidates, releaseIds]);

  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState(defaultTitle);
  const [includeComment, setIncludeComment] = useState(false);
  const [message, setMessage] = useState('');
  const [layout, setLayout] = useState<'grid' | 'list' | 'reel'>('grid');
  const [downloadsEnabled, setDownloadsEnabled] = useState(true);
  const [expiryPreset, setExpiryPreset] =
    useState<LibraryShareExpiryPreset>('never');
  const [passphrase, setPassphrase] = useState('');
  const [selectedIds, setSelectedIds] =
    useState<readonly string[]>(defaultSelectedIds);
  const [loading, setLoading] = useState(false);
  const [createdUrl, setCreatedUrl] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const selectedCount = selectedIds.length;
  const showAssetPicker = candidates.length > 1;

  function toggleAsset(id: string) {
    setSelectedIds(current => {
      if (current.includes(id)) {
        // Keep at least one asset selected to avoid an empty create path.
        if (current.length === 1) return current;
        return current.filter(item => item !== id);
      }
      return [...current, id];
    });
  }

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
    const releaseIdsToShare = uniqueIds(selectedIds);
    if (releaseIdsToShare.length === 0) {
      toast.error('Select at least one asset');
      return;
    }

    setLoading(true);
    try {
      const response = await fetch('/api/library/share-drops', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title,
          message:
            includeComment && message.trim().length > 0 ? message.trim() : null,
          layout,
          downloadsEnabled,
          expiresAt: resolveLibraryShareExpiryIso(expiryPreset),
          passphrase: passphrase.trim() || null,
          releaseIds: releaseIdsToShare,
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
          Anyone with this link can view the press kit
          {selectedCount > 1 ? ` (${selectedCount} assets)` : ''}.
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
            setSelectedIds(defaultSelectedIds);
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
        onClick={() => {
          setSelectedIds(defaultSelectedIds);
          setOpen(true);
        }}
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
        Send a branded press-kit page with {selectedCount} selected asset
        {selectedCount === 1 ? '' : 's'}.
      </p>
      <div className='mt-4 space-y-3'>
        {showAssetPicker ? (
          <fieldset
            className='space-y-2'
            data-testid='library-share-asset-picker'
          >
            <legend className='text-xs font-medium text-secondary-token'>
              Assets
            </legend>
            <div className='max-h-40 space-y-1 overflow-y-auto rounded-xl border border-subtle bg-surface-1 p-2'>
              {candidates.map(candidate => {
                const checked = selectedIds.includes(candidate.id);
                return (
                  <label
                    key={candidate.id}
                    className='flex cursor-pointer items-center gap-2 rounded-lg px-2 py-1.5 text-xs text-primary-token transition-colors hover:bg-surface-0'
                  >
                    <input
                      type='checkbox'
                      checked={checked}
                      onChange={() => toggleAsset(candidate.id)}
                      data-testid={`library-share-asset-${candidate.id}`}
                    />
                    <span className='min-w-0 truncate'>{candidate.title}</span>
                  </label>
                );
              })}
            </div>
          </fieldset>
        ) : null}
        <label className='block text-xs font-medium text-secondary-token'>
          Title
          <input
            value={title}
            onChange={event => setTitle(event.target.value)}
            className='mt-1 w-full rounded-xl border border-subtle bg-surface-1 px-3 py-2 text-sm text-primary-token'
          />
        </label>
        <label className='flex items-center gap-2 text-xs text-secondary-token'>
          <input
            type='checkbox'
            checked={includeComment}
            onChange={event => setIncludeComment(event.target.checked)}
            data-testid='library-share-comment-toggle'
            aria-controls='library-share-comment-input'
          />
          Include Comment
        </label>
        {/*
          Always reserve the comment field height so toggling does not shift
          the Create/Cancel row (layout-shift rule).
        */}
        <label
          className={
            includeComment
              ? 'block text-xs font-medium text-secondary-token'
              : 'block text-xs font-medium text-secondary-token opacity-50'
          }
        >
          Comment
          <textarea
            id='library-share-comment-input'
            value={message}
            onChange={event => setMessage(event.target.value)}
            rows={3}
            disabled={!includeComment}
            className='mt-1 w-full rounded-xl border border-subtle bg-surface-1 px-3 py-2 text-sm text-primary-token disabled:cursor-not-allowed'
            placeholder='Optional note for press or label review'
            data-testid='library-share-comment-input'
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
            data-testid='library-share-layout-select'
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
            data-testid='library-share-downloads-toggle'
          />
          Allow Downloads
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
            data-testid='library-share-passphrase-input'
          />
        </label>
      </div>
      <div className='mt-4 flex items-center gap-2'>
        <button
          type='button'
          disabled={loading || title.trim().length === 0 || selectedCount === 0}
          onClick={() => {
            handleCreate().catch(() => {});
          }}
          className='rounded-xl border border-(--linear-btn-primary-border) bg-btn-primary px-4 py-2 text-sm font-medium text-btn-primary-foreground shadow-button-inset transition-colors hover:border-(--linear-btn-primary-hover) hover:bg-btn-primary-hover disabled:opacity-50'
          data-testid='library-share-create-submit'
        >
          {loading ? 'Creating…' : 'Create link'}
        </button>
        <button
          type='button'
          onClick={() => setOpen(false)}
          className='rounded-xl border border-subtle px-4 py-2 text-sm text-secondary-token'
          data-testid='library-share-create-cancel'
        >
          Cancel
        </button>
      </div>
    </div>
  );
}
