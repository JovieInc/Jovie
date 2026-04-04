'use client';

import { Badge, Button, Input } from '@jovie/ui';
import Image from 'next/image';
import type { FormEvent } from 'react';
import { useState } from 'react';
import { ContentSurfaceCard } from '@/components/molecules/ContentSurfaceCard';
import type {
  AlgorithmHealthReport,
  AuthenticityLevel,
  NeighbourSize,
  ScoredNeighbour,
} from '@/lib/spotify/scoring';
import { TIM_WHITE_PROFILE } from '@/lib/tim-white';

interface AlgorithmHealthWorkspaceProps {
  readonly fixtureReport?: AlgorithmHealthReport | null;
}

export function AlgorithmHealthWorkspace({
  fixtureReport = null,
}: Readonly<AlgorithmHealthWorkspaceProps>) {
  const [artistId, setArtistId] = useState<string>(
    TIM_WHITE_PROFILE.spotifyArtistId
  );
  const [report, setReport] = useState<AlgorithmHealthReport | null>(
    fixtureReport
  );
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function analyse() {
    const normalizedArtistId = artistId.trim();
    if (!normalizedArtistId) {
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const response = await fetch(
        `/api/spotify/fal-analysis?artistId=${encodeURIComponent(normalizedArtistId)}`
      );

      if (!response.ok) {
        const data = (await response.json().catch(() => ({}))) as {
          error?: string;
        };
        throw new Error(
          data.error ?? `Request failed with status ${response.status}`
        );
      }

      const data = (await response.json()) as AlgorithmHealthReport;
      setReport(data);
    } catch (nextError) {
      setError(
        nextError instanceof Error ? nextError.message : 'Unknown error'
      );
      setReport(fixtureReport);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className='space-y-4' data-testid='admin-algorithm-health-content'>
      <ContentSurfaceCard className='grid gap-3 p-4 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-end'>
        <div className='space-y-1.5'>
          <p className='text-[13px] font-[560] tracking-[-0.012em] text-primary-token'>
            Spotify Artist ID
          </p>
          <p className='text-[12px] leading-[18px] text-secondary-token'>
            Diagnose how Spotify routes an artist through the Fans Also Like
            graph.
          </p>
        </div>
        <form
          className='flex flex-col gap-2 sm:flex-row sm:items-center'
          onSubmit={(event: FormEvent<HTMLFormElement>) => {
            event.preventDefault();
            void analyse();
          }}
        >
          <Input
            value={artistId}
            onChange={event => setArtistId(event.target.value)}
            placeholder='Enter a Spotify artist ID'
            className='h-9 min-w-[18rem]'
            aria-label='Spotify artist ID'
          />
          <Button
            type='submit'
            size='sm'
            disabled={loading || artistId.trim().length === 0}
          >
            {loading ? 'Analysing...' : 'Analyse'}
          </Button>
        </form>
      </ContentSurfaceCard>

      {error ? (
        <ContentSurfaceCard className='px-4 py-3 text-[13px] leading-[18px] text-error'>
          {error}
        </ContentSurfaceCard>
      ) : null}

      {report ? <HealthReport report={report} /> : null}
    </div>
  );
}

function HealthReport({ report }: Readonly<{ report: AlgorithmHealthReport }>) {
  const { targetArtist, neighbours, healthScore, summary } = report;

  return (
    <div className='space-y-4'>
      <ContentSurfaceCard className='p-4'>
        <div className='flex items-center gap-4'>
          {targetArtist.imageUrl ? (
            <Image
              src={targetArtist.imageUrl}
              alt={targetArtist.name}
              width={72}
              height={72}
              className='size-[4.5rem] rounded-full object-cover'
              unoptimized
            />
          ) : null}
          <div className='space-y-1'>
            <p className='text-[15px] font-[560] tracking-[-0.015em] text-primary-token'>
              {targetArtist.name}
            </p>
            <p className='text-[13px] leading-[18px] text-secondary-token'>
              Popularity {targetArtist.popularity} ·{' '}
              {targetArtist.followerCount.toLocaleString()} followers
            </p>
            <div className='flex flex-wrap gap-1.5'>
              {targetArtist.genres.map(genre => (
                <Badge key={genre} variant='secondary' size='sm'>
                  {genre}
                </Badge>
              ))}
            </div>
          </div>
        </div>
      </ContentSurfaceCard>

      <div className='grid gap-4 xl:grid-cols-[minmax(0,16rem)_minmax(0,1fr)]'>
        <ContentSurfaceCard className='flex flex-col justify-between gap-3 p-5'>
          <div>
            <p className='text-[12px] text-secondary-token'>Health Score</p>
            <p
              className={`mt-1 text-[44px] font-[620] tracking-[-0.04em] ${getHealthColor(healthScore)}`}
            >
              {healthScore}%
            </p>
          </div>
          <div className='flex flex-wrap gap-1.5'>
            <Badge variant='success' size='sm'>
              {summary.bigger} Bigger
            </Badge>
            <Badge variant='warning' size='sm'>
              {summary.similar} Similar
            </Badge>
            <Badge variant='destructive' size='sm'>
              {summary.smaller} Smaller
            </Badge>
          </div>
        </ContentSurfaceCard>

        <ContentSurfaceCard className='overflow-hidden p-0'>
          <div className='border-b border-subtle px-(--linear-app-header-padding-x) py-3'>
            <p className='text-[12.5px] font-[560] tracking-[-0.012em] text-primary-token'>
              Fans Also Like
            </p>
            <p className='text-[11.5px] leading-[15px] text-tertiary-token'>
              {neighbours.length} scored neighbours with size and authenticity
              signals.
            </p>
          </div>
          <div className='divide-y divide-subtle'>
            {neighbours.map(neighbour => (
              <NeighbourRow
                key={neighbour.artist.spotifyId}
                neighbour={neighbour}
              />
            ))}
          </div>
        </ContentSurfaceCard>
      </div>
    </div>
  );
}

function NeighbourRow({ neighbour }: Readonly<{ neighbour: ScoredNeighbour }>) {
  const {
    artist,
    size,
    popularityDelta,
    followerDelta,
    genreOverlap,
    authenticity,
  } = neighbour;

  return (
    <div className='flex items-center gap-3 px-(--linear-app-content-padding-x) py-3'>
      {artist.imageUrl ? (
        <Image
          src={artist.imageUrl}
          alt={artist.name}
          width={44}
          height={44}
          className='size-11 rounded-full object-cover'
          unoptimized
        />
      ) : (
        <div className='flex size-11 items-center justify-center rounded-full bg-surface-0 text-[12px] text-secondary-token'>
          ?
        </div>
      )}
      <div className='min-w-0 flex-1 space-y-1'>
        <div className='flex flex-wrap items-center gap-1.5'>
          <p className='truncate text-[13px] font-[560] tracking-[-0.012em] text-primary-token'>
            {artist.name}
          </p>
          <SizeBadge size={size} />
          {authenticity.level !== 'CLEAN' ? (
            <AuthenticityBadge level={authenticity.level} />
          ) : null}
        </div>
        <p className='text-[12px] leading-[17px] text-secondary-token'>
          Pop {artist.popularity} ({formatDelta(popularityDelta)}) ·{' '}
          {artist.followerCount.toLocaleString()} followers ·{' '}
          {Math.round(genreOverlap * 100)}% genre overlap
        </p>
        {authenticity.reasons.length > 0 ? (
          <p className='text-[11px] leading-[15px] text-tertiary-token'>
            {authenticity.reasons.join(' · ')}
          </p>
        ) : null}
      </div>
      <p className='text-right text-[12px] font-[560] tabular-nums text-secondary-token'>
        {formatDelta(followerDelta)} followers
      </p>
    </div>
  );
}

const SIZE_BADGE_MAP: Record<
  NeighbourSize,
  { variant: 'success' | 'warning' | 'destructive'; label: string }
> = {
  BIGGER: { variant: 'success', label: 'Bigger' },
  SIMILAR: { variant: 'warning', label: 'Similar' },
  SMALLER: { variant: 'destructive', label: 'Smaller' },
};

function SizeBadge({ size }: Readonly<{ size: NeighbourSize }>) {
  const { variant, label } = SIZE_BADGE_MAP[size];
  return (
    <Badge variant={variant} size='sm'>
      {label}
    </Badge>
  );
}

function AuthenticityBadge({
  level,
}: Readonly<{ level: Exclude<AuthenticityLevel, 'CLEAN'> }>) {
  return (
    <Badge variant={level === 'SUSPECT' ? 'destructive' : 'warning'} size='sm'>
      {level === 'SUSPECT' ? 'Suspect' : 'Caution'}
    </Badge>
  );
}

function formatDelta(value: number) {
  const sign = value > 0 ? '+' : '';
  return `${sign}${value.toLocaleString()}`;
}

function getHealthColor(score: number): string {
  if (score >= 60) return 'text-success';
  if (score >= 30) return 'text-warning';
  return 'text-error';
}
