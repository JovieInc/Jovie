import Image from 'next/image';
import Link from 'next/link';
import { ArtistProfileSectionHeader } from '@/components/marketing/artist-profile/ArtistProfileSectionHeader';
import { ArtistProfileSectionShell } from '@/components/marketing/artist-profile/ArtistProfileSectionShell';
import { ArtistProfileSpecWall } from '@/components/marketing/artist-profile/ArtistProfileSpecWall';
import {
  FRAMER_KIT_COPY,
  FRAMER_KIT_SHOWCASE_TILES,
  FRAMER_KIT_SPEC_TILES,
  type FramerKitShowcaseTile,
} from '@/data/framerKitCopy';
import { getMarketingExportImage } from '@/lib/screenshots/registry';
import { cn } from '@/lib/utils';
import './MarketingFramerKit.css';

function ShowcaseShot({
  alt,
  scenarioId,
}: Readonly<{
  alt: string;
  scenarioId: string;
}>) {
  const image = getMarketingExportImage(scenarioId);

  return (
    <div className='framer-kit-showcase__media'>
      <Image
        fill
        alt={alt}
        className='object-contain'
        sizes='(min-width: 1280px) 28vw, (min-width: 768px) 45vw, 100vw'
        src={image.publicUrl}
      />
    </div>
  );
}

function ShowcaseTileCopy({
  tile,
}: Readonly<{
  tile: FramerKitShowcaseTile;
}>) {
  return (
    <div className='framer-kit-showcase__copy'>
      <h3 className='framer-kit-showcase__title'>{tile.title}</h3>
      <p className='framer-kit-showcase__site'>{tile.site}</p>
    </div>
  );
}

function ShowcaseTile({
  tile,
}: Readonly<{
  tile: FramerKitShowcaseTile;
}>) {
  const shot = (
    <ShowcaseShot alt={tile.screenshotAlt} scenarioId={tile.scenarioId} />
  );

  if (tile.href) {
    return (
      <li className='framer-kit-showcase__tile'>
        <Link
          href={tile.href}
          className='framer-kit-showcase__link'
          data-testid='framer-kit-showcase-tile'
        >
          {shot}
          <ShowcaseTileCopy tile={tile} />
        </Link>
      </li>
    );
  }

  return (
    <li className='framer-kit-showcase__tile'>
      <article
        className='framer-kit-showcase__static'
        data-testid='framer-kit-showcase-tile'
      >
        {shot}
        <ShowcaseTileCopy tile={tile} />
      </article>
    </li>
  );
}

export function MarketingShippedSitesShowcase({
  className,
}: Readonly<{
  className?: string;
}> = {}) {
  return (
    <ArtistProfileSectionShell className={cn('framer-kit-showcase', className)}>
      <div
        className='mx-auto max-w-public-content'
        data-testid='framer-kit-showcase'
      >
        <ArtistProfileSectionHeader
          align='left'
          headline={FRAMER_KIT_COPY.showcase.headline}
          body={FRAMER_KIT_COPY.showcase.body}
          className='max-w-3xl'
          bodyClassName='max-w-xl'
        />
        <ul className='framer-kit-showcase__grid'>
          {FRAMER_KIT_SHOWCASE_TILES.map(tile => (
            <ShowcaseTile key={tile.id} tile={tile} />
          ))}
        </ul>
      </div>
    </ArtistProfileSectionShell>
  );
}

export function MarketingPlatformSpecBento({
  className,
}: Readonly<{
  className?: string;
}> = {}) {
  return (
    <div
      className={cn('framer-kit-spec-bento', className)}
      data-testid='framer-kit-spec-bento'
    >
      <ArtistProfileSpecWall
        specWall={FRAMER_KIT_COPY.specBento}
        tiles={FRAMER_KIT_SPEC_TILES}
      />
    </div>
  );
}
