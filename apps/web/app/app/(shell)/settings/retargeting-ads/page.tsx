'use client';

import { Button } from '@jovie/ui';
import { Download, RefreshCw } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import { ContentSectionHeader } from '@/components/molecules/ContentSectionHeader';
import { ContentSurfaceCard } from '@/components/molecules/ContentSurfaceCard';
import { PageContent, PageShell } from '@/components/organisms/PageShell';
import { useNotifications } from '@/lib/hooks/useNotifications';

interface AttributionStats {
  total: number;
  byPlatform: {
    retargeting_meta: number;
    retargeting_google: number;
    retargeting_tiktok: number;
  };
}

interface SummaryCardProps {
  readonly value: string;
  readonly label: string;
  readonly description: string;
}

function SummaryCard({
  value,
  label,
  description,
}: Readonly<SummaryCardProps>) {
  return (
    <ContentSurfaceCard surface='nested' className='space-y-1 p-4'>
      <p className='text-2xl font-semibold tracking-[-0.03em] text-primary-token'>
        {value}
      </p>
      <p className='text-xs font-semibold uppercase tracking-[0.14em] text-tertiary-token'>
        {label}
      </p>
      <p className='text-app leading-5 text-secondary-token'>{description}</p>
    </ContentSurfaceCard>
  );
}

function AttributionStatsCard() {
  const [stats, setStats] = useState<AttributionStats | null>(null);

  useEffect(() => {
    let cancelled = false;

    fetch('/api/dashboard/retargeting/attribution')
      .then(res => (res.ok ? res.json() : null))
      .then((data: AttributionStats | null) => {
        if (!cancelled && data) {
          setStats(data);
        }
      })
      .catch(() => {});

    return () => {
      cancelled = true;
    };
  }, []);

  if (!stats || stats.total === 0) {
    return null;
  }

  const platforms = [
    { key: 'retargeting_meta' as const, label: 'Meta' },
    { key: 'retargeting_google' as const, label: 'Google' },
    { key: 'retargeting_tiktok' as const, label: 'TikTok' },
  ];

  return (
    <ContentSurfaceCard surface='details'>
      <ContentSectionHeader
        density='compact'
        title='Retargeting attribution'
        subtitle='Subscribers attributed to these ads this month.'
      />
      <div className='space-y-3 p-3 pt-0 sm:p-4 sm:pt-0'>
        <div>
          <p className='text-2xl font-semibold tracking-[-0.03em] text-primary-token'>
            {stats.total}
          </p>
          <p className='text-app text-secondary-token'>
            {stats.total === 1 ? 'Subscriber' : 'Subscribers'} attributed to
            retargeting campaigns this month.
          </p>
        </div>
        <div className='flex flex-wrap gap-2'>
          {platforms
            .filter(platform => stats.byPlatform[platform.key] > 0)
            .map(platform => (
              <ContentSurfaceCard
                key={platform.key}
                surface='nested'
                className='px-3 py-2'
              >
                <p className='text-xs font-semibold text-primary-token'>
                  {platform.label}
                </p>
                <p className='text-xs text-secondary-token'>
                  {stats.byPlatform[platform.key]}
                </p>
              </ContentSurfaceCard>
            ))}
        </div>
      </div>
    </ContentSurfaceCard>
  );
}

type AdVariant = {
  type: 'fan' | 'claim';
  size: 'feed' | 'story';
  label: string;
  dimensions: string;
};

const AD_VARIANTS: AdVariant[] = [
  {
    type: 'fan',
    size: 'feed',
    label: 'Fan feed',
    dimensions: '1080 x 1080',
  },
  {
    type: 'fan',
    size: 'story',
    label: 'Fan story',
    dimensions: '1080 x 1920',
  },
  {
    type: 'claim',
    size: 'feed',
    label: 'Claim feed',
    dimensions: '1080 x 1080',
  },
  {
    type: 'claim',
    size: 'story',
    label: 'Claim story',
    dimensions: '1080 x 1920',
  },
];

function getAdCreativeUrl(type: string, size: string): string {
  return (
    '/api/dashboard/retargeting/ad-creative?type=' + type + '&size=' + size
  );
}

function AdPreviewCard({ variant }: { readonly variant: AdVariant }) {
  const [downloading, setDownloading] = useState(false);
  const [regenerating, setRegenerating] = useState(false);
  const [cacheKey, setCacheKey] = useState(0);
  const notifications = useNotifications();

  const handleDownload = useCallback(async () => {
    setDownloading(true);
    try {
      const response = await fetch(
        getAdCreativeUrl(variant.type, variant.size)
      );
      if (!response.ok) {
        throw new Error('Failed to generate ad');
      }

      const blob = await response.blob();
      const objectUrl = URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = objectUrl;
      anchor.download =
        'jovie-ad-' + variant.type + '-' + variant.size + '.png';
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      URL.revokeObjectURL(objectUrl);
    } catch {
      notifications.error('Failed to download ad image');
    } finally {
      setDownloading(false);
    }
  }, [notifications, variant.size, variant.type]);

  const handleRegenerate = useCallback(async () => {
    setRegenerating(true);
    try {
      const response = await fetch(
        getAdCreativeUrl(variant.type, variant.size) + '&regenerate=1'
      );
      if (!response.ok) {
        throw new Error('Failed to regenerate ad');
      }
      setCacheKey(prev => prev + 1);
      notifications.success('Ad image regenerated');
    } catch {
      notifications.error('Failed to regenerate ad image');
    } finally {
      setRegenerating(false);
    }
  }, [notifications, variant.size, variant.type]);

  const previewUrl = cacheKey
    ? getAdCreativeUrl(variant.type, variant.size) + '&v=' + cacheKey
    : getAdCreativeUrl(variant.type, variant.size);

  return (
    <ContentSurfaceCard surface='nested' className='space-y-3 p-4'>
      <div
        className={
          variant.size === 'story'
            ? 'relative aspect-[9/16] overflow-hidden rounded-[10px] bg-surface-2'
            : 'relative aspect-square overflow-hidden rounded-[10px] bg-surface-2'
        }
      >
        {/* eslint-disable-next-line @next/next/no-img-element -- Preview image from our own API */}
        <img
          src={previewUrl}
          alt={variant.label + ' ad preview'}
          className='h-full w-full object-contain'
          loading='lazy'
        />
      </div>

      <div className='flex items-start justify-between gap-3'>
        <div className='min-w-0'>
          <p className='text-app font-semibold text-primary-token'>
            {variant.label}
          </p>
          <p className='text-xs text-tertiary-token'>{variant.dimensions}</p>
        </div>
        <div className='flex items-center gap-2'>
          <Button
            variant='ghost'
            size='sm'
            onClick={handleRegenerate}
            disabled={regenerating || downloading}
            aria-label={'Regenerate ' + variant.label + ' ad'}
          >
            <RefreshCw
              className={
                regenerating ? 'h-3.5 w-3.5 animate-spin' : 'h-3.5 w-3.5'
              }
            />
          </Button>
          <Button
            variant='secondary'
            size='sm'
            onClick={handleDownload}
            disabled={downloading || regenerating}
          >
            <Download className='mr-1.5 h-3.5 w-3.5' />
            {downloading ? 'Generating...' : 'Download'}
          </Button>
        </div>
      </div>
    </ContentSurfaceCard>
  );
}

interface AdGroupSectionProps {
  readonly title: string;
  readonly subtitle: string;
  readonly variants: readonly AdVariant[];
}

function AdGroupSection({
  title,
  subtitle,
  variants,
}: Readonly<AdGroupSectionProps>) {
  return (
    <ContentSurfaceCard surface='details'>
      <ContentSectionHeader
        density='compact'
        title={title}
        subtitle={subtitle}
      />
      <div className='grid grid-cols-1 gap-4 p-3 pt-0 sm:grid-cols-2 sm:p-4 sm:pt-0'>
        {variants.map(variant => (
          <AdPreviewCard
            key={variant.type + '-' + variant.size}
            variant={variant}
          />
        ))}
      </div>
    </ContentSurfaceCard>
  );
}

export default function RetargetingAdsPage() {
  return (
    <PageShell>
      <PageContent>
        <div className='space-y-6'>
          <ContentSurfaceCard surface='details'>
            <ContentSectionHeader
              density='compact'
              title='Retargeting ads'
              subtitle='Download ready-to-run creatives for Meta retargeting campaigns.'
            />
            <div className='grid grid-cols-1 gap-3 p-3 pt-0 sm:grid-cols-3 sm:p-4 sm:pt-0'>
              <SummaryCard
                value='4'
                label='Creatives'
                description='Feed and story assets for both fan retargeting and profile-claim campaigns.'
              />
              <SummaryCard
                value='2'
                label='Audiences'
                description='Separate messaging for returning fans and artists who have not claimed their profile.'
              />
              <SummaryCard
                value='Meta'
                label='Destination'
                description='Upload these PNG assets directly to Ads Manager for Instagram and Facebook placements.'
              />
            </div>
          </ContentSurfaceCard>

          <AttributionStatsCard />

          <AdGroupSection
            title='Fan retargeting'
            subtitle="Show these ads to fans who visited your profile but haven't enabled notifications yet."
            variants={AD_VARIANTS.filter(variant => variant.type === 'fan')}
          />

          <AdGroupSection
            title='Profile claim'
            subtitle='Show these ads to artists who have an unclaimed profile and want to take ownership.'
            variants={AD_VARIANTS.filter(variant => variant.type === 'claim')}
          />

          <ContentSurfaceCard surface='details'>
            <ContentSectionHeader
              density='compact'
              title='How to use these ads'
              subtitle='Upload the feed and story assets directly to Meta Ads Manager.'
            />
            <ol className='list-decimal space-y-2 px-8 py-5 pt-4 text-app text-secondary-token'>
              <li>Download the ad images above.</li>
              <li>
                Create a new campaign in Meta Ads Manager with the Traffic
                objective.
              </li>
              <li>
                Target your website visitors custom audience built from your
                pixel.
              </li>
              <li>
                Exclude your existing subscribers so these ads stay focused on
                conversion opportunities.
              </li>
              <li>
                Use the square asset for feed placements and the vertical asset
                for stories.
              </li>
              <li>
                Set your daily budget, publish, and monitor attribution above
                for results.
              </li>
            </ol>
          </ContentSurfaceCard>
        </div>
      </PageContent>
    </PageShell>
  );
}
