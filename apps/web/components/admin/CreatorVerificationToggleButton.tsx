'use client';

import { Button } from '@jovie/ui';
import { Check, X } from 'lucide-react';
import { useCallback } from 'react';
import type { CreatorVerificationStatus } from '@/components/admin/useCreatorVerification';
import type { AdminCreatorProfileRow } from '@/lib/admin/creator-profiles';
import { cn } from '@/lib/utils';

interface CreatorVerificationToggleButtonProps {
  profile: AdminCreatorProfileRow;
  status: CreatorVerificationStatus;
  onToggle: () => Promise<void> | void;
}

export function CreatorVerificationToggleButton({
  profile,
  status,
  onToggle,
}: CreatorVerificationToggleButtonProps) {
  const isSuccess = status === 'success';
  const isError = status === 'error';
  const label = profile.isVerified ? 'Unverify' : 'Verify';

  const stateClass = cn(
    'transition duration-200 ease-out transform',
    status === 'success' &&
      'animate-pulse motion-reduce:animate-none scale-[1.02] ring-1 ring-[color:var(--color-accent)]',
    status === 'error' &&
      'animate-bounce motion-reduce:animate-none scale-[0.97] ring-1 ring-[color:var(--color-destructive)]'
  );

  const getIcon = () => {
    if (isSuccess) {
      return (
        <Check size={14} aria-hidden='true' className='text-primary-token' />
      );
    }
    if (isError) {
      return <X size={14} aria-hidden='true' className='text-destructive' />;
    }
    return null;
  };
  const icon = getIcon();

  const handleClick = useCallback(() => {
    void onToggle();
  }, [onToggle]);

  return (
    <Button
      type='button'
      size='sm'
      variant={profile.isVerified ? 'secondary' : 'primary'}
      className={stateClass}
      loading={status === 'loading'}
      onClick={handleClick}
    >
      <span className='flex items-center gap-2'>
        {icon}
        <span>{label}</span>
      </span>
      {isSuccess && (
        <span className='sr-only' aria-live='polite'>
          Verification updated
        </span>
      )}
      {isError && (
        <span className='sr-only' aria-live='assertive'>
          Failed to update verification
        </span>
      )}
    </Button>
  );
}
