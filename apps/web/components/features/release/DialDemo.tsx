'use client';

import dynamic from 'next/dynamic';
import { useEffect, useMemo, useRef, useState } from 'react';
import { DSP_LOGO_CONFIG } from '@/components/atoms/DspLogo';
import type { ActionDialOption } from './ActionDial';

/** Matches the dial's reel (h-53) plus its hint row so mounting never shifts layout. */
const DIAL_HEIGHT = 'calc(13.25rem + 1.25rem + 0.25rem)';

function DialPlaceholder() {
  return <div aria-hidden='true' style={{ height: DIAL_HEIGHT }} />;
}

// The dial and its physics load only when the demo nears the viewport, so
// the homepage's first paint and LCP never pay for them.
const LazyActionDial = dynamic(
  () => import('./ActionDial').then(module => module.ActionDial),
  { ssr: false, loading: DialPlaceholder }
);

/** Tim's release services in the order a fan scrolls through them. Spotify first. */
export const DIAL_DEMO_SERVICE_KEYS = [
  'spotify',
  'apple_music',
  'youtube_music',
  'amazon_music',
  'tidal',
  'deezer',
  'soundcloud',
  'bandcamp',
  'pandora',
  'qobuz',
  'audiomack',
  'napster',
] as const;

export function buildDemoOptions(): ActionDialOption[] {
  return DIAL_DEMO_SERVICE_KEYS.flatMap(key => {
    const logo = DSP_LOGO_CONFIG[key];
    if (!logo) return [];
    return [
      {
        id: key,
        label: logo.name,
        icon: (
          <svg
            viewBox='0 0 24 24'
            fill='currentColor'
            className='h-5 w-5 shrink-0'
            style={{ color: logo.color }}
            aria-hidden='true'
          >
            <path d={logo.iconPath} />
          </svg>
        ),
      },
    ];
  });
}

interface DialDemoProps {
  readonly className?: string;
  readonly groupLabel?: string;
  readonly hint?: string;
}

/**
 * The real release-page service dial in demo mode: about twelve services, a
 * reveal fling when it scrolls into view, fully draggable, and no outbound
 * link or tracking. Safe to place on any landing page.
 */
export function DialDemo({
  className,
  groupLabel = 'Try the streaming service dial',
  hint = 'Swipe, flick, or use arrow keys to try it.',
}: Readonly<DialDemoProps>) {
  const options = useMemo(() => buildDemoOptions(), []);
  const [selectedId, setSelectedId] = useState<string>(
    options[0]?.id ?? 'spotify'
  );
  const [near, setNear] = useState(false);
  const hostRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    if (typeof IntersectionObserver === 'undefined') {
      setNear(true);
      return;
    }
    const observer = new IntersectionObserver(
      entries => {
        if (entries.some(entry => entry.isIntersecting)) {
          setNear(true);
          observer.disconnect();
        }
      },
      { rootMargin: '400px 0px' }
    );
    observer.observe(host);
    return () => observer.disconnect();
  }, []);

  return (
    <div ref={hostRef} className={className} data-testid='dial-demo'>
      {near ? (
        <LazyActionDial
          options={options}
          selectedId={selectedId}
          onSelect={setSelectedId}
          actionLabel='Stream Now'
          groupLabel={groupLabel}
          hint={hint}
          demo
        />
      ) : (
        <DialPlaceholder />
      )}
    </div>
  );
}
