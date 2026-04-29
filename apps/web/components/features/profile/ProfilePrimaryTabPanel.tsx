'use client';

import { Bell, CheckCircle2, ChevronRight, Mail } from 'lucide-react';
import { AboutSection } from '@/features/profile/AboutSection';
import type {
  ProfilePreviewNotificationsState,
  ProfilePrimaryTab,
  ProfileRenderMode,
} from '@/features/profile/contracts';
import type { PublicRelease } from '@/features/profile/releases/types';
import { StaticListenInterface } from '@/features/profile/StaticListenInterface';
import { TourDrawerContent } from '@/features/profile/TourModePanel';
import { ReleasesView } from '@/features/profile/views/ReleasesView';
import type { AvailableDSP } from '@/lib/dsp';
import type { TourDateViewModel } from '@/lib/tour-dates/types';
import { cn } from '@/lib/utils';
import type { Artist } from '@/types/db';
import type { NotificationContentType } from '@/types/notifications';
import type { PressPhoto } from '@/types/press-photos';

const PANEL_CLASS_NAME =
  'rounded-[34px] border border-white/8 bg-[linear-gradient(180deg,rgba(255,255,255,0.05),rgba(255,255,255,0.025))] p-5 shadow-[0_28px_72px_rgba(0,0,0,0.26)] backdrop-blur-2xl';
const OTP_SLOT_KEYS = ['a', 'b', 'c', 'd', 'e', 'f'] as const;
const NATIVE_PANEL_CLASS_NAME = '-mx-4 space-y-0 pb-2';

interface ProfilePrimaryTabPanelProps {
  readonly mode: Exclude<ProfilePrimaryTab, 'profile'>;
  readonly renderMode?: ProfileRenderMode;
  readonly artist: Artist;
  readonly notificationsPortalContainer?: HTMLElement | null;
  readonly dsps: AvailableDSP[];
  readonly enableDynamicEngagement?: boolean;
  readonly subscribeTwoStep?: boolean;
  readonly isSubscribed: boolean;
  readonly contentPrefs: Record<NotificationContentType, boolean>;
  readonly onTogglePref: (key: NotificationContentType) => void;
  readonly onUnsubscribe: () => void;
  readonly isUnsubscribing: boolean;
  readonly genres?: string[] | null;
  readonly pressPhotos?: readonly PressPhoto[];
  readonly allowPhotoDownloads?: boolean;
  readonly tourDates?: readonly TourDateViewModel[];
  readonly releases?: readonly PublicRelease[];
  readonly previewNotificationsState?: ProfilePreviewNotificationsState;
  readonly onFlowClosed?: () => void;
  readonly onSubscriptionActivated?: () => void;
}

function SectionIntro({
  title,
  body,
}: Readonly<{
  title: string;
  body?: string;
}>) {
  return (
    <div className={cn('space-y-1', body ? 'mb-4' : 'mb-3')}>
      <p className='text-[13px] font-semibold tracking-[-0.015em] text-white/56'>
        {title}
      </p>
      {body ? (
        <p className='max-w-[28ch] text-sm leading-6 text-white/68'>{body}</p>
      ) : null}
    </div>
  );
}

function PreviewAlertsPanel({
  state,
  isSubscribed,
}: Readonly<{
  state: ProfilePreviewNotificationsState;
  isSubscribed: boolean;
}>) {
  const resolvedTitle =
    state.kind === 'status'
      ? 'Alerts On'
      : isSubscribed
        ? 'Manage Alerts'
        : 'Turn On Alerts';
  const resolvedBody =
    state.helper ??
    (state.kind === 'status'
      ? 'Music, shows, and merch updates are ready.'
      : 'Get new music and tour updates the moment they land.');

  return (
    <div
      className={PANEL_CLASS_NAME}
      data-testid='profile-primary-tab-subscribe'
    >
      <div className='space-y-4'>
        <div className='inline-flex h-10 w-10 items-center justify-center rounded-full border border-[color:var(--profile-status-pill-border)] bg-[color:var(--profile-status-pill-bg)] text-[color:var(--profile-status-pill-fg)]'>
          {state.kind === 'status' ? (
            <CheckCircle2 className='size-4.5' />
          ) : (
            <Bell className='size-4.5' />
          )}
        </div>

        <div className='space-y-1.5'>
          <p className='text-[22px] font-semibold tracking-[-0.045em] text-white'>
            {resolvedTitle}
          </p>
          <p className='max-w-[28ch] text-sm leading-6 text-white/68'>
            {resolvedBody}
          </p>
        </div>

        {state.kind === 'button' ? (
          <div className='inline-flex items-center gap-2 rounded-full border border-white/14 bg-white/[0.08] px-4 py-3 text-sm font-semibold text-white'>
            <Bell className='h-4 w-4' />
            <span>{isSubscribed ? 'Manage alerts' : 'Turn on alerts'}</span>
          </div>
        ) : null}

        {state.kind === 'input' ||
        state.kind === 'name' ||
        state.kind === 'birthday' ? (
          <div className='space-y-3'>
            <div className='rounded-[22px] border border-white/12 bg-white/[0.06] px-4 py-3 text-sm text-white/72'>
              {state.value || state.label}
            </div>
            <div className='inline-flex items-center justify-center rounded-full bg-white px-4 py-2 text-sm font-semibold text-black'>
              {state.actionLabel || 'Continue'}
            </div>
          </div>
        ) : null}

        {state.kind === 'otp' ? (
          <div className='space-y-3'>
            <div className='grid grid-cols-6 gap-2'>
              {OTP_SLOT_KEYS.map((slotKey, index) => (
                <div
                  key={`otp-${slotKey}`}
                  className='flex h-11 items-center justify-center rounded-[16px] border border-white/12 bg-white/[0.06] text-sm font-semibold text-white/78'
                >
                  {state.value?.[index] ?? ''}
                </div>
              ))}
            </div>
            <div className='inline-flex items-center justify-center rounded-full bg-white px-4 py-2 text-sm font-semibold text-black'>
              {state.actionLabel || 'Verify'}
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}

function SubscribePanel({
  isSubscribed,
  contentPrefs,
  onTogglePref,
  onUnsubscribe,
  isUnsubscribing,
  renderMode,
  previewNotificationsState,
}: Readonly<{
  isSubscribed: boolean;
  contentPrefs: Record<NotificationContentType, boolean>;
  onTogglePref: (key: NotificationContentType) => void;
  onUnsubscribe: () => void;
  isUnsubscribing: boolean;
  renderMode: ProfileRenderMode;
  previewNotificationsState?: ProfilePreviewNotificationsState;
}>) {
  if (renderMode === 'preview') {
    return (
      <PreviewAlertsPanel
        state={
          previewNotificationsState ?? {
            kind: 'button',
            tone: 'quiet',
            label: 'Turn on alerts',
          }
        }
        isSubscribed={isSubscribed}
      />
    );
  }

  return (
    <AlertsSettingsView
      isSubscribed={isSubscribed}
      contentPrefs={contentPrefs}
      onTogglePref={onTogglePref}
      onUnsubscribe={onUnsubscribe}
      isUnsubscribing={isUnsubscribing}
    />
  );
}

function SettingsToggle({
  checked,
  disabled,
}: Readonly<{
  checked: boolean;
  disabled?: boolean;
}>) {
  return (
    <span
      className={cn(
        'relative h-[26px] w-[42px] shrink-0 rounded-full border p-0.5 transition-colors duration-200',
        checked
          ? 'border-white/40 bg-white'
          : 'border-white/14 bg-white/[0.08]',
        disabled && 'opacity-45'
      )}
      aria-hidden='true'
    >
      <span
        className={cn(
          'block h-[22px] w-[22px] rounded-full shadow-[0_4px_10px_rgba(0,0,0,0.22)] transition-transform duration-200',
          checked ? 'translate-x-4 bg-black' : 'translate-x-0 bg-white'
        )}
      />
    </span>
  );
}

function AlertsSettingsRow({
  label,
  description,
  checked,
  disabled,
  onClick,
}: Readonly<{
  label: string;
  description: string;
  checked: boolean;
  disabled?: boolean;
  onClick: () => void;
}>) {
  return (
    <button
      type='button'
      onClick={onClick}
      disabled={disabled}
      className='flex min-h-[62px] w-full items-center gap-3 border-t border-white/[0.075] px-4 py-3 text-left transition-colors duration-200 first:border-t-0 hover:bg-white/[0.03] disabled:cursor-default disabled:hover:bg-transparent'
    >
      <div className='min-w-0 flex-1'>
        <p className='truncate text-[15px] font-medium tracking-[-0.01em] text-white'>
          {label}
        </p>
        <p className='truncate text-[12px] leading-4 text-white/50'>
          {description}
        </p>
      </div>
      <SettingsToggle checked={checked} disabled={disabled} />
    </button>
  );
}

function AlertsStatusRow({
  label,
  description,
  checked,
}: Readonly<{
  label: string;
  description: string;
  checked: boolean;
}>) {
  return (
    <div className='flex min-h-[62px] w-full items-center gap-3 border-t border-white/[0.075] px-4 py-3 first:border-t-0'>
      <div className='min-w-0 flex-1'>
        <p className='truncate text-[15px] font-medium tracking-[-0.01em] text-white'>
          {label}
        </p>
        <p className='truncate text-[12px] leading-4 text-white/50'>
          {description}
        </p>
      </div>
      <SettingsToggle checked={checked} />
    </div>
  );
}

function AlertsSettingsView({
  isSubscribed,
  contentPrefs,
  onTogglePref,
  onUnsubscribe,
  isUnsubscribing,
}: Readonly<{
  isSubscribed: boolean;
  contentPrefs: Record<NotificationContentType, boolean>;
  onTogglePref: (key: NotificationContentType) => void;
  onUnsubscribe: () => void;
  isUnsubscribing: boolean;
}>) {
  const disabled = !isSubscribed;

  return (
    <div
      className={NATIVE_PANEL_CLASS_NAME}
      data-testid='profile-alerts-settings'
    >
      <div className='flex items-baseline justify-between px-4 pb-2 pt-3'>
        <h2 className='text-[22px] font-[680] leading-none tracking-[-0.025em] text-white'>
          Alerts
        </h2>
        <span className='text-[13px] font-medium text-white/52'>
          {isSubscribed ? 'On' : 'Off'}
        </span>
      </div>

      <div className='border-y border-white/[0.075]'>
        <div className='px-4 py-2 text-[12px] font-semibold tracking-[-0.01em] text-white/46'>
          Jovie Alerts
        </div>
        <AlertsStatusRow
          label='Release Reminders'
          description='Smart reminders for music you signed up for.'
          checked={isSubscribed}
        />
        <AlertsStatusRow
          label='Nearby Events'
          description='Useful show reminders when dates matter.'
          checked={isSubscribed}
        />
        <AlertsStatusRow
          label='Account Updates'
          description='Receipts, confirmation, and opt-out links.'
          checked={isSubscribed}
        />
      </div>

      <div className='mt-4 border-y border-white/[0.075]'>
        <div className='px-4 py-2 text-[12px] font-semibold tracking-[-0.01em] text-white/46'>
          Artist Alerts
        </div>
        <AlertsSettingsRow
          label='New Music'
          description='Direct artist emails about singles, albums, and videos.'
          checked={contentPrefs.newMusic}
          disabled={disabled}
          onClick={() => onTogglePref('newMusic')}
        />
        <AlertsSettingsRow
          label='Events'
          description='Direct artist emails about tour dates and tickets.'
          checked={contentPrefs.tourDates}
          disabled={disabled}
          onClick={() => onTogglePref('tourDates')}
        />
        <AlertsSettingsRow
          label='Merch'
          description='Direct artist emails about drops and restocks.'
          checked={contentPrefs.merch}
          disabled={disabled}
          onClick={() => onTogglePref('merch')}
        />
        <AlertsSettingsRow
          label='General'
          description='Occasional direct artist updates.'
          checked={contentPrefs.general}
          disabled={disabled}
          onClick={() => onTogglePref('general')}
        />
      </div>

      <div className='flex items-center gap-3 border-b border-white/[0.075] px-4 py-3.5'>
        <span className='flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-white/[0.06] text-white/72'>
          <Mail className='h-4 w-4' />
        </span>
        <div className='min-w-0 flex-1'>
          <p className='truncate text-[15px] font-medium tracking-[-0.01em] text-white'>
            Delivery
          </p>
          <p className='truncate text-[12px] leading-4 text-white/50'>
            Email and SMS settings are managed securely.
          </p>
        </div>
        <ChevronRight className='h-4 w-4 text-white/32' />
      </div>

      {isSubscribed ? (
        <button
          type='button'
          onClick={onUnsubscribe}
          disabled={isUnsubscribing}
          className='mt-5 w-full px-4 py-3 text-center text-[14px] font-semibold text-white/72 transition-colors duration-200 hover:text-white disabled:cursor-not-allowed disabled:text-white/36'
        >
          {isUnsubscribing ? 'Turning Off...' : 'Turn Off Alerts'}
        </button>
      ) : (
        <p className='px-4 pt-4 text-[12px] leading-5 text-white/42'>
          Alert preferences appear here after alerts are enabled.
        </p>
      )}
    </div>
  );
}

export function ProfilePrimaryTabPanel({
  mode,
  renderMode = 'interactive',
  artist,
  dsps,
  enableDynamicEngagement = false,
  isSubscribed,
  contentPrefs,
  onTogglePref,
  onUnsubscribe,
  isUnsubscribing,
  genres,
  pressPhotos = [],
  allowPhotoDownloads = false,
  tourDates = [],
  releases = [],
  previewNotificationsState,
}: Readonly<ProfilePrimaryTabPanelProps>) {
  if (mode === 'listen') {
    const visibleReleases = releases.filter(release => Boolean(release.slug));

    if (visibleReleases.length > 0) {
      return (
        <div
          className={NATIVE_PANEL_CLASS_NAME}
          data-testid='profile-primary-tab-releases'
        >
          <div className='px-4 pb-2 pt-3'>
            <h2 className='text-[22px] font-[680] leading-none tracking-[-0.025em] text-white'>
              Music
            </h2>
          </div>
          <ReleasesView
            releases={visibleReleases}
            artistHandle={artist.handle}
            artistName={artist.name}
          />
        </div>
      );
    }

    return (
      <div
        className={NATIVE_PANEL_CLASS_NAME}
        data-testid='profile-primary-tab-listen'
      >
        <div className='px-4 pb-2 pt-3'>
          <h2 className='text-[22px] font-[680] leading-none tracking-[-0.025em] text-white'>
            Music
          </h2>
        </div>
        <StaticListenInterface
          artist={artist}
          handle={artist.handle}
          dspsOverride={dsps}
          enableDynamicEngagement={enableDynamicEngagement}
          renderMode={renderMode}
          containerClassName='max-w-none'
          providerButtonClassName='rounded-[22px] border-white/8 bg-white/[0.045] px-4 py-3.5 text-white hover:bg-white/[0.08]'
          emptyStateClassName='border-white/8 bg-white/[0.04] shadow-none'
          hideHelpText
        />
      </div>
    );
  }

  if (mode === 'tour') {
    return (
      <div
        className={NATIVE_PANEL_CLASS_NAME}
        data-testid='profile-primary-tab-tour'
      >
        <div className='px-4 pb-2 pt-3'>
          <h2 className='text-[22px] font-[680] leading-none tracking-[-0.025em] text-white'>
            Events
          </h2>
        </div>
        <TourDrawerContent artist={artist} tourDates={[...tourDates]} />
      </div>
    );
  }

  if (mode === 'subscribe') {
    return (
      <SubscribePanel
        renderMode={renderMode}
        isSubscribed={isSubscribed}
        contentPrefs={contentPrefs}
        onTogglePref={onTogglePref}
        onUnsubscribe={onUnsubscribe}
        isUnsubscribing={isUnsubscribing}
        previewNotificationsState={previewNotificationsState}
      />
    );
  }

  return (
    <div className={PANEL_CLASS_NAME} data-testid='profile-primary-tab-about'>
      <SectionIntro title='Profile' />
      <div
        className={cn(
          'text-white/80',
          renderMode === 'preview' && 'pointer-events-none'
        )}
      >
        <AboutSection
          artist={artist}
          genres={genres}
          pressPhotos={pressPhotos}
          allowPhotoDownloads={allowPhotoDownloads}
        />
      </div>
    </div>
  );
}
