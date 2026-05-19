'use client';

import { type ReactNode, useEffect, useId, useState } from 'react';
import { JovieMarkElectric } from '@/components/atoms/JovieMarkElectric';
import {
  JOVIE_ICON_PATH,
  JOVIE_ICON_VIEW_BOX,
} from '@/components/atoms/jovie-icon-path';
import { type AppShellFrameVariant } from '@/components/organisms/AppShellFrame';
import { AppShellSkeleton } from '@/components/organisms/AppShellSkeleton';
import { useReducedMotion } from '@/lib/hooks/useReducedMotion';

const LOGO_ASPECT_RATIO = 347.97 / 353.68;
const TIMELINE_MS = 2400;
const SIDEBAR_STUB_WIDTHS = [68, 78, 86, 64, 80, 90] as const;

/**
 * sessionStorage key — flips to "1" after the cinematic plays once per tab.
 * Subsequent shell-layout suspensions (page refresh, route transition that
 * busts the shell) skip the cinematic and fall back to the route-specific
 * skeleton directly.
 */
const SESSION_STORAGE_KEY = 'jovie:cinematic-boot-played';

interface CinematicAppBootProps {
  /**
   * Route-specific skeleton (chat, releases, tasks, library, lyrics) injected
   * into the AppShellSkeleton main slot. When undefined, AppShellSkeleton
   * renders its default skeleton body.
   */
  readonly main?: ReactNode;
  /** Existing shell audio player node passed through the direct skeleton path. */
  readonly audioPlayer?: ReactNode;
  /** AppShellSkeleton variant — preserved across cinematic + skeleton fallbacks. */
  readonly variant: AppShellFrameVariant;
  /**
   * Set to false for unauthenticated onboarding front-door surfaces (/start)
   * that render AppShellFrame with sidebar={null}. When false:
   * - No sidebar stub is rendered in cinematic mode.
   * - Frame animation keeps symmetric inset (no left-shift to accommodate sidebar).
   * - AppShellSkeleton fallback receives sidebar={null}.
   * Defaults to true for standard authenticated shells.
   */
  readonly hasSidebar?: boolean;
}

/**
 * Cinematic app boot loader.
 *
 * Mounts as the (shell) layout's Suspense fallback (or equivalent for
 * unauth /start via loading.tsx). On the FIRST shell mount per tab (no
 * `jovie:cinematic-boot-played` sessionStorage flag), plays a forward-only
 * cinematic timeline (logo cinematic → reverse spin → frame fade-in →
 * optional sidebar slide-in → welcome content fade-up) over ~2.4s.
 *
 * The underlying tree resolves whenever it resolves — when React unmounts
 * the Suspense fallback, the real shell appears underneath. Because the
 * cinematic ends in a composition that matches the post-resolve AppShellFrame
 * layout (respecting hasSidebar), the hard-cut unmount is visually seamless.
 *
 * On SUBSEQUENT shell mounts in the same tab (the flag is set), or under
 * `prefers-reduced-motion`, or during SSR (the hook defaults true), the
 * cinematic is skipped and the route-specific AppShellSkeleton renders
 * directly — identical to today's loading state.
 *
 * Supports unauth onboarding entry via hasSidebar={false} for zero layout
 * shift on the no-sidebar /start path while preserving the premium per-tab
 * cinematic where it makes sense (lightweight skeleton fallback always
 * available).
 */
export function CinematicAppBoot({
  main,
  audioPlayer,
  variant,
  hasSidebar = true,
}: CinematicAppBootProps) {
  const [mounted, setMounted] = useState(false);
  const [shouldPlay, setShouldPlay] = useState(false);
  const prefersReducedMotion = useReducedMotion();
  const reactId = useId();
  const safeId = reactId.replace(/[^a-zA-Z0-9_-]/g, '');

  useEffect(() => {
    setMounted(true);
    // sessionStorage is unavailable in some private-browsing modes — fail
    // safe to "skip cinematic" rather than throw.
    try {
      if (
        typeof globalThis.window !== 'undefined' &&
        globalThis.window.sessionStorage
      ) {
        const played =
          globalThis.window.sessionStorage.getItem(SESSION_STORAGE_KEY);
        if (!played) {
          setShouldPlay(true);
          globalThis.window.sessionStorage.setItem(SESSION_STORAGE_KEY, '1');
        }
      }
    } catch {
      // sessionStorage blocked — default to skipping the cinematic.
    }
  }, []);

  const skeletonSidebar = hasSidebar === false ? null : undefined;

  if (!mounted || prefersReducedMotion || !shouldPlay) {
    return (
      <AppShellSkeleton
        main={main}
        audioPlayer={audioPlayer}
        variant={variant}
        sidebar={skeletonSidebar}
      />
    );
  }

  const kfLogo = `jvf-logo-${safeId}`;
  const kfFrame = `jvf-frame-${safeId}`;
  const kfFrameNoSidebar = `jvf-frame-nosb-${safeId}`;
  const kfSidebar = `jvf-sidebar-${safeId}`;
  const kfContent = `jvf-content-${safeId}`;

  const useNoSidebarFrame = !hasSidebar;
  const frameAnimationName = useNoSidebarFrame ? kfFrameNoSidebar : kfFrame;

  return (
    <div
      role='status'
      aria-live='polite'
      aria-busy='true'
      aria-label='Loading Jovie'
      data-testid='cinematic-app-boot'
      style={{
        position: 'absolute',
        inset: 0,
        background: 'var(--linear-bg-page, #08090a)',
        overflow: 'hidden',
      }}
    >
      <style>{`
        @keyframes ${kfLogo} {
          0%   { opacity: 0;    transform: rotate(0deg); }
          6%   { opacity: 0;    transform: rotate(0deg); }
          22%  { opacity: 0.55; transform: rotate(0deg); }
          26%  { opacity: 0.55; transform: rotate(0deg); }
          48%  { opacity: 0.55; transform: rotate(-720deg); }
          50%  { opacity: 0.55; transform: rotate(-742deg); }
          52%  { opacity: 0.55; transform: rotate(-714deg); }
          54%  { opacity: 0.55; transform: rotate(-720deg); }
          62%  { opacity: 0;    transform: rotate(-720deg); }
          100% { opacity: 0;    transform: rotate(-720deg); }
        }
        @keyframes ${kfFrame} {
          0%, 56%  { opacity: 0; left: 12px; }
          66%      { opacity: 1; left: 12px; }
          70%      { opacity: 1; left: 12px; }
          78%      { opacity: 1; left: 252px; }
          100%     { opacity: 1; left: 252px; }
        }
        @keyframes ${kfFrameNoSidebar} {
          0%, 56%  { opacity: 0; left: 12px; }
          66%      { opacity: 1; left: 12px; }
          100%     { opacity: 1; left: 12px; }
        }
        @keyframes ${kfSidebar} {
          0%, 70% { opacity: 0; transform: translateX(-14px); }
          84%     { opacity: 1; transform: translateX(0); }
          100%    { opacity: 1; transform: translateX(0); }
        }
        @keyframes ${kfContent} {
          0%, 82% { opacity: 0; transform: translateY(10px); }
          100%    { opacity: 1; transform: translateY(0); }
        }
      `}</style>

      {hasSidebar && (
        <div
          style={{
            position: 'absolute',
            left: 0,
            top: 0,
            bottom: 0,
            width: 244,
            animationName: kfSidebar,
            animationDuration: `${TIMELINE_MS}ms`,
            animationTimingFunction: 'var(--ds-motion-subtle-easing)',
            animationFillMode: 'forwards',
            willChange: 'opacity, transform',
          }}
        >
          <CinematicSidebarStub />
        </div>
      )}

      <div
        style={{
          position: 'absolute',
          top: 12,
          right: 12,
          bottom: 12,
          left: 12,
          background: 'var(--linear-app-content-surface, #0F1011)',
          border: '1px solid rgba(255, 255, 255, 0.045)',
          borderRadius: 14,
          boxShadow:
            '0 0 0 1px rgba(0,0,0,0.25), inset 0 0 18px rgba(0,0,0,0.25), 0 24px 60px rgba(0,0,0,0.45)',
          overflow: 'hidden',
          animationName: frameAnimationName,
          animationDuration: `${TIMELINE_MS}ms`,
          animationTimingFunction: 'var(--ds-motion-subtle-easing)',
          animationFillMode: 'forwards',
          willChange: hasSidebar ? 'opacity, left' : 'opacity',
        }}
      >
        <div
          aria-hidden='true'
          style={{
            position: 'absolute',
            inset: 0,
            display: 'grid',
            placeItems: 'center',
            pointerEvents: 'none',
          }}
        >
          <div
            style={{
              WebkitMaskImage:
                'radial-gradient(circle, rgba(0,0,0,1) 55%, rgba(0,0,0,0.75) 75%, rgba(0,0,0,0) 95%)',
              maskImage:
                'radial-gradient(circle, rgba(0,0,0,1) 55%, rgba(0,0,0,0.75) 75%, rgba(0,0,0,0) 95%)',
            }}
          >
            <JovieMarkElectric size={620} />
          </div>
        </div>

        <div
          style={{
            position: 'absolute',
            inset: 0,
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 30,
            paddingBottom: 80,
            animationName: kfContent,
            animationDuration: `${TIMELINE_MS}ms`,
            animationTimingFunction: 'var(--ds-motion-cinematic-easing)',
            animationFillMode: 'forwards',
            willChange: 'opacity, transform',
          }}
        >
          <div
            style={{
              fontSize: 40,
              fontWeight: 600,
              color: 'var(--linear-text-primary, #f7f8f8)',
              letterSpacing: '-0.022em',
            }}
          >
            Welcome to Jovie
          </div>
          <div
            style={{
              width: 580,
              padding: '16px 22px',
              background: 'rgba(20, 20, 22, 0.65)',
              border: '1px solid rgba(255, 255, 255, 0.07)',
              borderRadius: 9999,
              fontSize: 14,
              color: 'var(--linear-text-quaternary, #62666d)',
              backdropFilter: 'blur(8px)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: 14,
              boxShadow:
                '0 1px 0 rgba(255,255,255,0.02) inset, 0 8px 24px rgba(0,0,0,0.35)',
            }}
          >
            <span>Ask Jovie…</span>
            <div
              style={{
                width: 30,
                height: 30,
                borderRadius: 9999,
                background: 'rgba(255,255,255,0.08)',
              }}
            />
          </div>
        </div>
      </div>

      <div
        aria-hidden='true'
        style={{
          position: 'absolute',
          inset: 0,
          display: 'grid',
          placeItems: 'center',
          animationName: kfLogo,
          animationDuration: `${TIMELINE_MS}ms`,
          animationTimingFunction: 'var(--ds-motion-subtle-easing)',
          animationFillMode: 'forwards',
          pointerEvents: 'none',
          zIndex: 5,
          willChange: 'opacity, transform',
        }}
      >
        <svg
          width={28}
          height={28 * LOGO_ASPECT_RATIO}
          viewBox={JOVIE_ICON_VIEW_BOX}
          style={{ display: 'block', color: 'rgba(247, 248, 248, 0.92)' }}
          aria-hidden='true'
        >
          <path fill='currentColor' d={JOVIE_ICON_PATH} />
        </svg>
      </div>
    </div>
  );
}

function CinematicSidebarStub() {
  return (
    <div
      aria-hidden='true'
      style={{
        position: 'absolute',
        inset: 0,
        background: 'var(--linear-app-sidebar-background, #0c0d0f)',
        borderRight:
          '1px solid var(--linear-border-subtle, rgba(255,255,255,0.055))',
        display: 'flex',
        flexDirection: 'column',
        gap: 6,
        padding: '10px 10px',
      }}
    >
      <div
        style={{
          height: 24,
          width: 96,
          borderRadius: 4,
          background: 'rgba(255,255,255,0.04)',
          marginBottom: 4,
        }}
      />
      {SIDEBAR_STUB_WIDTHS.map(w => (
        <div
          key={`sb-row-${w}`}
          style={{
            height: 26,
            borderRadius: 4,
            background: 'rgba(255,255,255,0.03)',
            width: `${w}%`,
          }}
        />
      ))}
    </div>
  );
}
