import type { PublicContactChannel } from '@/types/contacts';

export function ContactGlyph() {
  return (
    <svg
      aria-hidden='true'
      viewBox='0 0 24 24'
      className='h-4 w-4'
      stroke='currentColor'
      fill='none'
      strokeWidth={1.5}
    >
      <path
        strokeLinecap='round'
        strokeLinejoin='round'
        d='M8.5 7.5h7m-7 3h7m-7 3h4.5M5 5h14a1 1 0 0 1 1 1v12a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1Z'
      />
    </svg>
  );
}

export function ChannelIcon({ type }: { type: PublicContactChannel['type'] }) {
  if (type === 'phone') {
    return (
      <svg
        aria-hidden='true'
        viewBox='0 0 24 24'
        className='h-4 w-4'
        stroke='currentColor'
        fill='none'
        strokeWidth={1.5}
      >
        <path
          strokeLinecap='round'
          strokeLinejoin='round'
          d='M8.25 4.5h-2a1 1 0 0 0-1 1V7m0 0v4m0-4h2.75m7-2.5h2a1 1 0 0 1 1 1V7m0 0v4m0-4h-2.75M8 15.5l1.5-1.5 2 2 3-3 2.5 2.5'
        />
      </svg>
    );
  }

  return (
    <svg
      aria-hidden='true'
      viewBox='0 0 24 24'
      className='h-4 w-4'
      stroke='currentColor'
      fill='none'
      strokeWidth={1.5}
    >
      <path
        strokeLinecap='round'
        strokeLinejoin='round'
        d='M4.5 6.75l7.5 5.25 7.5-5.25m-15 0A2.25 2.25 0 0 1 6.75 4.5h10.5A2.25 2.25 0 0 1 19.5 6.75v10.5a2.25 2.25 0 0 1-2.25 2.25H6.75A2.25 2.25 0 0 1 4.5 17.25V6.75Z'
      />
    </svg>
  );
}
