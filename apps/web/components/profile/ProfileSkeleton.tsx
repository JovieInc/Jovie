import { BackgroundPattern } from '@/components/atoms/BackgroundPattern';
import {
  ButtonSkeleton,
  ProfileSkeleton as ProfileHeaderSkeleton,
  SocialBarSkeleton,
} from '@/components/molecules/LoadingSkeleton';
import { Container } from '@/components/site/Container';

export function ProfileSkeleton() {
  return (
    // role="status" is correct for loading states; <output> is for form calculation results
    <div
      className='min-h-screen bg-base text-primary-token transition-colors duration-200 relative overflow-hidden'
      role='status'
      aria-busy='true'
      aria-label='Loading Jovie profile'
    >
      <BackgroundPattern variant='gradient' />
      <div className='absolute top-1/4 left-1/4 w-96 h-96 bg-surface-2 rounded-full blur-3xl opacity-40' />
      <div className='absolute bottom-1/4 right-1/4 w-96 h-96 bg-surface-3 rounded-full blur-3xl opacity-35' />
      <Container>
        {/* Top chrome placeholders to prevent layout shift */}
        <div className='absolute top-4 left-4 z-10'>
          <div
            className='h-8 w-8 rounded-full skeleton motion-reduce:animate-none'
            aria-hidden='true'
          />
        </div>
        <div className='absolute top-4 right-4 z-10'>
          <div
            className='h-8 w-8 rounded-full skeleton motion-reduce:animate-none'
            aria-hidden='true'
          />
        </div>
        <div className='flex min-h-screen flex-col py-12 relative z-10'>
          <div className='flex-1 flex flex-col items-center justify-start px-4'>
            <div className='w-full max-w-md space-y-8'>
              {/* Profile Shell Skeleton */}
              <div className='flex flex-col items-center space-y-3 sm:space-y-4 text-center'>
                {/* Avatar */}
                {/* Name */}
                {/* Bio */}
                <ProfileHeaderSkeleton />
              </div>
              <div className='space-y-4 w-full'>
                {/* Action Buttons */}
                {/* Listen Now Button */}
                <ButtonSkeleton />
                {/* Optional Tip Button */}
                <ButtonSkeleton />
              </div>
              <div className='flex justify-between items-center'>
                <div className='flex-1 flex justify-start'>
                  <SocialBarSkeleton />
                </div>
                <div className='shrink-0 w-32'>
                  <ButtonSkeleton />
                </div>
              </div>
              <div className='flex justify-center pt-4'>
                <div className='h-4 w-40 rounded-full skeleton motion-reduce:animate-none' />
              </div>
            </div>
          </div>
        </div>
      </Container>
    </div>
  );
}
