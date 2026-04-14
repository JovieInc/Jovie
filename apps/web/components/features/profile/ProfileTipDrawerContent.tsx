'use client';

import { PaySelector } from '@/components/molecules/PaySelector';

interface ProfileTipDrawerContentProps {
  readonly amounts?: readonly number[];
  readonly interactive?: boolean;
  readonly onAmountSelected?: (amount: number) => void;
}

export function ProfileTipDrawerContent({
  amounts = [5, 10, 20],
  interactive = true,
  onAmountSelected,
}: ProfileTipDrawerContentProps) {
  return (
    <div data-testid='profile-tip-drawer-content'>
      <PaySelector
        amounts={[...amounts]}
        onContinue={
          interactive ? amount => onAmountSelected?.(amount) : () => {}
        }
        paymentLabel='Pay'
      />
    </div>
  );
}
