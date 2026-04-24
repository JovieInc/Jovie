'use client';

import { Button, Input } from '@jovie/ui';
import { Check, ExternalLink, ShoppingBag, X } from 'lucide-react';
import { memo, useCallback, useEffect, useState } from 'react';
import { useDashboardData } from '@/app/app/(shell)/dashboard/DashboardDataContext';
import { BASE_URL } from '@/constants/domains';
import { DashboardCard } from '@/features/dashboard/atoms/DashboardCard';
import { isShopifyDomain } from '@/lib/profile/shop-settings';

type SaveState = 'idle' | 'saving' | 'success' | 'error';

export const ShopifyStoreCard = memo(function ShopifyStoreCard() {
  const { selectedProfile } = useDashboardData();
  const [url, setUrl] = useState('');
  const [savedUrl, setSavedUrl] = useState<string | null>(null);
  const [saveState, setSaveState] = useState<SaveState>('idle');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);

  // Fetch current setting on mount
  useEffect(() => {
    let cancelled = false;
    fetch('/api/dashboard/shop')
      .then(res => res.json())
      .then((data: { shopifyUrl?: string | null }) => {
        if (cancelled) return;
        const current = data.shopifyUrl ?? '';
        setUrl(current);
        setSavedUrl(current || null);
        setLoaded(true);
      })
      .catch(() => {
        if (!cancelled) setLoaded(true);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const handleSave = useCallback(async () => {
    const trimmed = url.trim();

    if (trimmed && !isShopifyDomain(trimmed)) {
      setErrorMessage(
        'Please enter a valid *.myshopify.com URL (e.g. https://my-store.myshopify.com)'
      );
      return;
    }

    setSaveState('saving');
    setErrorMessage(null);

    try {
      const res = await fetch('/api/dashboard/shop', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ shopifyUrl: trimmed || null }),
      });

      if (!res.ok) {
        const data = (await res.json()) as { error?: string };
        setErrorMessage(data.error ?? 'Failed to save');
        setSaveState('error');
        return;
      }

      setSavedUrl(trimmed || null);
      setSaveState('success');
      setTimeout(() => setSaveState('idle'), 2000);
    } catch {
      setErrorMessage('Network error — please try again');
      setSaveState('error');
    }
  }, [url]);

  const handleDisconnect = useCallback(async () => {
    setUrl('');
    setSaveState('saving');
    setErrorMessage(null);

    try {
      const res = await fetch('/api/dashboard/shop', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ shopifyUrl: null }),
      });

      if (!res.ok) {
        setErrorMessage('Failed to disconnect');
        setSaveState('error');
        return;
      }

      setSavedUrl(null);
      setSaveState('idle');
    } catch {
      setErrorMessage('Network error — please try again');
      setSaveState('error');
    }
  }, []);

  const hasChanges = (url.trim() || null) !== savedUrl;
  const shopPageUrl = selectedProfile?.username
    ? `${BASE_URL}/${selectedProfile.username}/shop`
    : null;

  if (!loaded) return null;

  return (
    <DashboardCard
      variant='settings'
      padding='none'
      className='divide-y divide-subtle/60 overflow-hidden'
    >
      <div className='px-4 py-2.5 sm:px-5 sm:py-3'>
        <div className='mb-2.5 flex items-center gap-2'>
          <div
            className='flex h-7 w-7 shrink-0 items-center justify-center rounded-lg border border-(--linear-app-frame-seam) bg-surface-0'
            aria-hidden='true'
          >
            <ShoppingBag className='h-3.5 w-3.5 text-secondary-token' />
          </div>
          <h3 className='text-app font-caption text-primary-token'>Shop</h3>
        </div>

        <p className='text-[12.5px] leading-5 text-secondary-token'>
          Link your Shopify store to add a shop button on your public profile.
          Fans will be redirected to your store with Jovie attribution.
        </p>
      </div>

      <div className='space-y-3 px-4 py-2.5 sm:px-5 sm:py-3'>
        <div>
          <label
            htmlFor='shopify-url'
            className='mb-1.5 block text-app font-caption text-secondary-token'
          >
            Store URL
          </label>
          <Input
            type='url'
            id='shopify-url'
            value={url}
            onChange={e => {
              setUrl(e.target.value);
              setErrorMessage(null);
              if (saveState === 'error') setSaveState('idle');
            }}
            placeholder='https://my-store.myshopify.com'
            className='h-8 w-full border-subtle bg-surface-0 text-app'
          />
        </div>

        {errorMessage && (
          <output
            className='flex items-center gap-2 rounded-lg border border-destructive/15 bg-destructive/5 px-3 py-2 text-app font-caption text-destructive'
            aria-live='polite'
          >
            <X className='h-3.5 w-3.5 shrink-0' />
            {errorMessage}
          </output>
        )}

        {saveState === 'success' && (
          <output
            className='flex items-center gap-2 rounded-lg border border-emerald-500/15 bg-emerald-500/6 px-3 py-2 text-app font-caption text-emerald-700 dark:text-emerald-300'
            aria-live='polite'
          >
            <Check className='h-3.5 w-3.5' />
            Shopify store saved
          </output>
        )}

        <div className='flex items-center gap-2'>
          <Button
            onClick={handleSave}
            disabled={saveState === 'saving' || !hasChanges}
            variant='primary'
            size='sm'
            className='h-7 rounded-lg px-2.5 text-2xs font-caption'
          >
            {saveState === 'saving' ? 'Saving…' : 'Save'}
          </Button>
          {savedUrl && (
            <Button
              onClick={handleDisconnect}
              disabled={saveState === 'saving'}
              variant='ghost'
              size='sm'
              className='h-7 rounded-lg border border-transparent px-2.5 text-2xs font-caption text-secondary-token hover:border-(--linear-app-frame-seam) hover:bg-surface-0 hover:text-primary-token'
            >
              Disconnect
            </Button>
          )}
        </div>

        {savedUrl && shopPageUrl && (
          <a
            href={shopPageUrl}
            target='_blank'
            rel='noopener noreferrer'
            className='inline-flex items-center gap-1.5 rounded-lg border border-(--linear-app-frame-seam) bg-surface-0 px-2.5 py-1.5 text-xs font-caption text-secondary-token transition-[background-color,border-color,color] duration-150 hover:bg-surface-1 hover:text-primary-token'
          >
            <ExternalLink className='h-3 w-3' />
            Preview shop link
          </a>
        )}
      </div>
    </DashboardCard>
  );
});
