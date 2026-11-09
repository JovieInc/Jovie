'use client';

import { createElement, lazy, Suspense } from 'react';
import {
  type OnboardingProfileBuilderState,
  resolvePreviewArtist,
} from './onboardingProfileRailState';

// The rail draws the public profile preview (identity header, bento, social
// icons), most of /start's client code. A fresh visit has no preview artist,
// so the rail renders nothing: load that code only once it has something to
// show. A server-rendered rail keeps its HTML until the code arrives, and the
// side placeholder holds the rail's width so the chat column never moves.
const OnboardingProfileRailChunk = lazy(() =>
  import('./OnboardingProfileRail').then(mod => ({
    default: mod.OnboardingProfileRail,
  }))
);

const SIDE_RAIL_PLACEHOLDER_CLASS =
  'max-lg:hidden lg:relative lg:h-full lg:w-95 lg:border-l lg:border-(--app-shell-border) bg-(--app-shell-content-surface)';

/** Same props as the rail; renders nothing until there is a preview. */
export function OnboardingProfileRail(props: {
  readonly placement?: 'inline' | 'side';
  readonly state: OnboardingProfileBuilderState;
}) {
  if (!resolvePreviewArtist(props.state)) return null;
  const fallback =
    props.placement === 'inline'
      ? null
      : createElement('aside', {
          'aria-hidden': true,
          'data-testid': 'onboarding-profile-rail-placeholder',
          className: SIDE_RAIL_PLACEHOLDER_CLASS,
        });
  return createElement(
    Suspense,
    { fallback },
    createElement(OnboardingProfileRailChunk, props)
  );
}
