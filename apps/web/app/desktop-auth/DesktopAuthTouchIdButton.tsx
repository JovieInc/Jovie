import { Button } from '@jovie/ui';
import { forwardRef } from 'react';
import type { TouchIdState } from './desktop-auth-contract';

interface DesktopAuthTouchIdButtonProps {
  readonly onClick: () => void;
  readonly state: TouchIdState;
}

export const DesktopAuthTouchIdButton = forwardRef<
  HTMLButtonElement,
  DesktopAuthTouchIdButtonProps
>(function DesktopAuthTouchIdButton({ onClick, state }, ref) {
  return (
    <Button
      ref={ref}
      type='button'
      variant='primary'
      size='md'
      className='w-full'
      data-auth-action='primary'
      disabled={state === 'working' || state === 'signed-in'}
      onClick={onClick}
    >
      Sign In With Touch ID
    </Button>
  );
});
