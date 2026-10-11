import { Button } from '@jovie/ui';
import type { ReactNode, RefObject } from 'react';
import type { SelectedMethod } from './desktop-auth-contract';

interface DesktopAuthMethodOptionsProps {
  readonly cancelButton: ReactNode;
  readonly browserOptionRef: RefObject<HTMLButtonElement | null>;
  readonly canRedeemCode: boolean;
  readonly codeOptionRef: RefObject<HTMLButtonElement | null>;
  readonly copyLabel: string;
  readonly copyOptionRef: RefObject<HTMLButtonElement | null>;
  readonly disabled: boolean;
  readonly disclosureRef: RefObject<HTMLButtonElement | null>;
  readonly onCopy: () => void;
  readonly onSelectBrowser: () => void;
  readonly onSelectCode: () => void;
  readonly onSelectQr: () => void;
  readonly onSelectTouchId: () => void;
  readonly onToggle: () => void;
  readonly open: boolean;
  readonly optionsId: string;
  readonly qrOptionRef: RefObject<HTMLButtonElement | null>;
  readonly selectedMethod: SelectedMethod;
  readonly showTouchId: boolean;
  readonly touchIdOptionRef: RefObject<HTMLButtonElement | null>;
}

const OPTION_ROW_CLASS = 'w-full justify-start';

export function DesktopAuthMethodOptions({
  cancelButton,
  browserOptionRef,
  canRedeemCode,
  codeOptionRef,
  copyLabel,
  copyOptionRef,
  disabled,
  disclosureRef,
  onCopy,
  onSelectBrowser,
  onSelectCode,
  onSelectQr,
  onSelectTouchId,
  onToggle,
  open,
  optionsId,
  qrOptionRef,
  selectedMethod,
  showTouchId,
  touchIdOptionRef,
}: DesktopAuthMethodOptionsProps) {
  return (
    <>
      <div
        className='flex items-center justify-center gap-4'
        data-auth-utility-row
      >
        <Button
          ref={disclosureRef}
          type='button'
          variant='link'
          size='sm'
          aria-controls={optionsId}
          aria-expanded={open}
          data-auth-action='options'
          disabled={disabled}
          onClick={onToggle}
        >
          Other Sign-in Options
        </Button>
        {cancelButton}
      </div>
      {open ? (
        <fieldset
          id={optionsId}
          className='flex w-full flex-col gap-1 rounded-xl border border-subtle bg-surface-0 p-1'
          data-testid='desktop-auth-options'
        >
          <legend className='sr-only'>Other Sign-in Options</legend>
          {selectedMethod === 'touch-id' ? (
            <Button
              ref={browserOptionRef}
              type='button'
              variant='tertiary'
              size='sm'
              className={OPTION_ROW_CLASS}
              data-auth-option-row=''
              disabled={disabled}
              onClick={onSelectBrowser}
            >
              Continue In Browser
            </Button>
          ) : showTouchId ? (
            <Button
              ref={touchIdOptionRef}
              type='button'
              variant='tertiary'
              size='sm'
              className={OPTION_ROW_CLASS}
              data-auth-option-row=''
              disabled={disabled}
              onClick={onSelectTouchId}
            >
              Sign In With Touch ID
            </Button>
          ) : null}
          <Button
            ref={copyOptionRef}
            type='button'
            variant='tertiary'
            size='sm'
            className={OPTION_ROW_CLASS}
            data-auth-option-row=''
            disabled={disabled}
            onClick={onCopy}
          >
            {copyLabel}
          </Button>
          {canRedeemCode ? (
            <>
              <Button
                ref={codeOptionRef}
                type='button'
                variant='tertiary'
                size='sm'
                className={OPTION_ROW_CLASS}
                data-auth-option-row=''
                disabled={disabled}
                onClick={onSelectCode}
              >
                Enter A Code
              </Button>
              <Button
                ref={qrOptionRef}
                type='button'
                variant='tertiary'
                size='sm'
                className={OPTION_ROW_CLASS}
                data-auth-option-row=''
                disabled={disabled}
                onClick={onSelectQr}
              >
                Scan With Phone
              </Button>
            </>
          ) : null}
        </fieldset>
      ) : null}
    </>
  );
}
