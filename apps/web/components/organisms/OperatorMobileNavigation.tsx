'use client';

import { useCallback } from 'react';
import { LiquidGlassMenu } from '@/features/dashboard/organisms/LiquidGlassMenu';
import { useAuthSafe } from '@/hooks/useClerkSafe';
import { OPERATOR_NAV_ITEMS } from './operator-navigation';

const PRIMARY_OPERATOR_ITEMS = OPERATOR_NAV_ITEMS.slice(0, 4);
const EXPANDED_OPERATOR_ITEMS = OPERATOR_NAV_ITEMS.slice(4);

export function OperatorMobileNavigation(): React.JSX.Element {
  const { signOut } = useAuthSafe();
  const handleSignOut = useCallback(async () => {
    await signOut({ redirectUrl: '/' });
  }, [signOut]);

  return (
    <LiquidGlassMenu
      primaryItems={PRIMARY_OPERATOR_ITEMS}
      expandedItems={EXPANDED_OPERATOR_ITEMS}
      navigationLabel='OV Mobile Navigation'
      expandedNavigationLabel='OV Navigation Menu'
      onSignOut={handleSignOut}
      className='lg:hidden'
    />
  );
}
