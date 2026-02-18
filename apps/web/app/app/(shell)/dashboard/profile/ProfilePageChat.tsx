'use client';

import { MessageSquare } from 'lucide-react';
import { useDashboardData } from '@/app/app/(shell)/dashboard/DashboardDataContext';
import { JovieChat } from '@/components/jovie/JovieChat';

export function ProfilePageChat() {
  const { selectedProfile } = useDashboardData();

  if (!selectedProfile) {
    return (
      <div className='flex h-full flex-col'>
        {/* Empty message area skeleton */}
        <div className='flex flex-1 items-center justify-center'>
          <div className='flex flex-col items-center gap-3'>
            <MessageSquare className='h-8 w-8 text-tertiary-token opacity-40' />
            <div className='h-4 w-32 rounded skeleton' />
          </div>
        </div>
        {/* Input bar skeleton */}
        <div className='shrink-0 border-t border-subtle p-4'>
          <div className='h-10 rounded-lg skeleton' />
        </div>
      </div>
    );
  }

  return (
    <JovieChat
      profileId={selectedProfile.id}
      displayName={selectedProfile.displayName ?? undefined}
      avatarUrl={selectedProfile.avatarUrl}
    />
  );
}
