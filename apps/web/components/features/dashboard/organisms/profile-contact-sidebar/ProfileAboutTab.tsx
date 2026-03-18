'use client';

import { Badge } from '@jovie/ui';
import { updateAllowProfilePhotoDownloads } from '@/app/app/(shell)/dashboard/actions/creator-profile';
import {
  DrawerAsyncToggle,
  DrawerSection,
} from '@/components/molecules/drawer';

interface ProfileAboutTabProps {
  readonly bio: string | null;
  readonly genres: string[] | null;
  readonly allowPhotoDownloads: boolean;
}

export function ProfileAboutTab({
  bio,
  genres,
  allowPhotoDownloads,
}: ProfileAboutTabProps) {
  const hasGenres = genres && genres.length > 0;

  return (
    <div className='space-y-5'>
      <DrawerSection title='Bio' collapsible={false}>
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

      <DrawerSection title='Genres' collapsible={false}>
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

      <DrawerSection title='Settings' collapsible={false}>
        <DrawerAsyncToggle
          label='Photo downloads'
          ariaLabel='Allow profile photo downloads on public pages'
          checked={allowPhotoDownloads}
          onToggle={updateAllowProfilePhotoDownloads}
          successMessage={on =>
            on
              ? 'Photo downloads enabled for visitors'
              : 'Photo downloads disabled'
          }
        />
      </DrawerSection>
    </div>
  );
}
