'use client';

import { Button } from '@jovie/ui';
import { Download } from 'lucide-react';
import { useCallback, useState } from 'react';
import { useNotifications } from '@/lib/hooks/useNotifications';

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
    label: 'Fan — Feed',
    dimensions: '1080 × 1080',
  },
  {
    type: 'fan',
    size: 'story',
    label: 'Fan — Story',
    dimensions: '1080 × 1920',
  },
  {
    type: 'claim',
    size: 'feed',
    label: 'Claim — Feed',
    dimensions: '1080 × 1080',
  },
  {
    type: 'claim',
    size: 'story',
    label: 'Claim — Story',
    dimensions: '1080 × 1920',
  },
];

function getAdCreativeUrl(type: string, size: string): string {
  return `/api/dashboard/retargeting/ad-creative?type=${type}&size=${size}`;
}

function AdPreviewCard({ variant }: { readonly variant: AdVariant }) {
  const [downloading, setDownloading] = useState(false);
  const notifications = useNotifications();

  const handleDownload = useCallback(async () => {
    setDownloading(true);
    try {
      const url = getAdCreativeUrl(variant.type, variant.size);
      const response = await fetch(url);
      if (!response.ok) throw new Error('Failed to generate ad');

      const blob = await response.blob();
      const objectUrl = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = objectUrl;
      a.download = `jovie-ad-${variant.type}-${variant.size}.png`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(objectUrl);
    } catch {
      notifications.error('Failed to download ad image');
    } finally {
      setDownloading(false);
    }
  }, [variant, notifications]);

  return (
    <div className='flex flex-col gap-3 rounded-xl border border-subtle bg-surface-0 p-4'>
      <div
        className={`relative overflow-hidden rounded-lg bg-surface-2 ${
          variant.size === 'story' ? 'aspect-[9/16]' : 'aspect-square'
        }`}
      >
        {/* eslint-disable-next-line @next/next/no-img-element -- Preview image from our own API */}
        <img
          src={getAdCreativeUrl(variant.type, variant.size)}
          alt={`${variant.label} ad preview`}
          className='h-full w-full object-contain'
          loading='lazy'
        />
      </div>

      <div className='flex items-center justify-between'>
        <div>
          <p className='text-sm font-medium text-primary-token'>
            {variant.label}
          </p>
          <p className='text-xs text-tertiary-token'>{variant.dimensions}</p>
        </div>
        <Button
          variant='secondary'
          size='sm'
          onClick={() => void handleDownload()}
          disabled={downloading}
        >
          <Download className='mr-1.5 h-3.5 w-3.5' />
          {downloading ? 'Generating…' : 'Download'}
        </Button>
      </div>
    </div>
  );
}

export default function RetargetingAdsPage() {
  return (
    <div className='mx-auto max-w-4xl space-y-8 px-4 py-8 sm:px-6'>
      <div>
        <h1 className='text-xl font-semibold text-primary-token'>
          Retargeting Ads
        </h1>
        <p className='mt-1 text-sm text-secondary-token'>
          Download ad images to use in your Instagram and Facebook campaigns.
          Upload them to Meta Ads Manager to retarget profile visitors.
        </p>
      </div>

      <div className='space-y-4'>
        <h2 className='text-sm font-medium uppercase tracking-wide text-tertiary-token'>
          Fan retargeting
        </h2>
        <p className='text-sm text-secondary-token'>
          Show these to fans who visited your profile but haven&apos;t turned on
          notifications yet.
        </p>
        <div className='grid grid-cols-1 gap-4 sm:grid-cols-2'>
          {AD_VARIANTS.filter(v => v.type === 'fan').map(variant => (
            <AdPreviewCard
              key={`${variant.type}-${variant.size}`}
              variant={variant}
            />
          ))}
        </div>
      </div>

      <div className='space-y-4'>
        <h2 className='text-sm font-medium uppercase tracking-wide text-tertiary-token'>
          Profile claim
        </h2>
        <p className='text-sm text-secondary-token'>
          Show these to artists who have an unclaimed profile to encourage them
          to claim it.
        </p>
        <div className='grid grid-cols-1 gap-4 sm:grid-cols-2'>
          {AD_VARIANTS.filter(v => v.type === 'claim').map(variant => (
            <AdPreviewCard
              key={`${variant.type}-${variant.size}`}
              variant={variant}
            />
          ))}
        </div>
      </div>

      <div className='rounded-xl border border-subtle bg-surface-0 p-4'>
        <h3 className='text-sm font-medium text-primary-token'>
          How to use these ads
        </h3>
        <ol className='mt-2 list-inside list-decimal space-y-1 text-sm text-secondary-token'>
          <li>Download the ad images above</li>
          <li>
            In Meta Ads Manager, create a new campaign with the Traffic
            objective
          </li>
          <li>
            Target your &quot;Website Visitors&quot; Custom Audience (built from
            your Facebook pixel)
          </li>
          <li>
            Exclude your &quot;Subscribe&quot; Custom Audience to skip fans who
            already have notifications on
          </li>
          <li>
            Upload the feed image (1080&times;1080) for Feed placements and the
            story image (1080&times;1920) for Stories
          </li>
          <li>Set your daily budget and let it run</li>
        </ol>
      </div>
    </div>
  );
}
