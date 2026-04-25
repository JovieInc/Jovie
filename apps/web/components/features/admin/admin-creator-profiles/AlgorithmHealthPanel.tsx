'use client';

import { Badge } from '@jovie/ui';
import { Clock3, Link2, Sparkles, Waves } from 'lucide-react';
import Image from 'next/image';
import { type ReactNode, useMemo } from 'react';
import {
  DrawerEmptyState,
  DrawerSection,
  DrawerSurfaceCard,
} from '@/components/molecules/drawer';
import type { AdminCreatorProfileRow } from '@/lib/admin/types';
import { useAlgorithmHealthQuery } from '@/lib/queries';
import { extractSpotifyArtistId } from '@/lib/spotify/artist-id';
import type {
  AlgorithmHealthConfidence,
  AlgorithmHealthReport,
  AlgorithmHealthVerdictLabel,
  ScoredNeighbour,
} from '@/lib/spotify/scoring';
import type { Contact } from '@/types';

interface AlgorithmHealthPanelProps {
  readonly profile: AdminCreatorProfileRow;
  readonly contact: Contact;
  readonly isActive: boolean;
}

interface LinkCandidate {
  readonly url: string;
  readonly platform?: string | null;
  readonly platformType?: string | null;
}

export function AlgorithmHealthPanel({
  profile,
  contact,
  isActive,
}: Readonly<AlgorithmHealthPanelProps>) {
  const spotifyArtistId = useMemo(
    () => findSpotifyArtistId(profile, contact),
    [contact, profile]
  );
  const query = useAlgorithmHealthQuery(spotifyArtistId, isActive);

  if (!spotifyArtistId) {
    return (
      <DrawerSection title='Algorithm Health' collapsible={false}>
        <PanelEmptyState
          title='No Spotify Link'
          description='Add a Spotify artist link to this creator before running an algorithm diagnosis.'
          icon={<Link2 className='size-4' aria-hidden='true' />}
          testId='algorithm-health-no-spotify'
        />
      </DrawerSection>
    );
  }

  if (query.isLoading) {
    return (
      <DrawerSection title='Algorithm Health' collapsible={false}>
        <DrawerSurfaceCard
          variant='card'
          className='space-y-3 p-3'
          aria-busy
          testId='algorithm-health-loading'
        >
          <div className='h-4 w-32 animate-pulse rounded bg-surface-0' />
          <div className='h-8 w-3/4 animate-pulse rounded bg-surface-0' />
          <div className='h-4 w-full animate-pulse rounded bg-surface-0' />
        </DrawerSurfaceCard>
      </DrawerSection>
    );
  }

  if (query.isError || !query.data) {
    return (
      <DrawerSection title='Algorithm Health' collapsible={false}>
        <DrawerEmptyState
          message='Algorithm health could not be loaded right now.'
          tone='error'
          testId='algorithm-health-error'
        />
      </DrawerSection>
    );
  }

  const report = query.data;

  return (
    <div className='space-y-3' data-testid='admin-profile-algorithm-panel'>
      <DrawerSection title='Algorithm Health' collapsible={false}>
        <PrimarySummaryCard report={report} />
      </DrawerSection>

      <DrawerSection title='What This Means' surface='card' collapsible={false}>
        <BulletList items={buildMeaningBullets(report)} />
      </DrawerSection>

      <DrawerSection title='Next Actions' surface='card' collapsible={false}>
        <BulletList items={report.nextActions} />
      </DrawerSection>

      {report.warnings.length > 0 ? (
        <DrawerSection title='Warnings' surface='card' collapsible={false}>
          <BulletList items={report.warnings} tone='warning' />
        </DrawerSection>
      ) : null}

      {report.neighbours.length > 0 ? (
        <DrawerSection
          title='Compared Artists'
          surface='card'
          defaultOpen={false}
        >
          <div className='space-y-3' data-testid='algorithm-health-neighbours'>
            {report.neighbours.map(neighbour => (
              <NeighbourRow
                key={neighbour.artist.spotifyId}
                neighbour={neighbour}
              />
            ))}
          </div>
        </DrawerSection>
      ) : null}
    </div>
  );
}

function findSpotifyArtistId(
  profile: AdminCreatorProfileRow,
  contact: Contact
): string | null {
  const candidates: LinkCandidate[] = [
    ...contact.socialLinks.map(link => ({
      url: link.url,
      platform: link.platform ?? null,
      platformType: link.platformType ?? null,
    })),
    ...(profile.socialLinks ?? []).map(link => ({
      url: link.url,
      platform: link.platform,
      platformType: link.platformType,
    })),
  ];

  for (const link of candidates) {
    const looksLikeSpotify =
      link.platform === 'spotify' ||
      link.platformType === 'spotify' ||
      link.url.includes('open.spotify.com/artist/');

    if (!looksLikeSpotify) {
      continue;
    }

    const artistId = extractSpotifyArtistId(link.url);
    if (artistId) {
      return artistId;
    }
  }

  return null;
}

function PrimarySummaryCard({
  report,
}: Readonly<{ report: AlgorithmHealthReport }>) {
  const statusTitle =
    report.status === 'empty'
      ? 'No Comparable Artists'
      : report.verdict.headline;

  return (
    <DrawerSurfaceCard
      variant='card'
      className='space-y-3 p-3'
      testId='algorithm-health-summary'
    >
      <div className='flex flex-wrap items-center gap-2'>
        <Badge variant={getVerdictBadgeVariant(report.verdict.label)} size='sm'>
          {report.verdict.label}
        </Badge>
        <Badge
          variant={getConfidenceBadgeVariant(report.verdict.confidence)}
          size='sm'
        >
          {report.verdict.confidence} Confidence
        </Badge>
      </div>

      <div className='space-y-1'>
        <p className='text-sm font-semibold tracking-[-0.01em] text-primary-token'>
          {statusTitle}
        </p>
        <p className='text-xs leading-[18px] text-secondary-token'>
          {report.verdict.detail}
        </p>
      </div>

      <div className='grid gap-2 sm:grid-cols-3'>
        <MetricTile
          label='Last checked'
          value={formatCheckedAt(report.checkedAt)}
          icon={<Clock3 className='size-3.5' aria-hidden='true' />}
        />
        <MetricTile
          label='Resolved artists'
          value={`${report.resolvedNeighbourCount}/${report.attemptedNeighbourCount}`}
          icon={<Sparkles className='size-3.5' aria-hidden='true' />}
        />
        <MetricTile
          label='Health score'
          value={report.status === 'ready' ? `${report.healthScore}%` : 'N/A'}
          icon={<Waves className='size-3.5' aria-hidden='true' />}
        />
      </div>
    </DrawerSurfaceCard>
  );
}

function MetricTile({
  label,
  value,
  icon,
}: Readonly<{ label: string; value: string; icon: ReactNode }>) {
  return (
    <div className='rounded-xl bg-surface-0 px-3 py-2'>
      <div className='flex items-center gap-1.5 text-2xs text-tertiary-token'>
        {icon}
        <span>{label}</span>
      </div>
      <p className='mt-1 text-xs font-semibold text-primary-token'>{value}</p>
    </div>
  );
}

function PanelEmptyState({
  title,
  description,
  icon,
  testId,
}: Readonly<{
  title: string;
  description: string;
  icon: ReactNode;
  testId: string;
}>) {
  return (
    <DrawerSurfaceCard variant='card' className='space-y-2 p-3' testId={testId}>
      <div className='flex items-center gap-2 text-xs font-semibold text-primary-token'>
        {icon}
        <span>{title}</span>
      </div>
      <p className='text-xs leading-[18px] text-secondary-token'>
        {description}
      </p>
    </DrawerSurfaceCard>
  );
}

function BulletList({
  items,
  tone = 'default',
}: Readonly<{ items: readonly string[]; tone?: 'default' | 'warning' }>) {
  const itemCounts = new Map<string, number>();

  return (
    <ul className='space-y-2'>
      {items.map(item => {
        const duplicateCount = itemCounts.get(item) ?? 0;
        itemCounts.set(item, duplicateCount + 1);

        return (
          <li
            key={`${tone}-${item}-${duplicateCount}`}
            className='flex items-start gap-2 text-xs leading-[18px]'
          >
            <span
              className={`mt-1 size-1.5 rounded-full ${tone === 'warning' ? 'bg-warning' : 'bg-secondary-token'}`}
              aria-hidden='true'
            />
            <span
              className={
                tone === 'warning' ? 'text-warning' : 'text-secondary-token'
              }
            >
              {item}
            </span>
          </li>
        );
      })}
    </ul>
  );
}

function NeighbourRow({ neighbour }: Readonly<{ neighbour: ScoredNeighbour }>) {
  return (
    <div className='flex items-center gap-3 rounded-xl bg-surface-0 px-3 py-2'>
      {neighbour.artist.imageUrl ? (
        <Image
          src={neighbour.artist.imageUrl}
          alt={neighbour.artist.name}
          width={40}
          height={40}
          className='size-10 rounded-full object-cover'
          unoptimized
        />
      ) : (
        <div className='flex size-10 items-center justify-center rounded-full bg-surface-1 text-2xs text-secondary-token'>
          ?
        </div>
      )}

      <div className='min-w-0 flex-1'>
        <div className='flex flex-wrap items-center gap-1.5'>
          <p className='truncate text-xs font-semibold text-primary-token'>
            {neighbour.artist.name}
          </p>
          <Badge variant={getSizeBadgeVariant(neighbour.size)} size='sm'>
            {capitalizeWord(neighbour.size)}
          </Badge>
        </div>
        <p className='mt-1 text-2xs leading-[16px] text-secondary-token'>
          Pop {neighbour.artist.popularity} (
          {formatDelta(neighbour.popularityDelta)}) ·{' '}
          {neighbour.artist.followerCount.toLocaleString()} followers ·{' '}
          {Math.round(neighbour.genreOverlap * 100)}% genre overlap
        </p>
      </div>
    </div>
  );
}

function buildMeaningBullets(report: AlgorithmHealthReport): string[] {
  if (report.status === 'unavailable') {
    return [
      'Spotify did not expose a usable related-artists response for this creator.',
      'Treat this as a source outage rather than a performance signal.',
    ];
  }

  if (report.status === 'empty') {
    return [
      'Spotify returned no usable comparable artists, so this is not a reliable positioning read.',
      `Confidence is ${report.verdict.confidence.toLowerCase()} because only ${report.resolvedNeighbourCount} artists were resolved from ${report.attemptedNeighbourCount} attempts.`,
    ];
  }

  let ratioSummary: string;
  if (report.summary.bigger > report.summary.smaller) {
    ratioSummary = 'More resolved neighbours are bigger than the target.';
  } else if (report.summary.bigger === report.summary.smaller) {
    ratioSummary =
      'The resolved neighbour mix is balanced between larger and smaller artists.';
  } else {
    ratioSummary = 'More resolved neighbours are smaller than the target.';
  }

  return [
    ratioSummary,
    `Confidence is ${report.verdict.confidence.toLowerCase()} because ${report.resolvedNeighbourCount} of ${report.attemptedNeighbourCount} related artists were resolved cleanly.`,
  ];
}

function getVerdictBadgeVariant(label: AlgorithmHealthVerdictLabel) {
  switch (label) {
    case 'Healthy':
      return 'success';
    case 'Mixed':
      return 'warning';
    case 'Weak':
      return 'destructive';
    case 'Unavailable':
    default:
      return 'secondary';
  }
}

function getConfidenceBadgeVariant(confidence: AlgorithmHealthConfidence) {
  switch (confidence) {
    case 'High':
      return 'success';
    case 'Medium':
      return 'warning';
    case 'Low':
    default:
      return 'secondary';
  }
}

function getSizeBadgeVariant(size: ScoredNeighbour['size']) {
  switch (size) {
    case 'BIGGER':
      return 'success';
    case 'SIMILAR':
      return 'warning';
    case 'SMALLER':
    default:
      return 'destructive';
  }
}

function formatCheckedAt(value: string): string {
  return new Intl.DateTimeFormat(undefined, {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  }).format(new Date(value));
}

function formatDelta(value: number): string {
  const sign = value > 0 ? '+' : '';
  return `${sign}${value.toLocaleString()}`;
}

function capitalizeWord(value: string): string {
  return value.charAt(0) + value.slice(1).toLowerCase();
}
