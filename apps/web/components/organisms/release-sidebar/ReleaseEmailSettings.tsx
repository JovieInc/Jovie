'use client';

import { Mail, Megaphone } from 'lucide-react';

interface ReleaseEmailSettingsProps {
  readonly announceEmailEnabled: boolean;
  readonly releaseDayEmailEnabled: boolean;
  readonly hasAnnouncementDate: boolean;
  readonly hasReleaseDate: boolean;
  readonly announcementDateLabel?: string;
  readonly releaseDateLabel?: string;
  readonly onAnnounceEmailChange?: (enabled: boolean) => void;
  readonly onReleaseDayEmailChange?: (enabled: boolean) => void;
  readonly readOnly?: boolean;
}

export function ReleaseEmailSettings({
  announceEmailEnabled,
  releaseDayEmailEnabled,
  hasAnnouncementDate,
  hasReleaseDate,
  announcementDateLabel,
  releaseDateLabel,
  onAnnounceEmailChange,
  onReleaseDayEmailChange,
  readOnly = false,
}: ReleaseEmailSettingsProps) {
  return (
    <div className='space-y-3'>
      <h4 className='text-xs font-semibold uppercase tracking-wider text-tertiary-token'>
        Fan Notifications
      </h4>

      {/* Announcement email */}
      <label className='flex items-start gap-3'>
        <input
          type='checkbox'
          checked={announceEmailEnabled}
          onChange={e => onAnnounceEmailChange?.(e.target.checked)}
          disabled={readOnly || !hasAnnouncementDate}
          className='mt-0.5 h-4 w-4 rounded border-border disabled:opacity-50'
        />
        <div className='flex-1'>
          <div className='flex items-center gap-1.5 text-sm font-medium text-primary-token'>
            <Megaphone className='h-4 w-4 text-tertiary-token' />
            Announcement email
          </div>
          <p className='text-xs text-tertiary-token'>
            {hasAnnouncementDate
              ? `Fans will be emailed "coming soon"${announcementDateLabel ? ` on ${announcementDateLabel}` : ''}`
              : 'Set an announcement date first'}
          </p>
        </div>
      </label>

      {/* Release day email */}
      <label className='flex items-start gap-3'>
        <input
          type='checkbox'
          checked={releaseDayEmailEnabled}
          onChange={e => onReleaseDayEmailChange?.(e.target.checked)}
          disabled={readOnly || !hasReleaseDate}
          className='mt-0.5 h-4 w-4 rounded border-border disabled:opacity-50'
        />
        <div className='flex-1'>
          <div className='flex items-center gap-1.5 text-sm font-medium text-primary-token'>
            <Mail className='h-4 w-4 text-tertiary-token' />
            Release day email
          </div>
          <p className='text-xs text-tertiary-token'>
            {hasReleaseDate
              ? `Fans will be emailed "out now"${releaseDateLabel ? ` on ${releaseDateLabel}` : ''}`
              : 'Set a release date first'}
          </p>
        </div>
      </label>
    </div>
  );
}
