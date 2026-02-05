'use client';

import { Button } from '@jovie/ui';
import { Avatar } from '@/components/molecules/Avatar';
import { Icon } from '@/components/atoms/Icon';
import { Card, CardContent, CardHeader } from '@/components/molecules/Card';
import { LoadingSkeleton as Skeleton } from '@/components/molecules/LoadingSkeleton';
import { MAX_SOCIAL_LINKS } from '@/constants/app';
import { useCreator } from '@/hooks/useCreator';

export function CreatorProfile({ username }: Readonly<{ username: string }>) {
  const { creator, loading, error } = useCreator(username);

  if (loading) {
    return (
      <div className='space-y-6'>
        <div className='flex items-center space-x-4'>
          <Skeleton rounded='full' className='h-24 w-24' />
          <div className='space-y-2'>
            <Skeleton className='h-6 w-48' />
            <Skeleton className='h-4 w-32' />
          </div>
        </div>
        <Skeleton className='h-24 w-full' />
      </div>
    );
  }

  if (error || !creator) {
    return (
      <div className='rounded-lg border border-red-200 bg-red-50 p-4 text-red-800'>
        <p>Failed to load creator profile. Please try again later.</p>
      </div>
    );
  }

  return (
    <div className='space-y-6'>
      <div className='flex flex-col items-center space-y-4 sm:flex-row sm:space-x-6 sm:space-y-0'>
        <div className='relative'>
          <div className='absolute inset-0 -z-10 rounded-lg bg-surface-2/40 dark:bg-surface-2/30 blur-sm' />
          <Avatar
            src={creator.avatarUrl}
            alt={creator.displayName || creator.username}
            name={creator.displayName || creator.username}
            size='2xl'
            verified={creator.isVerified ?? undefined}
          />
        </div>
        <div className='text-center sm:text-left'>
          <h1 className='text-2xl font-bold'>
            {creator.displayName || creator.username}
          </h1>
          {creator.bio && (
            <p className='mt-2 text-muted-foreground'>{creator.bio}</p>
          )}
          {/* Social links: respect active state and cap to MAX_SOCIAL_LINKS visible */}
          <div className='mt-4 flex flex-wrap justify-center gap-2 sm:justify-start'>
            {creator.socialLinks
              ?.filter(link => link.isActive !== false)
              .slice(0, MAX_SOCIAL_LINKS)
              .map(link => (
                <Button
                  key={link.id}
                  variant='outline'
                  size='sm'
                  className='gap-2'
                  asChild
                >
                  <a href={link.url} target='_blank' rel='noopener noreferrer'>
                    <Icon name='ExternalLink' className='h-4 w-4' />
                    {link.displayText || link.platform}
                  </a>
                </Button>
              ))}
          </div>
        </div>
      </div>

      {creator.spotifyUrl && (
        <Card>
          <CardHeader className='pb-2'>
            <h2 className='text-lg font-semibold'>Latest Release</h2>
          </CardHeader>
          <CardContent>
            <div className='aspect-video w-full rounded-md bg-muted'>
              {/* Spotify embed or custom player component would go here */}
              <div className='flex h-full items-center justify-center'>
                <p className='text-muted-foreground'>
                  Music player placeholder
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
