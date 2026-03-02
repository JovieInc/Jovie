'use client';

import { useEffect, useRef, useState } from 'react';

interface RetargetingPixelsProps {
  /** Creator profile ID to fetch pixel config for */
  readonly profileId: string;
  /** Fire a conversion/purchase event instead of just PageView */
  readonly fireConversion?: boolean;
  /** Conversion value in USD (for purchase events) */
  readonly conversionValue?: number;
}

interface PixelConfig {
  facebookPixelId: string | null;
  googleMeasurementId: string | null;
}

/**
 * Client-side retargeting pixel injector for tip pages.
 *
 * Fetches the creator's pixel IDs from /api/pixels/public and injects
 * Meta Pixel (fbq) and/or Google Ads (gtag) scripts. Fires PageView on
 * mount, and optionally a Purchase conversion event.
 *
 * No third-party scripts are loaded until the pixel config is fetched
 * and verified. This component renders nothing visible.
 */
export function RetargetingPixels({
  profileId,
  fireConversion = false,
  conversionValue,
}: RetargetingPixelsProps) {
  const [config, setConfig] = useState<PixelConfig | null>(null);
  const initialized = useRef(false);

  // Fetch pixel config
  useEffect(() => {
    if (initialized.current) return;
    initialized.current = true;

    fetch(`/api/pixels/public?profileId=${encodeURIComponent(profileId)}`)
      .then(res => (res.ok ? res.json() : null))
      .then((data: PixelConfig | null) => {
        if (data) setConfig(data);
      })
      .catch(() => {
        // Silently fail - tracking should never break the page
      });
  }, [profileId]);

  // Inject Meta Pixel
  useEffect(() => {
    if (!config?.facebookPixelId) return;
    const pixelId = config.facebookPixelId;

    // Skip if already loaded (e.g. by another component instance)
    if (
      typeof window !== 'undefined' &&
      (window as unknown as Record<string, unknown>).fbq
    ) {
      const fbq = (window as unknown as Record<string, unknown>).fbq as (
        ...args: unknown[]
      ) => void;
      if (fireConversion && conversionValue) {
        fbq('track', 'Purchase', { value: conversionValue, currency: 'USD' });
      }
      return;
    }

    // Meta Pixel base code
    const script = document.createElement('script');
    script.textContent = `
      !function(f,b,e,v,n,t,s)
      {if(f.fbq)return;n=f.fbq=function(){n.callMethod?
      n.callMethod.apply(n,arguments):n.queue.push(arguments)};
      if(!f._fbq)f._fbq=n;n.push=n;n.loaded=!0;n.version='2.0';
      n.queue=[];t=b.createElement(e);t.async=!0;
      t.src=v;s=b.getElementsByTagName(e)[0];
      s.parentNode.insertBefore(t,s)}(window, document,'script',
      'https://connect.facebook.net/en_US/fbevents.js');
      fbq('init', '${pixelId}');
      fbq('track', 'PageView');
      ${fireConversion && conversionValue ? `fbq('track', 'Purchase', { value: ${conversionValue}, currency: 'USD' });` : ''}
    `;
    document.head.appendChild(script);

    // noscript fallback pixel
    const noscript = document.createElement('noscript');
    const img = document.createElement('img');
    img.height = 1;
    img.width = 1;
    img.style.display = 'none';
    img.src = `https://www.facebook.com/tr?id=${pixelId}&ev=PageView&noscript=1`;
    noscript.appendChild(img);
    document.body.appendChild(noscript);

    return () => {
      script.remove();
      noscript.remove();
    };
  }, [config?.facebookPixelId, fireConversion, conversionValue]);

  // Inject Google Ads / GA4 gtag
  useEffect(() => {
    if (!config?.googleMeasurementId) return;
    const measurementId = config.googleMeasurementId;

    // Skip if already loaded
    if (
      typeof window !== 'undefined' &&
      (window as unknown as Record<string, unknown>).gtag
    ) {
      const gtag = (window as unknown as Record<string, unknown>).gtag as (
        ...args: unknown[]
      ) => void;
      if (fireConversion && conversionValue) {
        gtag('event', 'purchase', {
          value: conversionValue,
          currency: 'USD',
          send_to: measurementId,
        });
      }
      return;
    }

    // Load gtag.js
    const gtagScript = document.createElement('script');
    gtagScript.async = true;
    gtagScript.src = `https://www.googletagmanager.com/gtag/js?id=${measurementId}`;
    document.head.appendChild(gtagScript);

    // Initialize gtag
    const inlineScript = document.createElement('script');
    inlineScript.textContent = `
      window.dataLayer = window.dataLayer || [];
      function gtag(){dataLayer.push(arguments);}
      gtag('js', new Date());
      gtag('config', '${measurementId}', { send_page_view: true });
      ${
        fireConversion && conversionValue
          ? `gtag('event', 'purchase', { value: ${conversionValue}, currency: 'USD', send_to: '${measurementId}' });`
          : ''
      }
    `;
    document.head.appendChild(inlineScript);

    return () => {
      gtagScript.remove();
      inlineScript.remove();
    };
  }, [config?.googleMeasurementId, fireConversion, conversionValue]);

  // This component renders nothing
  return null;
}
