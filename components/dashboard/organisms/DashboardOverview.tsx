import Link from 'next/link';
import type { DashboardData } from '@/app/dashboard/actions';
import { CopyToClipboardButton } from '@/components/dashboard/atoms/CopyToClipboardButton';
import { DashboardCard } from '@/components/dashboard/atoms/DashboardCard';
import { CompletionBanner } from '@/components/dashboard/molecules/CompletionBanner';
import { SetupTaskItem } from '@/components/dashboard/molecules/SetupTaskItem';
import { Button } from '@/components/ui/Button';
import { Artist, convertDrizzleCreatorProfileToArtist } from '@/types/db';

interface DashboardOverviewProps {
  initialData: DashboardData;
}

export function DashboardOverview({ initialData }: DashboardOverviewProps) {
  const artist: Artist | null = initialData.selectedProfile
    ? convertDrizzleCreatorProfileToArtist(initialData.selectedProfile)
    : null;

  if (!artist) {
    return null; // Safety: server should always provide a selected profile
  }

  const isHandleClaimed = Boolean(artist.owner_user_id);
  const hasMusicLink = Boolean(
    artist.spotify_url || artist.apple_music_url || artist.youtube_url
  );
  const hasSocialLinks = initialData.hasSocialLinks;
  const allTasksComplete = isHandleClaimed && hasMusicLink && hasSocialLinks;

  return (
    <div>
      <div className='mb-8'>
        <h1 className='text-2xl font-bold text-primary-token'>Dashboard</h1>
        <p className='text-secondary-token mt-1'>
          Welcome back, {artist.name || 'Artist'}
        </p>
      </div>

      <DashboardCard variant='settings'>
        <h3 className='text-lg font-medium text-primary-token mb-4'>
          {allTasksComplete ? 'Profile Ready!' : 'Complete Your Setup'}
        </h3>

        {allTasksComplete ? (
          <div className='space-y-4'>
            <CompletionBanner />
            <div className='flex gap-3'>
              <Button
                as={Link}
                href={`/${artist.handle}`}
                target='_blank'
                rel='noopener noreferrer'
                size='sm'
              >
                View Profile
              </Button>
              <CopyToClipboardButton relativePath={`/${artist.handle}`} />
            </div>
          </div>
        ) : (
          <ul role='list' className='space-y-3'>
            <SetupTaskItem
              index={1}
              title='Claim your handle'
              complete={isHandleClaimed}
              completeLabel='Handle claimed'
              incompleteLabel='Secure your unique profile URL'
              action={
                <Link
                  href='/dashboard/settings'
                  className='text-sm text-accent hover:text-accent/80 font-medium'
                >
                  Complete →
                </Link>
              }
            />

            <SetupTaskItem
              index={2}
              title='Add a music link'
              complete={hasMusicLink}
              completeLabel='Music link added'
              incompleteLabel='Connect Spotify, Apple Music, or YouTube'
              action={
                <Link
                  href='/dashboard/links'
                  className='text-sm text-accent hover:text-accent/80 font-medium'
                >
                  Add →
                </Link>
              }
            />

            <SetupTaskItem
              index={3}
              title='Add social links'
              complete={hasSocialLinks}
              completeLabel='Social links added'
              incompleteLabel='Connect Instagram, TikTok, Twitter, etc.'
              action={
                <Link
                  href='/dashboard/links'
                  className='text-sm text-accent hover:text-accent/80 font-medium'
                >
                  Add →
                </Link>
              }
            />
          </ul>
        )}
      </DashboardCard>
    </div>
  );
}
