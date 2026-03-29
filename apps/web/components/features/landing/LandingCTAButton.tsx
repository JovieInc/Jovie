'use client';

import { ArrowRight } from 'lucide-react';
import Link from 'next/link';
import { track } from '@/lib/analytics';
import { cn } from '@/lib/utils';

type LandingCTAEventName =
  | 'landing_cta_get_started'
  | 'landing_cta_see_profile';

interface LandingCTAButtonProps {
  readonly href: string;
  readonly label: string;
  readonly eventName: LandingCTAEventName;
  readonly section: 'hero';
  readonly variant?: 'primary' | 'text';
  readonly className?: string;
}

export function LandingCTAButton({
  href,
  label,
  eventName,
  section,
  variant = 'primary',
  className,
}: Readonly<LandingCTAButtonProps>) {
  const isPrimary = variant === 'primary';

  return (
    <Link
      href={href}
      onClick={() => {
        track(eventName, { section });
      }}
      className={cn(
        'focus-ring-themed inline-flex items-center justify-center transition duration-150',
        isPrimary
          ? 'btn-linear-primary h-[38px] w-full rounded-md px-4 text-[13px] sm:w-auto'
          : 'gap-1.5 rounded-md py-1 text-[13px] tracking-[-0.01em] text-secondary-token hover:text-primary-token',
        className
      )}
      style={isPrimary ? { fontWeight: 510 } : { fontWeight: 500 }}
    >
      <span>{label}</span>
      {!isPrimary && <ArrowRight className='h-3.5 w-3.5' aria-hidden='true' />}
    </Link>
  );
}
