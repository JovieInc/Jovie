'use client';

import { Button } from '@jovie/ui';
import { Bell } from 'lucide-react';
import React from 'react';
import { cn } from '@/lib/utils';

interface ProfileNotificationsButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  isSubscribed?: boolean;
  isOpen?: boolean;
}

export const ProfileNotificationsButton = React.forwardRef<
  HTMLButtonElement,
  ProfileNotificationsButtonProps
>(function ProfileNotificationsButton(
  { className, isOpen, isSubscribed, ...props },
  ref
) {
  return (
    <Button
      {...props}
      ref={ref}
      variant='frosted'
      className={cn(
        'relative inline-flex h-10 w-10 items-center justify-center rounded-full border border-border bg-card/80 text-foreground shadow-sm transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring data-[state=open]:bg-card/90',
        isOpen && 'ring-2 ring-ring ring-offset-2 ring-offset-background',
        className
      )}
      aria-expanded={isOpen}
    >
      <Bell
        aria-hidden
        className={cn(
          'h-5 w-5 text-muted-foreground transition-colors',
          isSubscribed && 'text-primary'
        )}
      />
      {isSubscribed ? (
        <span className='absolute -top-1 -right-1 flex h-4 w-4 items-center justify-center rounded-full bg-primary text-[10px] font-bold text-primary-foreground shadow-sm'>
          ✓
        </span>
      ) : null}
    </Button>
  );
});
