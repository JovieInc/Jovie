'use client';

import { ChevronLeft, ChevronRight } from 'lucide-react';
import Image from 'next/image';
import { useLayoutEffect, useRef } from 'react';

type HomepageMarketingImage = {
  readonly publicUrl: string;
  readonly width: number;
  readonly height: number;
  readonly alt: string;
};

export type HomepageHeroCommandCenterImages = {
  readonly library: HomepageMarketingImage;
  readonly profile: HomepageMarketingImage;
  readonly release: HomepageMarketingImage;
  readonly releases: HomepageMarketingImage;
};

function buildProductPanes(images: HomepageHeroCommandCenterImages) {
  return [
    {
      image: images.release,
      alt: 'The Deep End release page with fan action buttons',
      sizes: '(min-width: 1280px) 18rem, (min-width: 768px) 24vw, 34vw',
      className: 'homepage-product-pane--phone homepage-product-pane--release',
      priority: true,
    },
    {
      image: images.releases,
      alt: 'Jovie releases page with release status, assets, and launch progress',
      sizes: '(min-width: 1280px) 68rem, (min-width: 768px) 76vw, 88vw',
      className: 'homepage-product-pane--desktop',
      initial: true,
      priority: true,
    },
    {
      image: images.profile,
      alt: 'Tim White artist profile with release and fan actions',
      sizes: '(min-width: 1280px) 18rem, (min-width: 768px) 24vw, 34vw',
      className: 'homepage-product-pane--phone',
      priority: true,
    },
    {
      image: images.library,
      alt: 'Jovie media library with release assets organized for review',
      sizes: '(min-width: 1280px) 68rem, (min-width: 768px) 76vw, 88vw',
      className:
        'homepage-product-pane--desktop homepage-product-pane--library',
      priority: false,
    },
  ] as const;
}

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
  image: HomepageMarketingImage;
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
        loading={priority ? 'eager' : 'lazy'}
        fetchPriority={priority ? 'high' : 'auto'}
        sizes={sizes}
        unoptimized
        className='homepage-product-pane__image'
      />
    </figure>
  );
}

export function HomepageHeroCommandCenter({
  images,
}: Readonly<{ images: HomepageHeroCommandCenterImages }>) {
  const railRef = useRef<HTMLDivElement>(null);
  const productPanes = buildProductPanes(images);

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
        <a
          href='#homepage-product-previews-end'
          className='sr-only focus:not-sr-only focus:absolute focus:left-6 focus:top-6 focus:z-10 focus:rounded-md focus:bg-surface-0 focus:px-3 focus:py-2 focus:text-sm focus:font-medium focus:text-primary-token focus-ring-themed'
        >
          Skip Product Previews
        </a>
        {productPanes.map(pane => (
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
      <span id='homepage-product-previews-end' className='sr-only'>
        End of Product Previews
      </span>
    </section>
  );
}
