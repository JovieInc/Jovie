'use client';

import { Button } from '@jovie/ui';
import { ExternalLink } from 'lucide-react';
import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { toast } from '@/components/feedback';
import { DisclosureRow, InfoPopover } from '@/components/molecules/inspector';
import { buildReleaseDownloadsRoute } from '@/constants/routes';
import type {
  LibraryPostReleaseBundle,
  LibraryPresenceFindingView,
  LibraryRightsholderEvidenceView,
} from '@/lib/library/post-release-types';
import type { LibraryReleaseAsset } from './library-data';

const EVIDENCE_LABELS: Record<
  LibraryRightsholderEvidenceView['evidenceClass'],
  string
> = {
  attested: 'Attested',
  observed: 'Observed',
  claimed: 'Claimed',
};

function subjectIdsForAsset(asset: LibraryReleaseAsset): ReadonlySet<string> {
  return new Set(
    [asset.id, asset.source?.canonicalId, asset.linkedReleaseId].filter(
      (value): value is string => Boolean(value)
    )
  );
}

function findingsForAsset(
  asset: LibraryReleaseAsset,
  findings: readonly LibraryPresenceFindingView[]
): LibraryPresenceFindingView[] {
  const subjectIds = subjectIdsForAsset(asset);
  return findings.filter(
    finding =>
      (finding.status === 'open' || finding.status === 'drafted') &&
      (finding.subjectType === 'artist' || subjectIds.has(finding.subjectId))
  );
}

function rightsholdersForAsset(
  asset: LibraryReleaseAsset,
  rightsholders: readonly LibraryRightsholderEvidenceView[]
): LibraryRightsholderEvidenceView[] {
  const subjectIds = subjectIdsForAsset(asset);
  return rightsholders.filter(evidence => subjectIds.has(evidence.subjectId));
}

function releaseIdForAsset(asset: LibraryReleaseAsset): string | null {
  if (asset.linkedReleaseId) return asset.linkedReleaseId;
  return asset.source?.provider === 'discography'
    ? asset.source.canonicalId
    : null;
}

function PresenceFindingRow({
  creatorProfileId,
  finding,
  disabled,
  onChange,
}: {
  readonly creatorProfileId: string | null;
  readonly finding: LibraryPresenceFindingView;
  readonly disabled: boolean;
  readonly onChange: (finding: LibraryPresenceFindingView) => void;
}) {
  const [isSaving, setIsSaving] = useState(false);

  const applyAction = async (
    action:
      | 'prepare_update'
      | 'not_this_artist'
      | 'not_this_song'
      | 'confirmed_match'
  ) => {
    if (!creatorProfileId) return;
    setIsSaving(true);
    try {
      const response = await fetch('/api/library/post-release', {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          creatorProfileId,
          findingId: finding.id,
          action,
        }),
      });
      const result = (await response.json()) as {
        finding?: LibraryPresenceFindingView;
        error?: string;
      };
      if (!response.ok || !result.finding) {
        throw new Error(result.error ?? 'Repair could not be prepared');
      }
      onChange(result.finding);
      if (action === 'prepare_update') {
        if (finding.actionMode === 'draft_request') {
          toast.success('Request drafted. Nothing was sent.');
        } else {
          const destination = finding.currentUrl ?? finding.expectedUrl;
          if (destination) {
            globalThis.open(destination, '_blank', 'noopener,noreferrer');
          }
          toast.success('Opened the surface. The repair stays open.');
        }
      }
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : 'Repair could not be prepared'
      );
    } finally {
      setIsSaving(false);
    }
  };

  const isCollision = finding.kind === 'collision';

  return (
    <article
      className='border-t border-subtle py-2 first:border-t-0 first:pt-0'
      data-testid={`library-presence-finding-${finding.id}`}
    >
      <div className='flex items-start justify-between gap-3'>
        <div className='min-w-0'>
          <p className='truncate text-xs font-medium text-primary-token'>
            {finding.title}
          </p>
          <p className='mt-0.5 text-2xs text-tertiary-token'>
            {finding.platform}
            {finding.status === 'drafted' ? ' · Draft ready, not sent' : ''}
          </p>
        </div>
        {!isCollision ? (
          <Button
            type='button'
            size='sm'
            variant='secondary'
            disabled={disabled || isSaving}
            onClick={() => void applyAction('prepare_update')}
            className='shrink-0'
          >
            {finding.actionMode === 'draft_request' ? 'Draft' : 'Open'}
            {finding.actionMode === 'direct_update' ? (
              <ExternalLink className='ml-1 h-3 w-3' aria-hidden='true' />
            ) : null}
          </Button>
        ) : null}
      </div>
      {finding.draftRequest && finding.status === 'drafted' ? (
        <p className='mt-2 border border-subtle bg-surface-1 p-2 text-xs leading-5 text-secondary-token'>
          {finding.draftRequest}
        </p>
      ) : null}
      {isCollision ? (
        <div className='mt-2 flex flex-wrap gap-1.5'>
          <Button
            type='button'
            size='sm'
            variant='secondary'
            disabled={disabled || isSaving}
            onClick={() => void applyAction('not_this_artist')}
          >
            Not This Artist
          </Button>
          <Button
            type='button'
            size='sm'
            variant='secondary'
            disabled={disabled || isSaving}
            onClick={() => void applyAction('not_this_song')}
          >
            Not This Song
          </Button>
        </div>
      ) : null}
    </article>
  );
}

export function PostReleasePanel({
  asset,
  creatorProfileId,
  bundle,
  disabled,
}: {
  readonly asset: LibraryReleaseAsset;
  readonly creatorProfileId: string | null;
  readonly bundle: LibraryPostReleaseBundle;
  readonly disabled: boolean;
}) {
  const [findings, setFindings] = useState(bundle.findings);

  useEffect(() => {
    setFindings(bundle.findings);
  }, [bundle.findings]);

  const releaseId = releaseIdForAsset(asset);
  const downloads = useMemo(
    () =>
      releaseId
        ? bundle.downloads.filter(download => download.releaseId === releaseId)
        : [],
    [bundle.downloads, releaseId]
  );
  const relevantFindings = useMemo(
    () => findingsForAsset(asset, findings),
    [asset, findings]
  );
  const openFindingCount = relevantFindings.filter(
    finding => finding.status === 'open'
  ).length;
  const draftedFindingCount = relevantFindings.filter(
    finding => finding.status === 'drafted'
  ).length;
  const relevantRightsholders = useMemo(
    () => rightsholdersForAsset(asset, bundle.rightsholders),
    [asset, bundle.rightsholders]
  );
  const downloadFileLabel = downloads.length === 1 ? 'file' : 'files';
  const downloadsSummary =
    downloads.length > 0
      ? `${downloads.length} attested ${downloadFileLabel} live`
      : 'No attested download is live';

  const updateFinding = (next: LibraryPresenceFindingView) => {
    setFindings(current =>
      current.map(finding => (finding.id === next.id ? next : finding))
    );
  };

  return (
    <div className='space-y-4' data-testid='library-post-release-panel'>
      <section aria-labelledby='library-downloads-heading'>
        <div className='flex min-h-8 items-center justify-between gap-3'>
          <div className='min-w-0'>
            <div className='flex items-center gap-1'>
              <h3
                id='library-downloads-heading'
                className='text-xs font-semibold text-primary-token'
              >
                Downloads
              </h3>
              <InfoPopover label='About downloads'>
                Email gate to file to this content card. Only recordings with
                explicit full-control attestation can go live.
              </InfoPopover>
            </div>
            <p className='mt-0.5 text-2xs text-tertiary-token'>
              {downloadsSummary}
            </p>
          </div>
          {releaseId ? (
            <Button asChild size='sm' variant='secondary'>
              <Link
                href={buildReleaseDownloadsRoute(releaseId)}
                tabIndex={disabled ? -1 : undefined}
              >
                {downloads.length > 0 ? 'Manage' : 'Add download'}
              </Link>
            </Button>
          ) : null}
        </div>
      </section>

      <section className='border-t border-subtle pt-3' aria-label='Stats'>
        <h3 className='text-xs font-semibold text-primary-token'>Stats</h3>
        <div className='mt-2 grid min-h-14 grid-cols-2 gap-2'>
          {['DSP', 'Social'].map(label => (
            <div key={label} className='border border-subtle bg-surface-1 p-2'>
              <p className='text-2xs text-tertiary-token'>{label}</p>
              <p className='mt-1 text-xs font-medium text-secondary-token'>
                Not connected
              </p>
            </div>
          ))}
        </div>
      </section>

      <section
        className='border-t border-subtle pt-3'
        aria-labelledby='library-rightsholders-heading'
      >
        <div className='flex items-center gap-1'>
          <h3
            id='library-rightsholders-heading'
            className='text-xs font-semibold text-primary-token'
          >
            Rightsholders
          </h3>
          <InfoPopover label='About rightsholders'>
            Songview and MLC are public composition observations, not proof of
            master ownership. A file or email does not grant rights.
          </InfoPopover>
        </div>
        {relevantRightsholders.length > 0 ? (
          <div className='mt-2 space-y-1'>
            {relevantRightsholders.map(evidence => (
              <DisclosureRow
                key={evidence.id}
                label={evidence.partyName}
                summary={EVIDENCE_LABELS[evidence.evidenceClass]}
              >
                <p className='truncate text-2xs text-tertiary-token'>
                  {evidence.role} · {evidence.domain} · {evidence.source}
                </p>
              </DisclosureRow>
            ))}
          </div>
        ) : (
          <p className='mt-2 text-xs text-tertiary-token'>
            No rightsholder evidence recorded.
          </p>
        )}
      </section>

      <section
        className='border-t border-subtle pt-3'
        aria-labelledby='library-presence-heading'
      >
        <div className='flex items-center justify-between gap-3'>
          <h3
            id='library-presence-heading'
            className='text-xs font-semibold text-primary-token'
          >
            Presence
          </h3>
          <span className='text-2xs tabular-nums text-tertiary-token'>
            {openFindingCount} open
            {draftedFindingCount > 0 ? ` · ${draftedFindingCount} drafted` : ''}
          </span>
        </div>
        {relevantFindings.length > 0 ? (
          <div className='mt-2'>
            {relevantFindings.map(finding => (
              <PresenceFindingRow
                key={finding.id}
                creatorProfileId={creatorProfileId}
                finding={finding}
                disabled={disabled}
                onChange={updateFinding}
              />
            ))}
          </div>
        ) : (
          <p className='mt-2 text-xs text-tertiary-token'>
            No open repairs, collisions, or placement opportunities.
          </p>
        )}
      </section>
    </div>
  );
}
