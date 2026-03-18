'use client';

import { Radio } from 'lucide-react';
import { EmptyState } from '@/components/organisms/EmptyState';

export function DspPresenceEmptyState() {
  return (
    <div className='flex h-full items-center justify-center p-8'>
      <EmptyState
        icon={<Radio className='h-10 w-10' />}
        heading='No DSP profiles found'
        description='Once your music is matched to streaming platforms like Spotify, Apple Music, and Deezer, your profiles will appear here.'
      />
    </div>
  );
}
