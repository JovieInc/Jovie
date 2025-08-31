import { BackgroundPattern } from '@/components/atoms/BackgroundPattern';

export function ProfileSkeleton() {
  return (
    <div className='relative min-h-screen flex items-center justify-center bg-white dark:bg-gray-900'>
      <BackgroundPattern variant='gradient' />
      <div className='relative z-10 w-full max-w-md mx-auto px-4'>
        {/* Profile Shell Skeleton */}
        <div className='bg-white/60 dark:bg-white/5 backdrop-blur-lg border border-gray-200/30 dark:border-white/10 rounded-3xl p-8 shadow-xl shadow-black/5'>
          {/* Avatar */}
          <div className='text-center mb-6'>
            <div className='w-24 h-24 rounded-full skeleton motion-reduce:animate-none mx-auto mb-4'></div>
            {/* Name */}
            <div className='h-6 w-32 rounded-lg skeleton motion-reduce:animate-none mx-auto mb-2'></div>
            {/* Bio */}
            <div className='h-4 w-48 rounded-lg skeleton motion-reduce:animate-none mx-auto'></div>
          </div>

          {/* Action Buttons */}
          <div className='space-y-4'>
            {/* Listen Now Button */}
            <div className='h-12 w-full rounded-xl skeleton motion-reduce:animate-none'></div>
            {/* Optional Tip Button */}
            <div className='h-12 w-full rounded-xl skeleton motion-reduce:animate-none'></div>
          </div>
        </div>
      </div>
    </div>
  );
}
