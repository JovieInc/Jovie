'use client';

import { Button } from '@jovie/ui';
import Image from 'next/image';
import { useEffect, useState } from 'react';
import { toast } from '@/components/feedback';
import type {
  LibraryRelationshipView,
  YouTubeOptimizationSnapshot,
} from '@/lib/library/track-drawer-types';

export type LibraryMerchProductOption = {
  readonly id: string;
  readonly title: string;
};

const COPY = 'system-b-library-drawer-panel-copy';

function isMerchTag(
  relationship: LibraryRelationshipView,
  videoId: string,
  merchCardId?: string
) {
  return (
    relationship.kind === 'features_merch' &&
    relationship.subjectType === 'youtube_video' &&
    relationship.subjectId === videoId &&
    relationship.objectType === 'merch_product' &&
    (merchCardId === undefined || relationship.objectId === merchCardId)
  );
}

export function YouTubeMerchRelationshipEditor({
  profileId,
  videoId,
  merchProducts,
  relationships,
  disabled,
}: {
  readonly profileId: string | null;
  readonly videoId: string;
  readonly merchProducts: readonly LibraryMerchProductOption[];
  readonly relationships: readonly LibraryRelationshipView[];
  readonly disabled: boolean;
}) {
  const [localRelationships, setLocalRelationships] = useState(relationships);
  const [selectedMerchId, setSelectedMerchId] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  useEffect(() => setLocalRelationships(relationships), [relationships]);
  const tagged = localRelationships.filter(
    relationship =>
      relationship.status === 'active' && isMerchTag(relationship, videoId)
  );
  const taggedIds = new Set(tagged.map(relationship => relationship.objectId));
  const available = merchProducts.filter(product => !taggedIds.has(product.id));

  const updateTag = async (method: 'POST' | 'DELETE', merchCardId: string) => {
    if (!profileId) return;
    setIsSaving(true);
    try {
      const response = await fetch('/api/library/relationships', {
        method,
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          creatorProfileId: profileId,
          videoId,
          merchCardId,
        }),
      });
      const result = (await response.json()) as {
        relationship?: LibraryRelationshipView;
        error?: string;
      };
      if (!response.ok || (method === 'POST' && !result.relationship)) {
        throw new Error(result.error ?? 'Relationship could not be saved');
      }
      setLocalRelationships(current => {
        const next = current.filter(
          relationship => !isMerchTag(relationship, videoId, merchCardId)
        );
        return method === 'POST' && result.relationship
          ? [...next, result.relationship]
          : next;
      });
      if (method === 'POST') setSelectedMerchId('');
      toast.success(
        method === 'POST' ? 'Merch tagged in video' : 'Merch tag removed'
      );
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : 'Relationship could not be saved'
      );
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className='space-y-3' data-testid='library-drawer-relationships'>
      <p className={`${COPY} leading-5 text-secondary-token`}>
        Tag products worn or featured in this video.
      </p>
      {tagged.length === 0 ? (
        <p className={`${COPY} text-tertiary-token`}>No merch tagged yet.</p>
      ) : (
        tagged.map(relationship => (
          <div
            key={relationship.id}
            className='flex min-h-8 items-center justify-between gap-2 bg-surface-0 px-2'
          >
            <span className={`${COPY} truncate text-primary-token`}>
              {merchProducts.find(item => item.id === relationship.objectId)
                ?.title ?? 'Merch product'}
            </span>
            <Button
              type='button'
              size='sm'
              variant='ghost'
              disabled={disabled || isSaving}
              onClick={() => void updateTag('DELETE', relationship.objectId)}
            >
              Remove
            </Button>
          </div>
        ))
      )}
      {available.length > 0 ? (
        <div className='flex items-center gap-2'>
          <select
            className={`${COPY} h-8 min-w-0 flex-1 bg-surface-0 px-2 text-primary-token`}
            value={selectedMerchId}
            disabled={disabled || isSaving}
            onChange={event => setSelectedMerchId(event.target.value)}
          >
            <option value=''>Choose merch</option>
            {available.map(product => (
              <option key={product.id} value={product.id}>
                {product.title}
              </option>
            ))}
          </select>
          <Button
            type='button'
            size='sm'
            variant='secondary'
            disabled={disabled || isSaving || !selectedMerchId}
            onClick={() => void updateTag('POST', selectedMerchId)}
          >
            Tag
          </Button>
        </div>
      ) : null}
    </div>
  );
}

export function YouTubeOptimizationPanel({
  profileId,
  videoId,
  disabled,
}: {
  readonly profileId: string | null;
  readonly videoId: string;
  readonly disabled: boolean;
}) {
  const [snapshot, setSnapshot] = useState<YouTubeOptimizationSnapshot | null>(
    null
  );
  const [loadState, setLoadState] = useState<
    'idle' | 'loading' | 'loaded' | 'error'
  >('idle');

  useEffect(() => {
    if (!profileId || disabled) return;
    const abortController = new AbortController();
    setLoadState('loading');
    fetch(
      `/api/youtube-library/videos/${encodeURIComponent(videoId)}/optimization?creatorProfileId=${encodeURIComponent(profileId)}`,
      { signal: abortController.signal }
    )
      .then(async response => {
        const result = (await response.json()) as {
          snapshot?: YouTubeOptimizationSnapshot;
        };
        if (!response.ok || !result.snapshot) {
          throw new Error('Optimization history could not be loaded');
        }
        setSnapshot(result.snapshot);
        setLoadState('loaded');
      })
      .catch(error => {
        if (!(error instanceof DOMException && error.name === 'AbortError')) {
          setLoadState('error');
        }
      });
    return () => abortController.abort();
  }, [disabled, profileId, videoId]);

  const latest = snapshot?.metrics[0];

  return (
    <div
      className='min-h-32 space-y-3'
      data-testid='library-drawer-optimization'
    >
      {loadState === 'loaded' && snapshot ? (
        <>
          {snapshot.thumbnails.length === 0 ? (
            <p className={`${COPY} text-tertiary-token`}>
              No thumbnail history yet.
            </p>
          ) : (
            <div className='grid grid-cols-3 gap-2'>
              {snapshot.thumbnails.slice(0, 6).map(thumbnail => (
                <div key={thumbnail.id} className='space-y-1'>
                  <Image
                    src={thumbnail.imageUrl}
                    alt=''
                    width={160}
                    height={90}
                    unoptimized
                    className='aspect-video w-full bg-surface-0 object-contain'
                  />
                </div>
              ))}
            </div>
          )}
          {snapshot.experiments.length === 0 ? (
            <p className={`${COPY} text-tertiary-token`}>
              No test is running. Candidates remain proposals until a measured
              winner is explicitly accepted.
            </p>
          ) : (
            snapshot.experiments.map(experiment => (
              <div key={experiment.id} className='bg-surface-0 px-2 py-1.5'>
                <div
                  className={`${COPY} flex items-center justify-between gap-2`}
                >
                  <span className='truncate text-primary-token'>
                    {experiment.objective}
                  </span>
                  <span className='shrink-0 text-tertiary-token'>
                    {experiment.status}
                  </span>
                </div>
                {experiment.winnerVariantKey ? (
                  <p className='system-b-library-status-bar mt-1 text-success'>
                    Winner - {experiment.winnerVariantKey}
                  </p>
                ) : null}
              </div>
            ))
          )}
          {latest ? (
            <p className={`${COPY} text-secondary-token`}>
              {latest.window}: {latest.views?.toLocaleString() ?? 'Unavailable'}{' '}
              views
              {latest.watchTimeMinutes === null
                ? ''
                : `, ${Math.round(latest.watchTimeMinutes)} min watch`}
            </p>
          ) : null}
        </>
      ) : (
        <p
          className={`${COPY} ${loadState === 'error' ? 'text-destructive' : 'text-secondary-token'}`}
        >
          {loadState === 'error'
            ? 'Optimization history could not be loaded.'
            : 'Loading test history...'}
        </p>
      )}
    </div>
  );
}
