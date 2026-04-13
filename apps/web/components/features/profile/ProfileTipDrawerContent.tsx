'use client';

import { TipSelector } from '@/components/molecules/TipSelector';

interface ProfileTipDrawerContentProps {
  readonly amounts?: readonly number[];
  readonly interactive?: boolean;
  readonly onAmountSelected?: (amount: number) => void;
}

export function ProfileTipDrawerContent({
  amounts = [3, 5, 7],
  interactive = true,
  onAmountSelected,
}: ProfileTipDrawerContentProps) {
  return (
    <div data-testid='profile-tip-drawer-content'>
      <TipSelector
        amounts={[...amounts]}
        onContinue={
          interactive ? amount => onAmountSelected?.(amount) : () => {}
        }
        paymentLabel='Venmo'
      />
    </div>
  );
}
