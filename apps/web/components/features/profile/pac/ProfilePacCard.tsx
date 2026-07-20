'use client';

import { Pause, Play, X } from 'lucide-react';
import Link from 'next/link';
import {
  type FormEvent,
  type MouseEvent,
  type ReactNode,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { ImageWithFallback } from '@/components/atoms/ImageWithFallback';
import { SeekBar } from '@/components/atoms/SeekBar';
import { useTrackAudioPlayer } from '@/components/organisms/release-sidebar/useTrackAudioPlayer';
import type { ProfileRenderMode } from '@/features/profile/contracts';
import type {
  ProfilePacAssignment,
  ProfilePacCopyArm,
} from '@/lib/flags/profile-pac';
import type { PublicMerchCard } from '@/lib/merch/types';
import { subscribeToNotifications } from '@/lib/notifications/client';
import { normalizeSubscriptionEmail } from '@/lib/notifications/validation';
import {
  getCaptureDismissalStatus,
  invalidateCaptureDismissalStatus,
} from '@/lib/profile/capture-dismissal-client';
import type { TourDateViewModel } from '@/lib/tour-dates/types';
import type { PacState as PacEventState } from '@/lib/tracking/pac-events-contract';
import { cn } from '@/lib/utils';
import { formatAmount } from '@/lib/utils/format-number';
import { formatDuration } from '@/lib/utils/formatDuration';
import type { Artist } from '@/types/db';
import { usePacEvents } from '../usePacEvents';
import {
  hasReachedListenThreshold,
  type PacContext,
  type PacState,
  pacReducer,
  resolveInitialPacState,
} from './pac-machine';

/**
 * Primary Action Card — the featured first card of the profile home carousel
 * that resolves per visitor state (spec #13060/#13061).
 *
 * Card anatomy: art zone (release/state artwork, square) on top, content zone
 * below (context label / subject / action / status). The prompt state swaps
 * the content zone to the capture form INSIDE the same fixed card box.
 *
 * Zero-CLS contract: the card lives inside the carousel's reserved 3:4
 * geometry (`.profile-entity-card`), so state transitions never move any
 * element outside the card — no height animation, no ResizeObserver, content
 * below the carousel never shifts.
 */

export interface ProfilePacRelease {
  readonly title: string;
  readonly slug: string;
  readonly artworkUrl: string | null;
  readonly previewUrl: string | null;
}

interface ProfilePacCardProps {
  readonly artist: Artist;
  readonly release?: ProfilePacRelease | null;
  readonly merchCard?: PublicMerchCard | null;
  readonly nextShow?: TourDateViewModel | null;
  readonly hasTip?: boolean;
  readonly assignment: ProfilePacAssignment;
  readonly isSubscribed?: boolean;
  readonly renderMode?: ProfileRenderMode;
  readonly className?: string;
  /**
   * Priority-load the artwork image. Set by the surface when there is no
   * hero photo — then this card's art is the page LCP and must not lazy-load.
   */
  readonly artPriority?: boolean;
}

interface CaptureCopy {
  readonly title: string;
  readonly body: string;
  readonly cta: string;
}

function getCaptureCopy(
  arm: ProfilePacCopyArm,
  artistName: string
): CaptureCopy {
  if (arm === 'alternate') {
    return {
      title: "Don't miss the next drop",
      body: `One email when ${artistName} releases something new.`,
      cta: 'Get Updates',
    };
  }
  return {
    title: `Get ${artistName} updates`,
    body: 'New music, shows, and merch — first.',
    cta: 'Get Updates',
  };
}

function PrimaryPill({
  children,
  onClick,
  href,
  external,
  type = 'button',
  disabled,
  ariaLabel,
}: Readonly<{
  children: ReactNode;
  onClick?: (event: MouseEvent<HTMLElement>) => void;
  href?: string;
  external?: boolean;
  type?: 'button' | 'submit';
  disabled?: boolean;
  ariaLabel?: string;
}>) {
  const className = cn(
    'inline-flex h-9 shrink-0 items-center justify-center gap-1.5 rounded-full bg-white px-4 text-sm font-semibold text-black shadow-sm transition-opacity duration-subtle hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/70 disabled:opacity-60'
  );

  if (href && href.startsWith('/')) {
    return (
      <Link
        href={href}
        prefetch={false}
        className={className}
        onClick={onClick}
        aria-label={ariaLabel}
      >
        {children}
      </Link>
    );
  }

  if (href) {
    return (
      <a
        href={href}
        target={external ? '_blank' : undefined}
        rel={external ? 'noopener noreferrer' : undefined}
        className={className}
        onClick={onClick}
        aria-label={ariaLabel}
      >
        {children}
      </a>
    );
  }

  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled}
      className={className}
      aria-label={ariaLabel}
    >
      {children}
    </button>
  );
}

function SubjectText({
  title,
  meta,
}: Readonly<{
  title: string;
  meta: string;
}>) {
  return (
    <div className='min-w-0'>
      <p className='truncate text-sm font-semibold leading-tight text-primary-token'>
        {title}
      </p>
      <p className='mt-0.5 truncate text-xs text-tertiary-token'>{meta}</p>
    </div>
  );
}

export function ProfilePacCard({
  artist,
  release = null,
  merchCard = null,
  nextShow = null,
  hasTip = false,
  assignment,
  isSubscribed = false,
  renderMode = 'interactive',
  className,
  artPriority = false,
}: Readonly<ProfilePacCardProps>) {
  const isInteractive = renderMode === 'interactive';
  const previewUrl = release?.previewUrl ?? null;
  const pacTrackId = release ? `pac-${artist.id}-${release.slug}` : null;

  const [captureSuppressed, setCaptureSuppressed] = useState(false);

  const ctx = useMemo<PacContext>(
    () => ({
      tier: isSubscribed ? 'captured' : 'cold',
      s2Slot: assignment.s2Slot,
      captureSuppressed,
      inventory: {
        hasPreview: Boolean(previewUrl && pacTrackId),
        hasMerch: Boolean(merchCard),
        hasTip,
        hasTicketedShow: Boolean(nextShow?.ticketUrl),
        hasUpcomingShow: Boolean(nextShow),
      },
    }),
    [
      assignment.s2Slot,
      captureSuppressed,
      hasTip,
      isSubscribed,
      merchCard,
      nextShow,
      pacTrackId,
      previewUrl,
    ]
  );

  // Server + first client render resolve identically (cold tier, no
  // suppression) so hydration is markup-stable. Context changes re-resolve
  // through the RESOLVE event below.
  const [state, setState] = useState<PacState>(() =>
    resolveInitialPacState({ ...ctx, tier: 'cold', captureSuppressed: false })
  );
  // Keep latest visitor context for reducer transitions without rebinding
  // every callback; write in an effect so we never mutate refs during render.
  const ctxRef = useRef(ctx);
  useEffect(() => {
    ctxRef.current = ctx;
  }, [ctx]);

  const dispatch = useCallback((event: Parameters<typeof pacReducer>[1]) => {
    setState(prev => pacReducer(prev, event, ctxRef.current));
  }, []);

  // PAC instrumentation (JOV-3905 / spec §8): consent-aware, variant-keyed.
  const eventState = state.kind as PacEventState;
  const { exposureRef, emit, createPlayTracker } = usePacEvents({
    profileId: artist.id,
    assignment,
    state: eventState,
    enabled: isInteractive,
  });
  const playTrackerRef = useRef(createPlayTracker());
  useEffect(() => {
    playTrackerRef.current = createPlayTracker();
  }, [createPlayTracker, pacTrackId]);

  // Re-resolve when visitor context lands/changes (jv_aid bootstrap flips
  // the assignment prop upstream; subscription state flips isSubscribed).
  useEffect(() => {
    dispatch({ type: 'RESOLVE' });
  }, [dispatch, ctx]);

  // Dismissal suppression: ask the server once whether the capture prompt
  // is suppressed for this anonymous visitor. Best-effort — failures leave
  // the prompt eligible and the API re-validates on write.
  useEffect(() => {
    if (!isInteractive || isSubscribed) return;
    let cancelled = false;
    void getCaptureDismissalStatus(artist.id).then(data => {
      if (!cancelled && data?.suppressed) setCaptureSuppressed(true);
    });
    return () => {
      cancelled = true;
    };
  }, [artist.id, isInteractive, isSubscribed]);

  // --- Playback: register with the single global audio engine (#12330).
  const { playbackState, toggleTrack, seek } = useTrackAudioPlayer();
  const isPacTrackActive = Boolean(
    pacTrackId && playbackState.activeTrackId === pacTrackId
  );
  const isPacPlaying = isPacTrackActive && playbackState.isPlaying;

  // Keep the machine honest when the engine pauses/stops us (another
  // surface started playback, the track ended, an error fired).
  useEffect(() => {
    if (state.kind === 'playing' && !isPacPlaying) {
      playTrackerRef.current.onPause();
      dispatch({ type: 'PAUSE' });
    }
  }, [dispatch, isPacPlaying, state.kind]);

  // Play milestone ticks while the PAC track is active (pac_play_30s).
  useEffect(() => {
    if (!isPacTrackActive || !isPacPlaying) return;
    playTrackerRef.current.onTick();
  }, [isPacPlaying, isPacTrackActive, playbackState.currentTime]);

  // Track completion → pac_play_complete + machine pause.
  const lastDurationRef = useRef(0);
  useEffect(() => {
    if (!isPacTrackActive || playbackState.duration <= 0) return;
    lastDurationRef.current = playbackState.duration;
    if (
      playbackState.currentTime > 0 &&
      playbackState.currentTime >= playbackState.duration - 0.25 &&
      !playbackState.isPlaying
    ) {
      playTrackerRef.current.onComplete();
    }
  }, [
    isPacTrackActive,
    playbackState.currentTime,
    playbackState.duration,
    playbackState.isPlaying,
  ]);

  // Capture moment trigger: listen threshold per experiment arm.
  const thresholdFiredRef = useRef(false);
  useEffect(() => {
    if (!isPacTrackActive || thresholdFiredRef.current) return;
    if (
      hasReachedListenThreshold(
        assignment.triggerThreshold,
        playbackState.currentTime,
        playbackState.duration
      )
    ) {
      thresholdFiredRef.current = true;
      dispatch({ type: 'LISTEN_THRESHOLD' });
    }
  }, [
    assignment.triggerThreshold,
    dispatch,
    isPacTrackActive,
    playbackState.currentTime,
    playbackState.duration,
  ]);

  // capture_prompt_shown once per entry into the prompt state.
  const lastPromptShownRef = useRef(false);
  useEffect(() => {
    if (state.kind === 'prompt') {
      if (!lastPromptShownRef.current) {
        lastPromptShownRef.current = true;
        emit('capture_prompt_shown', {
          trigger: assignment.triggerThreshold,
          dismiss_affordance: assignment.dismissAffordance,
        });
      }
      return;
    }
    if (state.kind !== 'submitting' && state.kind !== 'error') {
      lastPromptShownRef.current = false;
    }
  }, [
    assignment.dismissAffordance,
    assignment.triggerThreshold,
    emit,
    state.kind,
  ]);

  const handlePlayClick = useCallback(
    (event: MouseEvent<HTMLElement>) => {
      if (!isInteractive || !release || !previewUrl || !pacTrackId) return;
      event.preventDefault();
      void toggleTrack({
        id: pacTrackId,
        title: release.title,
        audioUrl: previewUrl,
        releaseTitle: release.title,
        artistName: artist.name,
        artworkUrl: release.artworkUrl,
      });
      if (isPacPlaying) {
        playTrackerRef.current.onPause();
        dispatch({ type: 'PAUSE' });
      } else {
        playTrackerRef.current.onPlay();
        dispatch({ type: 'PLAY' });
      }
    },
    [
      artist.name,
      dispatch,
      isInteractive,
      isPacPlaying,
      pacTrackId,
      previewUrl,
      release,
      toggleTrack,
    ]
  );

  // --- Capture form.
  const [emailInput, setEmailInput] = useState('');
  const [fieldError, setFieldError] = useState<string | null>(null);
  const emailRef = useRef<HTMLInputElement>(null);

  const handleCaptureSubmit = useCallback(
    (event: FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      if (!isInteractive) return;
      const email = normalizeSubscriptionEmail(emailInput);
      if (!email) {
        setFieldError('Enter a valid email address.');
        emailRef.current?.focus();
        emit(
          'capture_error',
          { rule: 'invalid_email', channel: 'email' },
          'error'
        );
        return;
      }
      setFieldError(null);
      dispatch({ type: 'CAPTURE_SUBMIT' });
      emit('capture_submit', { channel: 'email' }, 'submitting');
      subscribeToNotifications({
        artistId: artist.id,
        channel: 'email',
        email,
        source: 'profile_pac',
        sourceContext: {
          surface: 'profile_pac',
          copyArm: assignment.copyArm,
          trigger: assignment.triggerThreshold,
        },
      })
        .then(() => {
          dispatch({ type: 'CAPTURE_SUCCESS' });
          emit('capture_success', { channel: 'email' }, 'success');
        })
        .catch(() => {
          dispatch({ type: 'CAPTURE_FAILURE' });
          emit(
            'capture_error',
            { rule: 'subscribe_failed', channel: 'email' },
            'error'
          );
        });
    },
    [
      artist.id,
      assignment.copyArm,
      assignment.triggerThreshold,
      dispatch,
      emailInput,
      emit,
      isInteractive,
    ]
  );

  const handleDismiss = useCallback(() => {
    dispatch({ type: 'DISMISS' });
    setCaptureSuppressed(true);
    emit(
      'capture_dismiss',
      { dismiss_affordance: assignment.dismissAffordance },
      'dismissed'
    );
    void fetch('/api/profile/capture-dismissal', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'same-origin',
      body: JSON.stringify({ artist_id: artist.id, source: 'profile_pac' }),
    })
      .then(res => {
        if (res.ok) invalidateCaptureDismissalStatus(artist.id);
      })
      .catch(() => {
        // Best-effort — suppression is also held in memory for this session.
      });
  }, [artist.id, assignment.dismissAffordance, dispatch, emit]);

  const handleSecondaryClick = useCallback(
    (slot: string) => {
      emit('pac_secondary_click', { slot }, state.kind as PacEventState);
    },
    [emit, state.kind]
  );

  // --- Zone content per state.
  const copy = getCaptureCopy(assignment.copyArm, artist.name);
  const listenHref = release?.slug
    ? `/${artist.handle}/${release.slug}`
    : `/${artist.handle}/listen`;

  let contextLabel = 'Latest Release';
  let subject: ReactNode = null;
  let action: ReactNode = null;
  let status: ReactNode = null;
  let contextAside: ReactNode = null;

  const releaseSubject = (
    <SubjectText title={release?.title ?? artist.name} meta={artist.name} />
  );

  switch (state.kind) {
    case 'idle':
    case 'dismissed':
    case 'playing': {
      contextLabel =
        state.kind === 'playing' ? 'Now Playing' : 'Latest Release';
      subject = releaseSubject;
      if (ctx.inventory.hasPreview) {
        action = (
          <PrimaryPill
            href={listenHref}
            onClick={handlePlayClick}
            ariaLabel={
              isPacPlaying
                ? `Pause ${release?.title ?? 'preview'}`
                : `Play ${release?.title ?? 'preview'}`
            }
          >
            {isPacPlaying ? (
              <Pause className='h-4 w-4 fill-current' />
            ) : (
              <Play className='h-4 w-4 fill-current' />
            )}
            {isPacPlaying ? 'Pause' : 'Play'}
          </PrimaryPill>
        );
      } else {
        // Degraded ladder: no inline preview — link out to listen.
        action = <PrimaryPill href={listenHref}>Listen</PrimaryPill>;
      }
      if (isPacTrackActive && playbackState.duration > 0) {
        status = (
          <div className='flex items-center gap-2'>
            <SeekBar
              currentTime={playbackState.currentTime}
              duration={playbackState.duration}
              onSeek={seek}
              className='h-1.5 flex-1'
            />
            <span className='shrink-0 text-xs tabular-nums text-tertiary-token'>
              {formatDuration(playbackState.currentTime * 1000)}
            </span>
          </div>
        );
      }
      break;
    }

    case 'prompt':
    case 'submitting':
    case 'error': {
      contextLabel = 'Stay In The Loop';
      // JOV-3908: text "Not now" (control) vs borderless icon-X (candidate).
      // One control element keeps the raw-button ratchet flat; min-h/w-11 keeps
      // the icon arm at the 44px WCAG touch-target floor.
      const isIconDismiss = assignment.dismissAffordance === 'icon';
      contextAside = (
        <button
          type='button'
          onClick={handleDismiss}
          aria-label={isIconDismiss ? 'Dismiss' : undefined}
          data-testid='pac-capture-dismiss'
          data-affordance={isIconDismiss ? 'icon' : 'text'}
          className={cn(
            'shrink-0 text-white/50 transition-colors duration-subtle hover:text-white/80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/70',
            isIconDismiss
              ? '-mr-1.5 -mt-1.5 flex min-h-11 min-w-11 items-center justify-center rounded-full hover:bg-white/10'
              : 'text-xs font-medium'
          )}
        >
          {isIconDismiss ? (
            <X className='h-4 w-4' aria-hidden='true' />
          ) : (
            'Not now'
          )}
        </button>
      );
      subject = <SubjectText title={copy.title} meta={copy.body} />;
      action = (
        <form
          onSubmit={handleCaptureSubmit}
          className='flex w-full items-center gap-2'
        >
          <input
            ref={emailRef}
            type='email'
            inputMode='email'
            autoComplete='email'
            required
            placeholder='Email address'
            value={emailInput}
            onChange={event => {
              setEmailInput(event.target.value);
              if (fieldError) setFieldError(null);
            }}
            disabled={state.kind === 'submitting'}
            aria-label={`Email address for ${artist.name} updates`}
            aria-invalid={Boolean(fieldError) || state.kind === 'error'}
            className='h-9 min-w-0 flex-1 rounded-full border border-white/15 bg-white/10 px-4 text-sm text-white dark:text-white placeholder:text-white/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/70 disabled:opacity-60'
          />
          <PrimaryPill type='submit' disabled={state.kind === 'submitting'}>
            {state.kind === 'submitting'
              ? 'Sending…'
              : state.kind === 'error'
                ? 'Try Again'
                : copy.cta}
          </PrimaryPill>
        </form>
      );
      status =
        fieldError || state.kind === 'error' ? (
          <p className='text-xs text-white/80'>
            {fieldError ??
              "That didn't go through — check your email and try again."}
          </p>
        ) : null;
      break;
    }

    case 'success': {
      contextLabel = 'Stay In The Loop';
      subject = (
        <SubjectText
          title={"You're in"}
          meta={`Watch your inbox for ${artist.name} updates.`}
        />
      );
      status = null;
      break;
    }

    case 'merch': {
      contextLabel = 'Merch';
      subject = (
        <SubjectText
          title={merchCard?.title ?? `${artist.name} merch`}
          meta={
            merchCard ? formatAmount(merchCard.retailPriceCents) : artist.name
          }
        />
      );
      action = (
        <PrimaryPill
          href={`/${artist.handle}/shop`}
          onClick={() => handleSecondaryClick('merch')}
        >
          Shop
        </PrimaryPill>
      );
      break;
    }

    case 'tip': {
      contextLabel = 'Support';
      subject = (
        <SubjectText
          title={`Support ${artist.name}`}
          meta='Tips go straight to the artist.'
        />
      );
      action = (
        <PrimaryPill
          href={`/${artist.handle}/tip`}
          onClick={() => handleSecondaryClick('tip')}
        >
          Tip
        </PrimaryPill>
      );
      break;
    }

    case 'tickets':
    case 'rsvp': {
      contextLabel = 'On Tour';
      const showMeta = [nextShow?.venueName, nextShow?.city]
        .filter(Boolean)
        .join(' · ');
      subject = (
        <SubjectText
          title={nextShow?.title ?? `${artist.name} live`}
          meta={showMeta || 'Upcoming show'}
        />
      );
      action =
        state.kind === 'tickets' && nextShow?.ticketUrl ? (
          <PrimaryPill
            href={nextShow.ticketUrl}
            external
            onClick={() => handleSecondaryClick('tickets')}
          >
            Tickets
          </PrimaryPill>
        ) : (
          <PrimaryPill
            href={`/${artist.handle}/tour`}
            onClick={() => handleSecondaryClick('rsvp')}
          >
            RSVP
          </PrimaryPill>
        );
      break;
    }

    case 'following': {
      contextLabel = 'Following';
      subject = (
        <SubjectText
          title={`You follow ${artist.name}`}
          meta="You'll hear about new drops first."
        />
      );
      action = (
        <PrimaryPill
          href={`/${artist.handle}?mode=subscribe`}
          onClick={() => handleSecondaryClick('following')}
        >
          Manage
        </PrimaryPill>
      );
      break;
    }
  }

  const isCaptureState =
    state.kind === 'prompt' ||
    state.kind === 'submitting' ||
    state.kind === 'error';

  // Art zone: state-relevant artwork. The merch state shows the merch image;
  // every other state shows the release artwork (artist image as fallback).
  const artImageUrl =
    state.kind === 'merch'
      ? (merchCard?.primaryImageUrl ??
        release?.artworkUrl ??
        artist.image_url ??
        null)
      : (release?.artworkUrl ?? artist.image_url ?? null);
  const artImageAlt =
    state.kind === 'merch'
      ? (merchCard?.title ?? 'Merch')
      : release
        ? `${release.title} artwork`
        : artist.name;

  // Exposure ref on the outer card (callback ref).
  const sectionRef = useCallback(
    (node: HTMLElement | null) => {
      exposureRef(node);
    },
    [exposureRef]
  );

  return (
    <section
      ref={sectionRef}
      aria-label={`${artist.name} primary action`}
      data-testid='profile-pac'
      data-state={state.kind}
      data-stage={state.stage}
      data-degraded={state.degraded ? 'true' : undefined}
      data-dismiss-affordance={assignment.dismissAffordance}
      className={cn(
        'flex h-full w-full min-w-0 flex-col overflow-hidden rounded-(--profile-inner-radius) border border-(--profile-pearl-border) bg-(--profile-pearl-bg) shadow-(--profile-pearl-shadow) backdrop-blur-2xl',
        className
      )}
    >
      <div className='relative min-h-0 w-full flex-1 overflow-hidden border-b border-subtle bg-surface-2'>
        {artImageUrl ? (
          <ImageWithFallback
            src={artImageUrl}
            alt={artImageAlt}
            fill
            sizes='(max-width: 767px) 70vw, 300px'
            className='object-contain'
            fallbackVariant='release'
            fallbackClassName='bg-transparent'
          />
        ) : (
          <div className='flex h-full w-full items-center justify-center text-tertiary-token'>
            <Play className='h-7 w-7 fill-current' aria-hidden='true' />
          </div>
        )}
      </div>

      <div className='flex min-h-0 min-w-0 flex-none flex-col gap-2 p-3'>
        <div className='flex items-center justify-between gap-2'>
          <p className='truncate text-3xs font-semibold uppercase leading-none tracking-wide text-tertiary-token'>
            {contextLabel}
          </p>
          {contextAside}
        </div>

        {subject}

        {isCaptureState ? <div className='min-w-0'>{action}</div> : null}

        <div className='mt-auto flex min-w-0 flex-col gap-2 pt-1'>
          {isCaptureState ? null : action}
          <div aria-live='polite' className='min-w-0 empty:hidden'>
            {status}
          </div>
        </div>
      </div>
    </section>
  );
}
