'use client';

export function SystemIcon({ className = 'h-5 w-5' }: { className?: string }) {
  return (
    <svg
      className={className}
      fill='none'
      stroke='currentColor'
      viewBox='0 0 24 24'
      aria-hidden='true'
    >
      <path
        strokeLinecap='round'
        strokeLinejoin='round'
        strokeWidth={2}
        d='M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z'
      />
    </svg>
  );
}

export function MoonIcon({ className = 'h-5 w-5' }: { className?: string }) {
  return (
    <svg
      className={className}
      fill='none'
      stroke='currentColor'
      viewBox='0 0 24 24'
      aria-hidden='true'
    >
      <path
        strokeLinecap='round'
        strokeLinejoin='round'
        strokeWidth={2}
        d='M20.354 15.354A9 9 0 018.646 3.646 9.003 9.003 0 0012 21a9.003 9.003 0 008.354-5.646z'
      />
    </svg>
  );
}

export function SunIcon({ className = 'h-5 w-5' }: { className?: string }) {
  return (
    <svg
      className={className}
      fill='none'
      stroke='currentColor'
      viewBox='0 0 24 24'
      aria-hidden='true'
    >
      <path
        strokeLinecap='round'
        strokeLinejoin='round'
        strokeWidth={2}
        d='M12 3v1m0 16v1m9-9h-1M4 12H3m15.364 6.364l-.707-.707M6.343 6.343l-.707-.707m12.728 0l-.707.707M6.343 17.657l-.707.707M16 12a4 4 0 11-8 0 4 4 0 018 0z'
      />
    </svg>
  );
}

export function SmallSystemIcon({
  className = 'h-3.5 w-3.5',
}: {
  className?: string;
}) {
  return (
    <svg
      viewBox='0 0 20 20'
      fill='none'
      className={className}
      aria-hidden='true'
    >
      <path
        stroke='currentColor'
        strokeLinecap='round'
        strokeLinejoin='round'
        strokeWidth='1.5'
        d='M10 12.5v2.75m0 0H7.75m2.25 0h2.25m-6.5-3h8.5a1 1 0 0 0 1-1v-5.5a1 1 0 0 0-1-1h-8.5a1 1 0 0 0-1 1v5.5a1 1 0 0 0 1 1Z'
      />
    </svg>
  );
}

export function SmallSunIcon({
  className = 'h-3.5 w-3.5',
}: {
  className?: string;
}) {
  return (
    <svg
      viewBox='0 0 20 20'
      fill='none'
      className={className}
      aria-hidden='true'
    >
      <circle
        cx='10'
        cy='10'
        r='3.25'
        stroke='currentColor'
        strokeWidth='1.5'
      />
      <g
        stroke='currentColor'
        strokeLinecap='round'
        strokeLinejoin='round'
        strokeWidth='1.5'
      >
        <path d='M10 3.75v.5M14.42 5.58l-.354.354M16.25 10h-.5M14.42 14.42l-.354-.354M10 15.75v.5M5.934 14.065l-.354.354M4.25 10h-.5M5.934 5.935 5.58 5.58' />
      </g>
    </svg>
  );
}

export function SmallMoonIcon({
  className = 'h-3.5 w-3.5',
}: {
  className?: string;
}) {
  return (
    <svg
      viewBox='0 0 20 20'
      fill='none'
      className={className}
      aria-hidden='true'
    >
      <path
        stroke='currentColor'
        strokeWidth='1.5'
        strokeLinecap='round'
        strokeLinejoin='round'
        d='M17.293 13.293A8 8 0 016.707 2.707a8.001 8.001 0 1010.586 10.586z'
      />
    </svg>
  );
}
