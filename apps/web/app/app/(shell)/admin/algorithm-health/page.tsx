'use client';

import Image from 'next/image';
import { useState } from 'react';
import { PageContent, PageShell } from '@/components/organisms/PageShell';
import { TIM_WHITE_SPOTIFY_ID } from '@/lib/spotify/blacklist';
import type {
  AlgorithmHealthReport,
  AuthenticityLevel,
  NeighbourSize,
  ScoredNeighbour,
} from '@/lib/spotify/scoring';

export default function AlgorithmHealthPage() {
  const [artistId, setArtistId] = useState(TIM_WHITE_SPOTIFY_ID);
  const [report, setReport] = useState<AlgorithmHealthReport | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function analyse() {
    setLoading(true);
    setError(null);
    setReport(null);

    try {
      const res = await fetch(
        `/api/spotify/fal-analysis?artistId=${encodeURIComponent(artistId)}`
      );

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(
          data.error || `Request failed with status ${res.status}`
        );
      }

      const data = await res.json();
      setReport(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setLoading(false);
    }
  }

  return (
    <PageShell>
      <PageContent>
        <div className='space-y-6'>
          <div>
            <h1 className='text-2xl font-semibold text-primary'>
              Algorithm Health Check
            </h1>
            <p className='mt-1 text-sm text-secondary'>
              Diagnose your Spotify &quot;Fans Also Like&quot; algorithmic
              positioning
            </p>
          </div>

          {/* Input */}
          <div className='flex items-end gap-3'>
            <div className='flex-1'>
              <label
                htmlFor='artist-id'
                className='block text-sm font-medium text-secondary'
              >
                Spotify Artist ID
              </label>
              <input
                id='artist-id'
                type='text'
                value={artistId}
                onChange={e => setArtistId(e.target.value)}
                placeholder='e.g. 4Uwpa6zW3zzCSQvooQNksm'
                className='mt-1 block w-full rounded-lg border border-subtle bg-surface px-3 py-2 text-sm text-primary placeholder:text-tertiary focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent'
              />
            </div>
            <button
              type='button'
              onClick={analyse}
              disabled={loading || !artistId.trim()}
              className='rounded-lg bg-accent px-4 py-2 text-sm font-medium text-white hover:bg-accent/90 disabled:opacity-50'
            >
              {loading ? 'Analysing...' : 'Analyse'}
            </button>
          </div>

          {/* Error */}
          {error && (
            <div className='rounded-lg border border-red-500/20 bg-red-500/10 p-4'>
              <p className='text-sm text-red-400'>{error}</p>
            </div>
          )}

          {/* Results */}
          {report && <HealthReport report={report} />}
        </div>
      </PageContent>
    </PageShell>
  );
}

// ─── Sub-components ──────────────────────────────────────

function HealthReport({ report }: { report: AlgorithmHealthReport }) {
  const { targetArtist, neighbours, healthScore, summary } = report;

  return (
    <div className='space-y-6'>
      {/* Target Artist Card */}
      <div className='rounded-xl border border-subtle bg-surface p-4'>
        <div className='flex items-center gap-4'>
          {targetArtist.imageUrl && (
            <Image
              src={targetArtist.imageUrl}
              alt={targetArtist.name}
              width={64}
              height={64}
              className='size-16 rounded-full object-cover'
              unoptimized
            />
          )}
          <div>
            <h2 className='text-lg font-semibold text-primary'>
              {targetArtist.name}
            </h2>
            <p className='text-sm text-secondary'>
              Popularity: {targetArtist.popularity} · Followers:{' '}
              {targetArtist.followerCount.toLocaleString()} ·{' '}
              {targetArtist.genres.join(', ') || 'No genres'}
            </p>
          </div>
        </div>
      </div>

      {/* Health Score */}
      <div className='rounded-xl border border-subtle bg-surface p-6 text-center'>
        <div className={`text-6xl font-bold ${getHealthColor(healthScore)}`}>
          {healthScore}%
        </div>
        <p className='mt-2 text-sm text-secondary'>Algorithm Health Score</p>
        <p className='mt-1 text-xs text-tertiary'>
          Your algorithm is routing you to{' '}
          <span className='text-red-400'>{summary.smaller} smaller</span>
          {' / '}
          <span className='text-yellow-400'>{summary.similar} similar</span>
          {' / '}
          <span className='text-green-400'>{summary.bigger} bigger</span>{' '}
          artists
        </p>
        {healthScore < 30 && (
          <p className='mt-3 text-sm font-medium text-red-400'>
            Your FAL is dominated by smaller artists. Spotify is routing you
            into a closed loop.
          </p>
        )}
      </div>

      {/* Neighbour List */}
      <div>
        <h3 className='mb-3 text-lg font-semibold text-primary'>
          Fans Also Like ({neighbours.length} artists)
        </h3>
        {neighbours.length === 0 ? (
          <p className='text-sm text-secondary'>
            No FAL data found. The scraper may not have been able to extract
            artist names from the Spotify profile page.
          </p>
        ) : (
          <div className='space-y-2'>
            {neighbours.map(n => (
              <NeighbourRow key={n.artist.spotifyId} neighbour={n} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function NeighbourRow({ neighbour }: { neighbour: ScoredNeighbour }) {
  const {
    artist,
    size,
    popularityDelta,
    followerDelta,
    genreOverlap,
    authenticity,
  } = neighbour;

  const isSuspect = authenticity.level === 'SUSPECT';

  return (
    <div
      className={`flex items-center gap-3 rounded-lg border px-4 py-3 ${
        isSuspect
          ? 'border-red-500/30 bg-red-500/5'
          : 'border-subtle bg-surface'
      }`}
    >
      {artist.imageUrl && (
        <Image
          src={artist.imageUrl}
          alt={artist.name}
          width={40}
          height={40}
          className='size-10 rounded-full object-cover'
          unoptimized
        />
      )}
      {!artist.imageUrl && (
        <div className='flex size-10 items-center justify-center rounded-full bg-subtle text-xs text-secondary'>
          ?
        </div>
      )}
      <div className='min-w-0 flex-1'>
        <div className='flex items-center gap-2'>
          <span className='truncate font-medium text-primary'>
            {artist.name}
          </span>
          <SizeTag size={size} />
          {authenticity.level !== 'CLEAN' && (
            <AuthenticityBadge level={authenticity.level} />
          )}
        </div>
        <p className='text-xs text-secondary'>
          Pop: {artist.popularity} ({popularityDelta >= 0 ? '+' : ''}
          {popularityDelta}) · Followers:{' '}
          {artist.followerCount.toLocaleString()} · Genre overlap:{' '}
          {Math.round(genreOverlap * 100)}%
        </p>
        {authenticity.reasons.length > 0 && (
          <p className='mt-0.5 text-xs text-red-400/80'>
            {authenticity.reasons.join(' · ')}
          </p>
        )}
      </div>
      <div className='text-right text-xs text-tertiary'>
        {followerDelta >= 0 ? '+' : ''}
        {followerDelta.toLocaleString()} followers
      </div>
    </div>
  );
}

function AuthenticityBadge({ level }: { level: AuthenticityLevel }) {
  const config: Record<
    Exclude<AuthenticityLevel, 'CLEAN'>,
    { bg: string; text: string; label: string }
  > = {
    CAUTION: {
      bg: 'bg-orange-500/20',
      text: 'text-orange-400',
      label: 'CAUTION',
    },
    SUSPECT: { bg: 'bg-red-500/20', text: 'text-red-400', label: 'SUSPECT' },
  };

  if (level === 'CLEAN') return null;
  const { bg, text, label } = config[level];

  return (
    <span
      className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${bg} ${text}`}
    >
      {label}
    </span>
  );
}

function SizeTag({ size }: { size: NeighbourSize }) {
  const config: Record<NeighbourSize, { bg: string; text: string }> = {
    BIGGER: { bg: 'bg-green-500/20', text: 'text-green-400' },
    SIMILAR: { bg: 'bg-yellow-500/20', text: 'text-yellow-400' },
    SMALLER: { bg: 'bg-red-500/20', text: 'text-red-400' },
  };

  const { bg, text } = config[size];

  return (
    <span
      className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${bg} ${text}`}
    >
      {size}
    </span>
  );
}

function getHealthColor(score: number): string {
  if (score >= 60) return 'text-green-400';
  if (score >= 30) return 'text-yellow-400';
  return 'text-red-400';
}
