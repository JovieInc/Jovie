'use client';

import { useEffect, useState } from 'react';
import { useReducedMotion } from '@/lib/hooks/useReducedMotion';

const STATES = [
  {
    label: 'Tour date',
    url: 'jov.ie/timwhite',
    status: 'live',
    detail: 'The Novo, Los Angeles \u00B7 May 17',
    output: '\u2192 Show nearest date, ticket link, full run',
  },
  {
    label: 'New release',
    url: 'jov.ie/timwhite',
    status: 'live',
    detail: 'Take Me Over \u00B7 Out now',
    output: '\u2192 Feature release, streaming links, presave converts',
  },
  {
    label: 'Countdown',
    url: 'jov.ie/timwhite',
    status: 'scheduled',
    detail: 'The Deep End \u00B7 May 1',
    output: '\u2192 Countdown page, presave capture, auto-notify on drop',
  },
] as const;

const CYCLE_MS = 3200;

export function HomeSandboxCard() {
  const reducedMotion = useReducedMotion();
  const [activeIndex, setActiveIndex] = useState(0);

  useEffect(() => {
    if (reducedMotion) return;
    const id = setInterval(() => {
      setActiveIndex(i => (i + 1) % STATES.length);
    }, CYCLE_MS);
    return () => clearInterval(id);
  }, [reducedMotion]);

  return (
    <div className='homepage-sandbox' data-testid='homepage-sandbox'>
      <div className='homepage-sandbox-chrome'>
        <div className='homepage-sandbox-dots'>
          <span className='homepage-sandbox-dot homepage-sandbox-dot-red' />
          <span className='homepage-sandbox-dot homepage-sandbox-dot-yellow' />
          <span className='homepage-sandbox-dot homepage-sandbox-dot-green' />
        </div>
        <span className='homepage-sandbox-title'>One link. Three states.</span>
      </div>

      <div className='homepage-sandbox-body'>
        {STATES.map((state, i) => (
          <div
            key={state.label}
            className={`homepage-sandbox-entry ${i === activeIndex ? 'homepage-sandbox-entry-active' : ''}`}
          >
            <div className='homepage-sandbox-line'>
              <span className='homepage-sandbox-prompt'>$</span>
              <span className='homepage-sandbox-cmd'>visit {state.url}</span>
              <span
                className={`homepage-sandbox-badge ${state.status === 'scheduled' ? 'homepage-sandbox-badge-scheduled' : ''}`}
              >
                {state.label}
              </span>
            </div>
            <div className='homepage-sandbox-detail'>{state.detail}</div>
            <div className='homepage-sandbox-output'>{state.output}</div>
          </div>
        ))}
      </div>

      <div className='homepage-sandbox-indicators'>
        {STATES.map((state, i) => (
          <button
            key={state.label}
            type='button'
            aria-label={`Show ${state.label}`}
            className={`homepage-sandbox-indicator ${i === activeIndex ? 'homepage-sandbox-indicator-active' : ''}`}
            onClick={() => setActiveIndex(i)}
          />
        ))}
      </div>
    </div>
  );
}
