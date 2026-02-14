'use client';

import { Loader2 } from 'lucide-react';
import { useDashboardData } from '@/app/app/(shell)/dashboard/DashboardDataContext';
import { JovieChat } from '@/components/jovie/JovieChat';

export function ProfilePageChat() {
  const { selectedProfile } = useDashboardData();

  if (!selectedProfile) {
    return (
      <div className='flex h-full items-center justify-center'>
        <Loader2 className='h-8 w-8 animate-spin text-secondary-token' />
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
