'use client';

import { Calendar, Copy } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';
import { SettingsActionRow } from '@/components/features/dashboard/molecules/SettingsActionRow';
import { SettingsPanel } from '@/components/features/dashboard/molecules/SettingsPanel';
import { SettingsSection } from '@/features/dashboard/organisms/SettingsSection';
import { SettingsTouringSection } from '@/features/dashboard/organisms/SettingsTouringSection';
import { useSettingsContext } from '@/features/dashboard/organisms/useSettingsContext';
import { PageErrorState } from '@/features/feedback/PageErrorState';

export function TouringContent() {
  const { artist } = useSettingsContext();

  if (!artist) {
    return (
      <PageErrorState message='Unable to load your profile settings. Please refresh the page.' />
    );
  }

  return (
    <SettingsSection
      id='touring'
      title='Touring'
      description='Connect Bandsintown to display tour dates on your profile.'
    >
      <SettingsTouringSection profileId={artist.id} />
      <CalendarSubscribeRow
        username={artist.handle}
        isPublicProfile={artist.published}
      />
    </SettingsSection>
  );
}

function CalendarSubscribeRow({
  username,
  isPublicProfile,
}: {
  readonly username: string;
  readonly isPublicProfile: boolean;
}) {
  const [copied, setCopied] = useState(false);
  const subscribeUrl = globalThis.location?.origin
    ? `${globalThis.location.origin}/api/calendar/profile/${username}`
    : `/api/calendar/profile/${username}`;

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(subscribeUrl);
      setCopied(true);
      toast.success('Subscribe URL copied');
      setTimeout(() => setCopied(false), 1500);
    } catch {
      toast.error('Could not copy. Please copy manually.');
    }
  };

  return (
    <SettingsPanel>
      <div className='px-4 py-4 sm:px-5'>
        <SettingsActionRow
          icon={<Calendar className='h-4 w-4' aria-hidden />}
          title='Subscribe URL'
          description={
            isPublicProfile
              ? 'Anyone with this link sees your confirmed tour dates in Google, Apple, or Outlook calendar. Public — share with your team, manager, or industry contacts.'
              : 'Publish your profile to enable a public subscribe URL for your confirmed tour dates.'
          }
          action={
            isPublicProfile ? (
              <button
                type='button'
                onClick={handleCopy}
                className='inline-flex items-center gap-1.5 rounded-md border border-subtle bg-surface-1 px-2.5 py-1 text-2xs text-secondary-token hover:bg-surface-2'
              >
                <Copy className='h-3.5 w-3.5' />
                {copied ? 'Copied' : 'Copy Link'}
              </button>
            ) : undefined
          }
        />
      </div>
    </SettingsPanel>
  );
}
