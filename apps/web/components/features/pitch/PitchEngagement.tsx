'use client';

import { useEffect } from 'react';
import { track } from '@/lib/analytics';
import {
  type InvestorPortalEventName,
  isInvestorPortalEventName,
} from '@/lib/investors/portal-events';
import { postJsonBeacon } from '@/lib/tracking/json-beacon';

function trackPitchEvent(event: InvestorPortalEventName, slideId?: string) {
  const properties = slideId
    ? { surface: 'pitch', slideId }
    : { surface: 'pitch' };
  track(event, properties);
  if (globalThis.location.pathname.startsWith('/investor-portal')) {
    postJsonBeacon('/investor-portal/events', { event, slideId });
  }
}

export function PitchEngagement() {
  useEffect(() => {
    const progressedSlides = new Set<string>();
    trackPitchEvent('portal_opened');

    const onClick = (event: MouseEvent) => {
      const target = event.target;
      if (!(target instanceof Element)) return;
      const action = target.closest<HTMLElement>('[data-pitch-event]');
      const eventName = action?.dataset.pitchEvent;
      if (isInvestorPortalEventName(eventName)) trackPitchEvent(eventName);
    };

    const onToggle = (event: Event) => {
      const details = event.target;
      if (
        details instanceof HTMLDetailsElement &&
        details.open &&
        details.dataset.pitchSection === 'founder-letter'
      ) {
        trackPitchEvent('founder_letter_opened');
      }
    };

    const video = document.querySelector<HTMLVideoElement>(
      '[data-pitch-demo-video]'
    );
    let demoStarted = false;
    const onPlay = () => {
      if (demoStarted) return;
      demoStarted = true;
      trackPitchEvent('demo_started');
    };
    const onEnded = () => trackPitchEvent('demo_completed');
    video?.addEventListener('play', onPlay);
    video?.addEventListener('ended', onEnded);

    const observer = new IntersectionObserver(
      entries => {
        for (const entry of entries) {
          if (!entry.isIntersecting) continue;
          const slideId = (entry.target as HTMLElement).dataset.pitchSlide;
          if (!slideId || progressedSlides.has(slideId)) continue;
          progressedSlides.add(slideId);
          trackPitchEvent('deck_progressed', slideId);
        }
      },
      { threshold: 0.6 }
    );
    const slides = document.querySelectorAll<HTMLElement>('[data-pitch-slide]');
    for (const slide of slides) observer.observe(slide);

    document.addEventListener('click', onClick);
    document.addEventListener('toggle', onToggle, true);
    return () => {
      document.removeEventListener('click', onClick);
      document.removeEventListener('toggle', onToggle, true);
      video?.removeEventListener('play', onPlay);
      video?.removeEventListener('ended', onEnded);
      observer.disconnect();
    };
  }, []);

  return null;
}
