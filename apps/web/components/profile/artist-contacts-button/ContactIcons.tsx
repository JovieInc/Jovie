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
      strokeLinecap='round'
      strokeLinejoin='round'
    >
      <path d='M8.5 7.5h7m-7 3h7m-7 3h4.5M5 5h14a1 1 0 0 1 1 1v12a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1Z' />
    </svg>
  );
}

export function ChannelIcon({
  type,
}: Readonly<{ type: PublicContactChannel['type'] }>) {
  if (type === 'phone') {
    return (
      <svg
        aria-hidden='true'
        viewBox='0 0 24 24'
        className='h-4 w-4'
        stroke='currentColor'
        fill='none'
        strokeWidth={1.5}
        strokeLinecap='round'
        strokeLinejoin='round'
      >
        <path d='M8.7 3.75h-2.4c-.9 0-1.7.6-1.9 1.5-.6 2.6-.5 5.4.5 8.2 1 2.8 2.8 5.3 5.2 7.3.7.6 1.8.6 2.5 0l1.6-1.4a2 2 0 0 0 .5-2.2l-.9-2a2 2 0 0 0-2.2-1.1l-2.2.5a12.7 12.7 0 0 1-2.1-4.9l2.2-.5a2 2 0 0 0 1.5-2.1l-.2-2.2a2 2 0 0 0-2-1.8Z' />
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
      strokeLinecap='round'
      strokeLinejoin='round'
    >
      <path d='M4.5 6.75A2.25 2.25 0 0 1 6.75 4.5h10.5A2.25 2.25 0 0 1 19.5 6.75v10.5A2.25 2.25 0 0 1 17.25 19.5H6.75A2.25 2.25 0 0 1 4.5 17.25V6.75Z' />
      <path d='M4.5 7.5 12 12.75 19.5 7.5' />
    </svg>
  );
}
