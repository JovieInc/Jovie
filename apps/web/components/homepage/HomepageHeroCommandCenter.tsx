'use client';

import { ChevronLeft, ChevronRight } from 'lucide-react';
import Image from 'next/image';
import { useLayoutEffect, useRef } from 'react';
import { getMarketingExportImage } from '@/lib/screenshots/registry';

const LIBRARY_IMAGE = getMarketingExportImage('shell-v1-library-desktop');
const PROFILE_IMAGE = getMarketingExportImage('tim-white-profile-live-mobile');
const RELEASE_IMAGE = getMarketingExportImage('release-presave-mobile');
const RELEASES_IMAGE = getMarketingExportImage('shell-v1-releases-desktop');

const PRODUCT_PANES = [
  {
    image: RELEASE_IMAGE,
    alt: 'The Deep End release page with fan action buttons',
    sizes: '(min-width: 1280px) 18rem, (min-width: 768px) 24vw, 34vw',
    className: 'homepage-product-pane--phone homepage-product-pane--release',
    priority: true,
  },
  {
    image: RELEASES_IMAGE,
    alt: 'Jovie releases page with release status, assets, and launch progress',
    sizes: '(min-width: 1280px) 68rem, (min-width: 768px) 76vw, 88vw',
    className: 'homepage-product-pane--desktop',
    initial: true,
    priority: true,
  },
  {
    image: PROFILE_IMAGE,
    alt: 'Tim White artist profile with release and fan actions',
    sizes: '(min-width: 1280px) 18rem, (min-width: 768px) 24vw, 34vw',
    className: 'homepage-product-pane--phone',
    priority: true,
  },
  {
    image: LIBRARY_IMAGE,
    alt: 'Jovie media library with release assets organized for review',
    sizes: '(min-width: 1280px) 68rem, (min-width: 768px) 76vw, 88vw',
    className: 'homepage-product-pane--desktop homepage-product-pane--library',
    priority: false,
  },
] as const;

function ProductPane({
  alt,
  className,
  image,
  initial = false,
  priority = false,
  sizes,
}: Readonly<{
  alt: string;
  className: string;
  image: ReturnType<typeof getMarketingExportImage>;
  initial?: boolean;
  priority?: boolean;
  sizes: string;
}>) {
  return (
    <figure
      className={`homepage-product-pane ${className}`}
      data-product-pane
      data-initial-pane={initial ? 'true' : undefined}
    >
      <Image
        src={image.publicUrl}
        alt={alt}
        width={image.width}
        height={image.height}
        priority={priority}
        loading={priority ? 'eager' : 'lazy'}
        sizes={sizes}
        quality={85}
        className='homepage-product-pane__image'
      />
    </figure>
  );
}

export function HomepageHeroCommandCenter() {
  const railRef = useRef<HTMLDivElement>(null);

  function scrollProductRail(direction: -1 | 1) {
    const rail = railRef.current;
    if (!rail) return;

    const panes = Array.from(
      rail.querySelectorAll<HTMLElement>('[data-product-pane]')
    );
    const railCenter = rail.scrollLeft + rail.clientWidth / 2;
    const currentIndex = panes.reduce((closestIndex, pane, index) => {
      const closestPane = panes[closestIndex];
      if (!closestPane) return index;
      const paneCenter = pane.offsetLeft + pane.offsetWidth / 2;
      const closestCenter =
        closestPane.offsetLeft + closestPane.offsetWidth / 2;
      return Math.abs(paneCenter - railCenter) <
        Math.abs(closestCenter - railCenter)
        ? index
        : closestIndex;
    }, 0);
    const targetIndex = Math.max(
      0,
      Math.min(panes.length - 1, currentIndex + direction)
    );
    const target = panes[targetIndex];
    if (!target) return;

    rail.scrollTo({
      left: target.offsetLeft - (rail.clientWidth - target.offsetWidth) / 2,
      behavior: 'smooth',
    });
  }

  useLayoutEffect(() => {
    const rail = railRef.current;
    const initialPane = rail?.querySelector<HTMLElement>(
      '[data-initial-pane="true"]'
    );
    if (!rail || !initialPane) return;

    rail.scrollLeft =
      initialPane.offsetLeft - (rail.clientWidth - initialPane.offsetWidth) / 2;
  }, []);

  return (
    <section
      aria-label='Jovie release operating system preview'
      className='homepage-hero-command-center'
      data-testid='homepage-hero-command-center'
    >
      <div className='homepage-product-controls'>
        <button
          type='button'
          className='homepage-product-control homepage-product-control--prev focus-ring-themed'
          aria-label='Previous product preview'
          onClick={() => scrollProductRail(-1)}
        >
          <ChevronLeft aria-hidden='true' size={18} strokeWidth={1.8} />
        </button>
        <button
          type='button'
          className='homepage-product-control homepage-product-control--next focus-ring-themed'
          aria-label='Next product preview'
          onClick={() => scrollProductRail(1)}
        >
          <ChevronRight aria-hidden='true' size={18} strokeWidth={1.8} />
        </button>
      </div>
      <div ref={railRef} className='homepage-product-rail'>
        {PRODUCT_PANES.map(pane => (
          <ProductPane
            key={pane.alt}
            image={pane.image}
            alt={pane.alt}
            sizes={pane.sizes}
            className={pane.className}
            initial={'initial' in pane ? pane.initial : false}
            priority={pane.priority}
          />
        ))}
      </div>
    </section>
  );
}
