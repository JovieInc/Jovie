import type { LucideIcon } from 'lucide-react';
import { Link2, PlugZap, Sparkles, Zap } from 'lucide-react';
import type { CSSProperties } from 'react';
import type { ArtistProfileLandingCopy } from '@/data/artistProfileCopy';
import type { ArtistProfileFeatureTile } from '@/data/artistProfileFeatures';
import { ArtistProfileSectionShell } from './ArtistProfileSectionShell';

const SPEC_TILE_ICONS: Partial<
  Record<ArtistProfileFeatureTile['id'], LucideIcon>
> = {
  'fast-by-design': Zap,
  'deep-link-modes': Link2,
  'share-ready': PlugZap,
};

const SPEC_TILE_POSITIONS: Partial<
  Record<ArtistProfileFeatureTile['id'], string>
> = {
  'fast-by-design': 'lg:left-20 lg:top-20',
  'deep-link-modes': 'lg:right-20 lg:top-20',
  'share-ready': 'lg:bottom-16 lg:left-1/2 lg:-translate-x-1/2',
};

const SPEC_TILE_ACCENTS: Record<ArtistProfileFeatureTile['accent'], string> = {
  blue: 'var(--color-accent-blue)',
  purple: 'var(--color-accent-purple)',
  pink: 'var(--color-accent-pink)',
  orange: 'var(--color-accent-orange)',
  green: 'var(--color-accent-green)',
  teal: 'var(--color-accent-teal)',
  gray: 'var(--color-accent-gray)',
};

type SpecAccentStyle = CSSProperties & {
  readonly '--spec-accent': string;
};

interface ArtistProfileSpecWallProps {
  readonly specWall: ArtistProfileLandingCopy['specWall'];
  readonly tiles: readonly ArtistProfileFeatureTile[];
}

function ArtistProfileSpecNode({
  tile,
}: {
  readonly tile: ArtistProfileFeatureTile;
}) {
  const Icon = SPEC_TILE_ICONS[tile.id] ?? Sparkles;
  const accent = SPEC_TILE_ACCENTS[tile.accent];
  const position = SPEC_TILE_POSITIONS[tile.id] ?? '';
  const style: SpecAccentStyle = {
    '--spec-accent': accent,
  };

  return (
    <article
      className={`group relative rounded-[1.35rem] border border-white/[0.08] bg-black/55 p-4 backdrop-blur-xl transition-colors duration-200 hover:border-[color:var(--spec-accent)] sm:p-5 lg:!absolute lg:w-[19.5rem] lg:p-4 ${position}`}
      style={style}
    >
      <div
        className='absolute inset-0 rounded-[inherit] opacity-0 transition-opacity duration-200 group-hover:opacity-100'
        style={{
          background:
            'radial-gradient(circle at 18% 0%, color-mix(in srgb, var(--spec-accent) 18%, transparent), transparent 58%)',
        }}
        aria-hidden='true'
      />
      <div className='relative z-10 flex items-center gap-3'>
        <span
          className='flex h-6 w-6 shrink-0 items-center justify-center'
          style={{
            color: 'var(--spec-accent)',
          }}
          aria-hidden='true'
        >
          <Icon className='h-4 w-4' strokeWidth={1.9} />
        </span>
        <h3 className='text-[14px] font-semibold tracking-[-0.02em] text-primary-token'>
          {tile.title}
        </h3>
      </div>
      <p className='relative z-10 mt-4 text-[13px] leading-[1.5] text-secondary-token'>
        {tile.body}
      </p>
    </article>
  );
}

export function ArtistProfileSpecWall({
  specWall,
  tiles,
}: Readonly<ArtistProfileSpecWallProps>) {
  return (
    <ArtistProfileSectionShell
      width='landing'
      className='pt-40 pb-12 sm:py-16 lg:py-16'
      containerClassName='lg:max-w-none'
    >
      <div className='relative overflow-hidden rounded-[2rem] border border-white/[0.06] bg-[radial-gradient(circle_at_50%_47%,rgba(155,77,255,0.11),transparent_23%),radial-gradient(circle_at_50%_47%,rgba(255,255,255,0.04),transparent_43%),#000] px-5 py-8 sm:px-8 sm:py-10 lg:min-h-[640px] lg:px-8 lg:py-8'>
        <div
          className='pointer-events-none absolute inset-x-[13%] top-[19%] hidden h-[62%] rounded-full border border-white/[0.08] lg:block'
          aria-hidden='true'
        />
        <div
          className='pointer-events-none absolute inset-x-[24%] top-[28%] hidden h-[44%] rounded-full border border-white/[0.06] lg:block'
          aria-hidden='true'
        />
        {[0, 60, 120].map(rotation => (
          <span
            key={rotation}
            className='pointer-events-none absolute left-1/2 top-1/2 hidden h-px w-[min(72vw,70rem)] -translate-x-1/2 -translate-y-1/2 bg-gradient-to-r from-transparent via-white/[0.14] to-transparent lg:block'
            style={{
              transform: `translate(-50%, -50%) rotate(${rotation}deg)`,
            }}
            aria-hidden='true'
          />
        ))}

        <div className='relative z-10 mb-8 lg:!absolute lg:inset-0 lg:mb-0 lg:flex lg:items-center lg:justify-center lg:px-20'>
          <div>
            <h2 className='marketing-h2-linear text-primary-token lg:max-w-none lg:whitespace-nowrap lg:text-center lg:!text-[clamp(3.4rem,5.7vw,5.25rem)] lg:!font-semibold lg:!leading-[0.9] lg:!tracking-[-0.06em]'>
              {specWall.headline}
            </h2>
            {specWall.lead ? (
              <p className='mt-5 max-w-[38rem] text-[15px] leading-[1.7] text-secondary-token lg:text-center'>
                {specWall.lead}
              </p>
            ) : null}
          </div>
        </div>

        <div className='relative z-20 grid gap-3 sm:grid-cols-2 lg:!absolute lg:inset-0 lg:block'>
          {tiles.map(tile => (
            <ArtistProfileSpecNode key={tile.id} tile={tile} />
          ))}
        </div>
      </div>
    </ArtistProfileSectionShell>
  );
}
