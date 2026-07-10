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
 * Primary Action Card — the one card below the profile hero that resolves
 * per visitor state (spec #13060/#13061).
 *
 * Anatomy (4 zones): context strip / subject / action / status.
 *
 * Zero-CLS contract: the server renders the S0 default inside a container
 * with a reserved fixed height. State transitions animate the container's
 * own height (420ms cinematic easing, 0ms under reduced motion via the
 * `--duration-cinematic` token) — content below the card never shifts
 * during hydration, and moves only through the deliberate height animation
 * on user-driven transitions.
 */

const PAC_RESERVED_HEIGHT_PX = 112;

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

const CARD_RADIUS_STYLE = {
  borderRadius: 'var(--profile-action-radius)',
} as const;

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

function SubjectZone({
  imageUrl,
  imageAlt,
  title,
  meta,
}: Readonly<{
  imageUrl: string | null;
  imageAlt: string;
  title: string;
  meta: string;
}>) {
  return (
    <div className='flex min-w-0 flex-1 items-center gap-3'>
      <div
        className='relative h-12 w-12 shrink-0 overflow-hidden rounded-xl bg-white/10'
        aria-hidden={imageUrl ? undefined : true}
      >
        {imageUrl ? (
          <ImageWithFallback
            src={imageUrl}
            alt={imageAlt}
            fill
            sizes='48px'
            className='object-cover'
            fallbackVariant='release'
          />
        ) : (
          <div className='flex h-full w-full items-center justify-center text-white/50'>
            <Play className='h-4 w-4 fill-current' />
          </div>
        )}
      </div>
      <div className='min-w-0 flex-1'>
        <p className='truncate text-sm font-semibold leading-tight text-white dark:text-white'>
          {title}
        </p>
        <p className='mt-0.5 truncate text-xs text-white/60'>{meta}</p>
      </div>
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
    const controller = new AbortController();
    void fetch(
      `/api/profile/capture-dismissal?artist_id=${encodeURIComponent(artist.id)}`,
      { signal: controller.signal, credentials: 'same-origin' }
    )
      .then(res => (res.ok ? res.json() : null))
      .then((data: { suppressed?: boolean } | null) => {
        if (data?.suppressed) setCaptureSuppressed(true);
      })
      .catch(() => {
        // Best-effort only.
      });
    return () => controller.abort();
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
    }).catch(() => {
      // Best-effort — suppression is also held in memory for this session.
    });
  }, [artist.id, assignment.dismissAffordance, dispatch, emit]);

  const handleSecondaryClick = useCallback(
    (slot: string) => {
      emit('pac_secondary_click', { slot }, state.kind as PacEventState);
    },
    [emit, state.kind]
  );

  // --- Zero-CLS height reservation + 420ms self-height animation.
  const innerRef = useRef<HTMLDivElement>(null);
  const [heightPx, setHeightPx] = useState<number>(PAC_RESERVED_HEIGHT_PX);
  useEffect(() => {
    const node = innerRef.current;
    if (!node || typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(entries => {
      const measured = entries[0]?.contentRect.height;
      if (typeof measured === 'number' && measured > 0) {
        setHeightPx(Math.max(Math.round(measured), PAC_RESERVED_HEIGHT_PX));
      }
    });
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

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
    <SubjectZone
      imageUrl={release?.artworkUrl ?? artist.image_url ?? null}
      imageAlt={release ? `${release.title} artwork` : artist.name}
      title={release?.title ?? artist.name}
      meta={artist.name}
    />
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
            <span className='shrink-0 text-xs tabular-nums text-white/50'>
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
      contextAside =
        assignment.dismissAffordance === 'icon' ? (
          <button
            type='button'
            onClick={handleDismiss}
            aria-label='Dismiss'
            data-testid='pac-capture-dismiss'
            data-affordance='icon'
            className='-mr-1.5 -mt-1.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-white/50 transition-colors duration-subtle hover:bg-white/10 hover:text-white/80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/70'
          >
            <X className='h-4 w-4' aria-hidden='true' />
          </button>
        ) : (
          <button
            type='button'
            onClick={handleDismiss}
            data-testid='pac-capture-dismiss'
            data-affordance='text'
            className='shrink-0 text-xs font-medium text-white/50 transition-colors duration-subtle hover:text-white/80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/70'
          >
            Not now
          </button>
        );
      subject = (
        <div className='min-w-0 flex-1'>
          <p className='truncate text-sm font-semibold leading-tight text-white dark:text-white'>
            {copy.title}
          </p>
          <p className='mt-0.5 truncate text-xs text-white/60'>{copy.body}</p>
        </div>
      );
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
        <div className='min-w-0 flex-1'>
          <p className='truncate text-sm font-semibold leading-tight text-white dark:text-white'>
            {"You're in"}
          </p>
          <p className='mt-0.5 truncate text-xs text-white/60'>
            Watch your inbox for {artist.name} updates.
          </p>
        </div>
      );
      status = null;
      break;
    }

    case 'merch': {
      contextLabel = 'Merch';
      subject = (
        <SubjectZone
          imageUrl={merchCard?.primaryImageUrl ?? null}
          imageAlt={merchCard?.title ?? 'Merch'}
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
        <div className='min-w-0 flex-1'>
          <p className='truncate text-sm font-semibold leading-tight text-white dark:text-white'>
            Support {artist.name}
          </p>
          <p className='mt-0.5 truncate text-xs text-white/60'>
            Tips go straight to the artist.
          </p>
        </div>
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
        <div className='min-w-0 flex-1'>
          <p className='truncate text-sm font-semibold leading-tight text-white dark:text-white'>
            {nextShow?.title ?? `${artist.name} live`}
          </p>
          <p className='mt-0.5 truncate text-xs text-white/60'>
            {showMeta || 'Upcoming show'}
          </p>
        </div>
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
        <div className='min-w-0 flex-1'>
          <p className='truncate text-sm font-semibold leading-tight text-white dark:text-white'>
            You follow {artist.name}
          </p>
          <p className='mt-0.5 truncate text-xs text-white/60'>
            {"You'll hear about new drops first."}
          </p>
        </div>
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

  // Merge exposure + height refs on the outer section (callback refs).
  const sectionRef = useCallback(
    (node: HTMLElement | null) => {
      exposureRef(node);
      // height measurement lives on the inner content node, not the section.
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
        'w-full overflow-hidden border border-white/10 bg-white/5 backdrop-blur-2xl',
        className
      )}
      style={{
        ...CARD_RADIUS_STYLE,
        height: heightPx,
        transition: 'height var(--duration-cinematic) var(--ease-cinematic)',
      }}
    >
      <div
        ref={innerRef}
        className='flex flex-col justify-center gap-3 p-4'
        style={{ minHeight: PAC_RESERVED_HEIGHT_PX }}
      >
        <div className='flex items-center justify-between gap-3'>
          <p className='truncate text-xs font-medium text-white/50'>
            {contextLabel}
          </p>
          {contextAside}
        </div>
        <div className='flex min-w-0 items-center justify-between gap-3'>
          {subject}
          {state.kind === 'prompt' ||
          state.kind === 'submitting' ||
          state.kind === 'error'
            ? null
            : action}
        </div>
        {(state.kind === 'prompt' ||
          state.kind === 'submitting' ||
          state.kind === 'error') && <div>{action}</div>}
        <div aria-live='polite' className='min-w-0 empty:hidden'>
          {status}
        </div>
      </div>
    </section>
  );
}
