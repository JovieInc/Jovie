'use client';

import { useEffect } from 'react';
import { track } from '@/lib/analytics';

const progressedSlides = new Set<string>();

export function PitchEngagement() {
  useEffect(() => {
    track('portal_opened', { surface: 'pitch' });

    const onClick = (event: MouseEvent) => {
      const target = event.target;
      if (!(target instanceof Element)) return;
      const action = target.closest<HTMLElement>('[data-pitch-event]');
      const eventName = action?.dataset.pitchEvent;
      if (eventName) track(eventName, { surface: 'pitch' });
    };

    const onToggle = (event: Event) => {
      const details = event.target;
      if (
        details instanceof HTMLDetailsElement &&
        details.open &&
        details.dataset.pitchSection === 'founder-letter'
      ) {
        track('founder_letter_opened', { surface: 'pitch' });
      }
    };

    const video = document.querySelector<HTMLVideoElement>(
      '[data-pitch-demo-video]'
    );
    let demoStarted = false;
    const onPlay = () => {
      if (demoStarted) return;
      demoStarted = true;
      track('demo_started', { surface: 'pitch' });
    };
    const onEnded = () => track('demo_completed', { surface: 'pitch' });
    video?.addEventListener('play', onPlay);
    video?.addEventListener('ended', onEnded);

    const observer = new IntersectionObserver(
      entries => {
        for (const entry of entries) {
          if (!entry.isIntersecting) continue;
          const slideId = (entry.target as HTMLElement).dataset.pitchSlide;
          if (!slideId || progressedSlides.has(slideId)) continue;
          progressedSlides.add(slideId);
          track('deck_progressed', { surface: 'pitch', slideId });
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
