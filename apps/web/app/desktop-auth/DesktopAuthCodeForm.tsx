import { Button, Input } from '@jovie/ui';
import type { FormEventHandler, ReactNode, RefObject } from 'react';
import {
  isCompleteReturnCode,
  type RedeemState,
} from './desktop-auth-contract';

interface DesktopAuthCodeFormProps {
  readonly cancelButton: ReactNode;
  readonly inputRef: RefObject<HTMLInputElement | null>;
  readonly onBack: () => void;
  readonly onReturnCodeChange: (value: string) => void;
  readonly onSubmit: FormEventHandler<HTMLFormElement>;
  readonly redeemState: RedeemState;
  readonly returnCode: string;
  readonly statusId: string;
}

export function DesktopAuthCodeForm({
  cancelButton,
  inputRef,
  onBack,
  onReturnCodeChange,
  onSubmit,
  redeemState,
  returnCode,
  statusId,
}: DesktopAuthCodeFormProps) {
  const isRedeeming = redeemState === 'redeeming';
  return (
    <form
      className='mt-5 flex w-full flex-col items-center justify-center gap-4'
      data-desktop-auth-state={
        redeemState === 'redeemed' ? 'code-complete' : 'code'
      }
      data-testid='desktop-auth-code-form'
      onSubmit={onSubmit}
    >
      <Input
        ref={inputRef}
        aria-label='Code From Your Browser'
        aria-describedby={statusId}
        autoCapitalize='characters'
        autoComplete='one-time-code'
        inputMode='text'
        maxLength={9}
        name='return-code'
        placeholder='XXXX-XXXX'
        spellCheck={false}
        value={returnCode}
        onChange={event => onReturnCodeChange(event.target.value)}
      />
      <Button
        type='submit'
        variant='primary'
        size='md'
        className='w-full'
        data-auth-action='primary'
        disabled={
          !isCompleteReturnCode(returnCode) ||
          isRedeeming ||
          redeemState === 'redeemed'
        }
      >
        {isRedeeming ? 'Signing In...' : 'Continue'}
      </Button>
      <div className='flex flex-wrap items-center justify-center gap-x-4 gap-y-4'>
        <Button
          type='button'
          variant='link'
          size='sm'
          disabled={isRedeeming}
          onClick={onBack}
        >
          Back To Sign-in Options
        </Button>
        {cancelButton}
      </div>
    </form>
  );
}
