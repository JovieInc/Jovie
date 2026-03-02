'use client';

/**
 * ProfileAboutTab Component
 *
 * About tab content for the profile drawer. Displays the artist bio
 * and genre badges. Includes a placeholder "Generate" button for
 * future AI bio generation.
 */

import { Badge, Button } from '@jovie/ui';
import { Sparkles } from 'lucide-react';
import { toast } from 'sonner';
import { DrawerSection } from '@/components/molecules/drawer';

interface ProfileAboutTabProps {
  readonly bio: string | null;
  readonly genres: string[] | null;
}

export function ProfileAboutTab({ bio, genres }: ProfileAboutTabProps) {
  const hasGenres = genres && genres.length > 0;

  return (
    <div className='space-y-5'>
      {/* Bio section */}
      <DrawerSection title='Bio'>
        {bio ? (
          <p className='text-[13px] leading-relaxed text-secondary-token whitespace-pre-wrap'>
            {bio}
          </p>
        ) : (
          <div className='space-y-2'>
            <p className='text-[13px] text-tertiary-token'>
              No bio yet. Add a short description to tell fans who you are.
            </p>
            <Button
              size='sm'
              variant='ghost'
              className='gap-1.5 text-xs'
              onClick={() => {
                toast('Coming soon', {
                  description:
                    'AI bio generation will be available in a future update.',
                });
              }}
            >
              <Sparkles className='h-3.5 w-3.5' />
              Generate with AI
            </Button>
          </div>
        )}
        {bio && (
          <Button
            size='sm'
            variant='ghost'
            className='gap-1.5 text-xs mt-2'
            onClick={() => {
              toast('Coming soon', {
                description:
                  'AI bio generation will be available in a future update.',
              });
            }}
          >
            <Sparkles className='h-3.5 w-3.5' />
            Rewrite with AI
          </Button>
        )}
      </DrawerSection>

      {/* Genres section */}
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
            No genres added yet. Genres are automatically detected from your
            music platform connections.
          </p>
        )}
      </DrawerSection>
    </div>
  );
}
