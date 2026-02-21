import type { FeaturedCreator } from '@/lib/featured-creators';

interface MobileProfilePreviewProps {
  readonly creator: FeaturedCreator;
}

function formatReleaseType(type: string | null): string {
  if (!type) return 'Latest release';
  return `${type.slice(0, 1).toUpperCase()}${type.slice(1)}`;
}

export function MobileProfilePreview({ creator }: MobileProfilePreviewProps) {
  const displayName = creator.name.trim() || creator.handle;
  const initial = displayName.slice(0, 1).toUpperCase();
  const primaryGenre = creator.genres[0] ?? 'Independent artist';
  const secondaryGenre = creator.genres[1];

  return (
    <div className='flex h-full flex-col px-5 pb-6 pt-10'>
      <div className='mb-5 flex flex-col items-center'>
        <div
          className='mb-3 flex h-16 w-16 items-center justify-center rounded-full text-lg font-semibold'
          style={{
            background: 'linear-gradient(135deg, #4f46e5, #7c3aed)',
            color: 'rgb(247, 248, 248)',
          }}
        >
          {initial}
        </div>
        <p
          className='text-sm font-medium'
          style={{ color: 'rgb(247, 248, 248)' }}
        >
          {displayName}
        </p>
        <p
          className='mt-0.5 text-xs'
          style={{ color: 'rgba(255, 255, 255, 0.6)' }}
        >
          {secondaryGenre
            ? `${primaryGenre} · ${secondaryGenre}`
            : primaryGenre}
        </p>
      </div>

      <div
        className='rounded-xl border p-3'
        style={{
          backgroundColor: 'rgba(255, 255, 255, 0.03)',
          borderColor: 'rgba(255, 255, 255, 0.1)',
        }}
      >
        <p className='truncate text-[13px] font-medium text-white'>
          {creator.latestReleaseTitle ?? 'New release coming soon'}
        </p>
        <p
          className='mt-1 text-[11px]'
          style={{ color: 'rgba(255, 255, 255, 0.56)' }}
        >
          {formatReleaseType(creator.latestReleaseType)}
        </p>
      </div>

      <div className='mt-auto pt-5'>
        <div
          className='w-full rounded-lg py-2.5 text-center text-xs font-medium'
          style={{
            backgroundColor: 'rgb(247, 248, 248)',
            color: 'rgb(8, 9, 10)',
          }}
        >
          Get updates from {displayName.split(' ')[0]}
        </div>
      </div>
    </div>
  );
}
