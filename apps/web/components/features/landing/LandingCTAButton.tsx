'use client';

import { Button } from '@jovie/ui';
import Link from 'next/link';
import { track } from '@/lib/analytics';

interface LandingCTAButtonProps {
  readonly href: string;
  readonly label: string;
  readonly eventName: string;
  readonly section: 'hero';
  readonly variant?: 'primary' | 'text';
  readonly className?: string;
  readonly testId?: string;
}

export function LandingCTAButton({
  href,
  label,
  eventName,
  section,
  variant = 'primary',
  className,
  testId,
}: Readonly<LandingCTAButtonProps>) {
  return (
    <Button
      asChild
      variant={variant === 'primary' ? 'primary' : 'ghost'}
      size='lg'
      data-testid={testId}
      onClick={() => {
        track(eventName, { section });
      }}
    >
      <Link href={href} className={className}>
        {label}
      </Link>
    </Button>
  );
}
