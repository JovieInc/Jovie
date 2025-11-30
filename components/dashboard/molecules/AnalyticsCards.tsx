'use client';

import { useEffect, useState } from 'react';
import { SkeletonCard } from '@/components/molecules/SkeletonCard';
import { EmptyState } from '@/components/organisms/EmptyState';
import { AnalyticsCard } from '../atoms/AnalyticsCard';

interface AnalyticsData {
  total_clicks: number;
  spotify_clicks: number;
  social_clicks: number;
  recent_clicks: number;
}

interface AnalyticsCardsProps {
  profileUrl?: string;
}

export function AnalyticsCards({ profileUrl }: AnalyticsCardsProps) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | undefined>();
  const [data, setData] = useState<AnalyticsData>({
    total_clicks: 0,
    spotify_clicks: 0,
    social_clicks: 0,
    recent_clicks: 0,
  });

  // Animated display values for a subtle count-up effect
  const [displayValues, setDisplayValues] = useState<AnalyticsData>({
    total_clicks: 0,
    spotify_clicks: 0,
    social_clicks: 0,
    recent_clicks: 0,
  });
  const [copied, setCopied] = useState(false);

  const fetchAnalytics = async () => {
    try {
      setLoading(true);
      setError(undefined);
      const res = await fetch('/api/dashboard/analytics', {
        cache: 'no-store',
      });
      if (!res.ok) throw new Error(`Failed to fetch analytics (${res.status})`);
      const json: AnalyticsData = await res.json();
      setData(json);
    } catch (error) {
      console.error('Error:', error);
      setError('Unable to fetch analytics data');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchAnalytics();
  }, []);

  // Run count-up animation when data changes
  useEffect(() => {
    const duration = 800; // ms
    const startValues = { ...displayValues };
    const endValues = { ...data };
    const startTime = performance.now();
    let raf = 0;

    const step = (now: number) => {
      const t = Math.min(1, (now - startTime) / duration);
      // easeOutCubic
      const eased = 1 - Math.pow(1 - t, 3);
      const next: AnalyticsData = {
        total_clicks: Math.round(
          startValues.total_clicks +
            (endValues.total_clicks - startValues.total_clicks) * eased
        ),
        spotify_clicks: Math.round(
          startValues.spotify_clicks +
            (endValues.spotify_clicks - startValues.spotify_clicks) * eased
        ),
        social_clicks: Math.round(
          startValues.social_clicks +
            (endValues.social_clicks - startValues.social_clicks) * eased
        ),
        recent_clicks: Math.round(
          startValues.recent_clicks +
            (endValues.recent_clicks - startValues.recent_clicks) * eased
        ),
      };
      setDisplayValues(next);
      if (t < 1) {
        raf = requestAnimationFrame(step);
      }
    };

    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    data.total_clicks,
    data.spotify_clicks,
    data.social_clicks,
    data.recent_clicks,
  ]);

  const cards = [
    {
      id: 'total_clicks',
      title: 'Total Clicks',
      value: displayValues.total_clicks,
      metadata: 'Last 30 days',
    },
    {
      id: 'spotify_clicks',
      title: 'Spotify Clicks',
      value: displayValues.spotify_clicks,
      metadata: 'Music platform clicks',
    },
    {
      id: 'social_clicks',
      title: 'Social Clicks',
      value: displayValues.social_clicks,
      metadata: 'Social media clicks',
    },
    {
      id: 'recent_activity',
      title: 'Recent Activity',
      value: displayValues.recent_clicks,
      metadata: 'Last 7 days',
    },
  ];

  if (loading) {
    return (
      <div className='grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4'>
        {cards.map(card => (
          <SkeletonCard key={card.id} />
        ))}
      </div>
    );
  }

  if (error) {
    return (
      <div className='flex flex-col items-center justify-center p-8 text-center space-y-4'>
        <div className='w-12 h-12 rounded-full bg-orange-100 dark:bg-orange-900/20 flex items-center justify-center'>
          <svg
            className='w-6 h-6 text-orange-600 dark:text-orange-400'
            fill='none'
            stroke='currentColor'
            viewBox='0 0 24 24'
          >
            <path
              strokeLinecap='round'
              strokeLinejoin='round'
              strokeWidth='2'
              d='M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L4.082 16.5c-.77.833.192 2.5 1.732 2.5z'
            />
          </svg>
        </div>
        <div>
          <h3 className='text-sm font-medium text-primary mb-1'>
            Analytics temporarily unavailable
          </h3>
          <p className='text-xs text-secondary'>
            We couldn&apos;t fetch your analytics data right now
          </p>
        </div>
        <button
          onClick={fetchAnalytics}
          disabled={loading}
          className='inline-flex items-center gap-2 px-3 py-2 text-xs font-medium text-primary bg-surface-2 hover:bg-surface-3 border border-subtle rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed'
        >
          {loading ? (
            <>
              <div className='w-3 h-3 border border-current border-t-transparent rounded-full animate-spin'></div>
              Retrying...
            </>
          ) : (
            <>
              <svg
                className='w-3 h-3'
                fill='none'
                stroke='currentColor'
                viewBox='0 0 24 24'
              >
                <path
                  strokeLinecap='round'
                  strokeLinejoin='round'
                  strokeWidth='2'
                  d='M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15'
                />
              </svg>
              Try again
            </>
          )}
        </button>
      </div>
    );
  }

  const allZero =
    data.total_clicks === 0 &&
    data.spotify_clicks === 0 &&
    data.social_clicks === 0 &&
    data.recent_clicks === 0;

  const handleCopy = async () => {
    if (!profileUrl) return;
    try {
      await navigator.clipboard.writeText(profileUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch (e) {
      console.error('Copy failed', e);
    }
  };

  if (allZero) {
    return (
      <EmptyState
        type='analytics'
        title='📊 No profile views yet'
        description='Share your profile link to start tracking clicks and engagement from your fans.'
        actionLabel={copied ? 'Copied!' : 'Copy Profile Link'}
        onAction={profileUrl ? handleCopy : undefined}
      />
    );
  }

  return (
    <div className='grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4'>
      {cards.map(card => (
        <AnalyticsCard
          key={card.id}
          title={card.title}
          value={card.value}
          metadata={card.metadata}
        />
      ))}
    </div>
  );
}
