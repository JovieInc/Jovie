'use client';

import { CalendarDays, DollarSign, House, Mail, UserRound } from 'lucide-react';
import type { ComponentType } from 'react';
import { CircleIconButton } from '@/components/atoms/CircleIconButton';
import type { SwipeableProfileMode } from '@/features/profile/contracts';
import { cn } from '@/lib/utils';

type QuickActionItem = {
  readonly id: SwipeableProfileMode | 'contact';
  readonly label: string;
  readonly icon: ComponentType<{ className?: string }>;
};

interface ProfileQuickActionsProps {
  readonly activeMode: SwipeableProfileMode;
  readonly onModeSelect: (mode: SwipeableProfileMode) => void;
  readonly onBookClick: () => void;
  readonly bookingDisabled?: boolean;
}

const QUICK_ACTIONS: QuickActionItem[] = [
  { id: 'profile', label: 'Home', icon: House },
  { id: 'tour', label: 'Tour', icon: CalendarDays },
  { id: 'contact', label: 'Book', icon: Mail },
  { id: 'pay', label: 'Pay', icon: DollarSign },
  { id: 'about', label: 'About', icon: UserRound },
];

export function ProfileQuickActions({
  activeMode,
  onModeSelect,
  onBookClick,
  bookingDisabled = false,
}: ProfileQuickActionsProps) {
  return (
    <div className='px-3 pt-3'>
      <nav
        className='flex items-center justify-center gap-2'
        aria-label='Profile actions'
      >
        {QUICK_ACTIONS.map(item => {
          const Icon = item.icon;
          const isContact = item.id === 'contact';
          const isActive = item.id === activeMode;
          const disabled = isContact && bookingDisabled;

          return (
            <CircleIconButton
              key={item.id}
              ariaLabel={item.label}
              size='md'
              variant={isActive ? 'surface' : 'outline'}
              className={cn(
                isActive
                  ? 'text-primary-token'
                  : 'text-secondary-token hover:text-primary-token',
                disabled && 'cursor-not-allowed opacity-45 hover:bg-transparent'
              )}
              aria-current={isActive ? 'page' : undefined}
              aria-disabled={disabled || undefined}
              onClick={() => {
                if (disabled) return;
                if (isContact) {
                  onBookClick();
                  return;
                }
                onModeSelect(item.id);
              }}
            >
              <Icon className='h-3.5 w-3.5' aria-hidden='true' />
            </CircleIconButton>
          );
        })}
      </nav>
    </div>
  );
}
