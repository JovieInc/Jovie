import { Calendar, MapPin } from 'lucide-react';
import type { Artist } from '@/types/db';

interface AboutSectionProps {
  readonly artist: Artist;
  readonly genres?: string[] | null;
}

export function AboutSection({ artist, genres }: AboutSectionProps) {
  const hasBio = Boolean(artist.tagline);
  const hasLocation = Boolean(artist.location);
  const hasActiveSince = Boolean(artist.active_since_year);
  const hasGenres = genres && genres.length > 0;
  const hasMetadata = hasLocation || hasActiveSince;

  const hasContent = hasBio || hasMetadata || hasGenres;

  if (!hasContent) {
    return (
      <div className='rounded-2xl border border-subtle bg-surface-1/80 backdrop-blur-sm p-8 text-center'>
        <p className='text-sm text-tertiary-token'>
          No information available yet.
        </p>
      </div>
    );
  }

  return (
    <main className='space-y-4' aria-labelledby='about-title'>
      <h1 id='about-title' className='sr-only'>
        About {artist.name}
      </h1>

      <div className='rounded-2xl border border-subtle bg-surface-1/80 backdrop-blur-sm overflow-hidden'>
        {/* Bio */}
        {hasBio && (
          <div className='px-6 pt-6 pb-5'>
            <p className='text-base leading-relaxed text-secondary-token whitespace-pre-line'>
              {artist.tagline}
            </p>
          </div>
        )}

        {/* Metadata: location + active since */}
        {hasMetadata && (
          <div
            className={`px-6 pb-5 flex flex-wrap gap-x-5 gap-y-2 ${hasBio ? 'border-t border-subtle pt-5' : 'pt-6'}`}
          >
            {hasLocation && (
              <div className='flex items-center gap-2 text-sm text-tertiary-token'>
                <MapPin className='h-3.5 w-3.5 shrink-0' aria-hidden='true' />
                <span>{artist.location}</span>
              </div>
            )}
            {hasActiveSince && (
              <div className='flex items-center gap-2 text-sm text-tertiary-token'>
                <Calendar className='h-3.5 w-3.5 shrink-0' aria-hidden='true' />
                <span>Active since {artist.active_since_year}</span>
              </div>
            )}
          </div>
        )}

        {/* Genre tags */}
        {hasGenres && (
          <div
            className={`px-6 pb-6 ${hasBio || hasMetadata ? 'border-t border-subtle pt-5' : 'pt-6'}`}
          >
            <div className='flex flex-wrap gap-2'>
              {genres.map(genre => (
                <span
                  key={genre}
                  className='rounded-full bg-surface-2 px-3 py-1 text-xs font-medium text-secondary-token'
                >
                  {genre}
                </span>
              ))}
            </div>
          </div>
        )}
      </div>
    </main>
  );
}
