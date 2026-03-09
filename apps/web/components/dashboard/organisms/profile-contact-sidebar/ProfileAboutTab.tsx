'use client';

import { Badge } from '@jovie/ui';
import { DrawerSection } from '@/components/molecules/drawer';

interface ProfileAboutTabProps {
  readonly bio: string | null;
  readonly genres: string[] | null;
}

export function ProfileAboutTab({ bio, genres }: ProfileAboutTabProps) {
  const hasGenres = genres && genres.length > 0;

  return (
    <div className='space-y-5'>
      <DrawerSection title='Bio'>
        {bio ? (
          <p className='text-[13px] leading-relaxed text-secondary-token whitespace-pre-wrap'>
            {bio}
          </p>
        ) : (
          <p className='text-[13px] text-tertiary-token'>
            No bio yet. Use the chat to generate one.
          </p>
        )}
      </DrawerSection>

      <DrawerSection title='Genres'>
        {hasGenres ? (
          <div className='flex flex-wrap gap-1.5'>
            {genres.map(genre => (
              <Badge key={genre} variant='secondary'>
                {genre}
              </Badge>
            ))}
          </div>
        ) : (
          <p className='text-[13px] text-tertiary-token'>
            Auto-detected from your music connections.
          </p>
        )}
      </DrawerSection>
    </div>
  );
}
