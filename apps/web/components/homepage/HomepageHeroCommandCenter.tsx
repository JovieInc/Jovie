'use client';

import Image from 'next/image';

type HomepageMarketingImage = {
  readonly publicUrl: string;
  readonly width: number;
  readonly height: number;
  readonly alt: string;
};

export type HomepageHeroCommandCenterImages = {
  readonly product: HomepageMarketingImage;
};

function ProductPane({
  alt,
  className,
  image,
  priority = false,
  sizes,
}: Readonly<{
  alt: string;
  className: string;
  image: HomepageMarketingImage;
  priority?: boolean;
  sizes: string;
}>) {
  return (
    <figure
      className={`homepage-product-pane system-b-mounted-home-command-pane ${className}`}
      data-product-pane
    >
      <Image
        src={image.publicUrl}
        alt={alt}
        width={image.width}
        height={image.height}
        loading={priority ? 'eager' : 'lazy'}
        fetchPriority={priority ? 'high' : 'auto'}
        sizes={sizes}
        className='homepage-product-pane__image'
        quality={85}
      />
    </figure>
  );
}

export function HomepageHeroCommandCenter({
  images,
}: Readonly<{ images: HomepageHeroCommandCenterImages }>) {
  return (
    <section
      aria-label='Jovie Release Operating System'
      className='homepage-hero-command-center system-b-mounted-home-command-center'
      data-testid='homepage-hero-command-center'
    >
      <div className='homepage-product-rail system-b-mounted-home-command-rail'>
        <ProductPane
          image={images.product}
          alt='Jovie release workspace with release status, assets, and launch progress'
          sizes='(min-width: 1360px) 1298px, (min-width: 768px) calc(100vw - 4rem), calc(100vw - 3rem)'
          className='homepage-product-pane--desktop'
          priority
        />
      </div>
    </section>
  );
}
