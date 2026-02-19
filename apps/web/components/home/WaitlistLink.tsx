'use client';

import { Button } from '@jovie/ui';
import Link from 'next/link';

export function WaitlistLink() {
  return (
    <div className='w-full space-y-6'>
      {/* Waitlist Call to Action */}
      <div className='relative'>
        <div className='flex items-center justify-center rounded-xl border border-white/20 bg-white/5 backdrop-blur-xs ring-1 ring-white/10 p-8 transition-all duration-200'>
          <div className='text-center space-y-4'>
            <h3 className='text-2xl font-bold text-white'>Coming Soon</h3>
            <p className='text-white/80 max-w-md'>
              Artist profile claiming is currently in beta. Join our waitlist to
              get early access when we launch.
            </p>
            <Button
              asChild
              variant='primary'
              size='lg'
              className='rounded-md bg-linear-to-r from-purple-600 to-pink-600 text-white hover:from-purple-700 hover:to-pink-700 transition-all duration-200'
            >
              <Link href='/signup'>Sign up</Link>
            </Button>
          </div>
        </div>
      </div>

      {/* Help Text */}
      <div className='text-center'>
        <p className='text-sm text-white/60'>
          Be the first to know when Jovie launches for all artists.
        </p>
      </div>
    </div>
  );
}
