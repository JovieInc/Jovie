import type { RefObject } from 'react';
import { cn } from '@/lib/utils';

export interface WaitlistJoinedConfirmationProps {
  /** The email the request was sent with, echoed back so a typo shows. */
  readonly email: string;
  /** The artist they confirmed in the questions, if they picked one. */
  readonly artistName?: string | null;
  readonly headingLevel?: 1 | 2 | 3;
  readonly className?: string;
  readonly confirmationRef?: RefObject<HTMLDivElement | null>;
}

/** The calm confirmation the card shows once a request lands. */
export function WaitlistJoinedConfirmation({
  email,
  artistName,
  headingLevel = 3,
  className,
  confirmationRef,
}: WaitlistJoinedConfirmationProps) {
  const Heading = headingLevel === 1 ? 'h1' : headingLevel === 2 ? 'h2' : 'h3';
  const artist = artistName?.trim();
  return (
    <div
      ref={confirmationRef}
      tabIndex={-1}
      data-testid='waitlist-role-form-joined'
      role='status'
      className={cn('flex w-full flex-col gap-2', className)}
    >
      <Heading className='text-balance text-xl font-medium tracking-tight text-primary-token'>
        You&apos;re on the waitlist.
      </Heading>
      <p className='text-pretty text-sm text-secondary-token'>
        We&apos;ll email{' '}
        <span className='break-all font-medium text-primary-token'>
          {email}
        </span>{' '}
        when your spot opens.
      </p>
      {artist ? (
        <p
          className='text-pretty text-sm text-secondary-token'
          data-testid='waitlist-role-form-joined-artist'
        >
          Your request is for{' '}
          <span className='font-medium text-primary-token'>{artist}</span>.
        </p>
      ) : null}
    </div>
  );
}
