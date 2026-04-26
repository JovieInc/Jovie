'use client';

import { Button } from '@jovie/ui';
import { ChevronDown, PencilLine } from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AmountSelector } from '@/components/atoms/AmountSelector';
import { SocialIcon } from '@/components/atoms/SocialIcon';
import { cn } from '@/lib/utils';

type PaySelectorPresentation = 'default' | 'drawer';

interface PaySelectorProps {
  readonly amounts?: number[];
  readonly onContinue: (amount: number) => void;
  readonly isLoading?: boolean;
  readonly className?: string;
  readonly paymentLabel?: string;
  readonly presentation?: PaySelectorPresentation;
  readonly primaryLabel?: string;
  readonly otherPaymentOptionsLabel?: string;
  readonly showOtherPaymentOptions?: boolean;
}

function formatAmountForScreenReader(amount: number): string {
  return amount % 1 === 0 ? `$${amount}` : `$${amount.toFixed(2)}`;
}

function sanitizeCurrencyInput(value: string): string {
  const cleaned = value.replace(/[^\d.]/g, '');
  const [whole = '', ...fractionParts] = cleaned.split('.');
  const fraction = fractionParts.join('').slice(0, 2);
  return fraction.length > 0 ? `${whole}.${fraction}` : whole;
}

function parseCustomAmount(value: string): number | null {
  if (value.trim().length === 0) {
    return null;
  }

  const parsed = Number.parseFloat(value);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return null;
  }

  return Number(parsed.toFixed(2));
}

export function PaySelector({
  amounts = [5, 10, 20],
  onContinue,
  isLoading = false,
  className = '',
  paymentLabel,
  presentation = 'default',
  primaryLabel = 'Send payment',
  otherPaymentOptionsLabel = 'Other payment options',
  showOtherPaymentOptions = false,
}: PaySelectorProps) {
  const defaultIdx = Math.floor(Math.max(0, amounts.length - 1) / 2);
  const [selectedIdx, setSelectedIdx] = useState<number>(defaultIdx);
  const [customMode, setCustomMode] = useState(false);
  const [customAmount, setCustomAmount] = useState(
    String(amounts[defaultIdx] ?? 0)
  );
  const [showOtherOptions, setShowOtherOptions] = useState(
    presentation === 'drawer' && showOtherPaymentOptions
  );
  const statusRef = useRef<HTMLDivElement>(null);
  const customInputRef = useRef<HTMLInputElement>(null);

  const selectedAmount = useMemo(() => {
    if (!customMode) {
      return amounts[selectedIdx] ?? amounts[defaultIdx] ?? 0;
    }

    return parseCustomAmount(customAmount) ?? 0;
  }, [amounts, customAmount, customMode, defaultIdx, selectedIdx]);

  const canContinue = selectedAmount > 0;

  const handleContinue = useCallback(() => {
    if (!canContinue) {
      return;
    }

    onContinue(selectedAmount);
  }, [canContinue, onContinue, selectedAmount]);

  const handleAmountSelect = useCallback(
    (idx: number) => {
      setSelectedIdx(idx);
      setCustomMode(false);
      const nextAmount = amounts[idx] ?? amounts[defaultIdx] ?? 0;
      setCustomAmount(String(nextAmount));
    },
    [amounts, defaultIdx]
  );

  const handleCustomToggle = useCallback(() => {
    setCustomMode(current => !current);
    setCustomAmount(currentAmount => {
      if (currentAmount.trim().length > 0) {
        return currentAmount;
      }

      return String(amounts[selectedIdx] ?? amounts[defaultIdx] ?? 0);
    });
  }, [amounts, defaultIdx, selectedIdx]);

  useEffect(() => {
    if (customMode) {
      customInputRef.current?.focus();
      customInputRef.current?.select();
    }
  }, [customMode]);

  useEffect(() => {
    if (statusRef.current) {
      statusRef.current.textContent = `${formatAmountForScreenReader(
        selectedAmount
      )} selected`;
    }
  }, [selectedAmount]);

  if (presentation === 'drawer') {
    return (
      <div
        className={cn('space-y-4.5', className)}
        data-presentation='drawer'
        data-test='pay-selector'
      >
        <h3 id='pay-selector-heading' className='sr-only'>
          Select amount
        </h3>

        <div className='sr-only' aria-live='polite' ref={statusRef}></div>

        <div className='space-y-4'>
          <div className='min-h-[160px]' data-testid='pay-selector-amount-slot'>
            <div className='min-h-[92px]'>
              {customMode ? (
                <div className='flex min-h-[92px] items-center'>
                  <label className='w-full'>
                    <span className='sr-only'>Custom amount</span>
                    <div className='flex h-[92px] items-center rounded-[22px] border border-white/12 bg-white/[0.03] px-4.5 text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.03)]'>
                      <span className='mr-3 text-[26px] font-medium tracking-[-0.04em] text-white/42'>
                        $
                      </span>
                      <input
                        ref={customInputRef}
                        type='text'
                        inputMode='decimal'
                        value={customAmount}
                        onChange={event => {
                          setCustomAmount(
                            sanitizeCurrencyInput(event.currentTarget.value)
                          );
                        }}
                        placeholder='0.00'
                        className='h-full w-full bg-transparent text-[30px] font-semibold tracking-[-0.05em] text-white outline-none placeholder:text-white/18'
                        aria-label='Custom amount'
                      />
                    </div>
                  </label>
                </div>
              ) : (
                <fieldset
                  className='m-0 grid grid-cols-3 gap-3 border-0 p-0'
                  aria-label='Amount options'
                >
                  {amounts.map((amount, idx) => {
                    const isSelected = idx === selectedIdx;
                    return (
                      <button
                        key={amount}
                        type='button'
                        aria-pressed={isSelected}
                        aria-label={`Select ${formatAmountForScreenReader(amount)} payment amount`}
                        onClick={() => handleAmountSelect(idx)}
                        className={cn(
                          'flex h-[92px] items-center justify-center rounded-[22px] border text-center transition-[border-color,background-color,color,transform] duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[rgb(var(--focus-ring))] focus-visible:ring-offset-2 focus-visible:ring-offset-transparent',
                          isSelected
                            ? 'border-white bg-white text-[#121216] shadow-[0_20px_40px_rgba(255,255,255,0.08)]'
                            : 'border-white/10 bg-white/[0.02] text-white hover:border-white/18 hover:bg-white/[0.04]'
                        )}
                      >
                        <span className='text-[19px] font-medium tracking-[-0.03em]'>
                          {formatAmountForScreenReader(amount)}
                        </span>
                      </button>
                    );
                  })}
                </fieldset>
              )}
            </div>

            <div className='mt-3.5 flex justify-end'>
              <button
                type='button'
                onClick={handleCustomToggle}
                className='inline-flex items-center gap-1.5 text-[13px] font-medium tracking-[-0.015em] text-white/52 transition-colors duration-200 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[rgb(var(--focus-ring))] focus-visible:ring-offset-2 focus-visible:ring-offset-transparent'
                aria-pressed={customMode}
                aria-controls='pay-selector-heading'
              >
                <span>Custom amount</span>
                <PencilLine className='h-3.5 w-3.5' />
              </button>
            </div>
          </div>

          <button
            type='button'
            onClick={handleContinue}
            disabled={isLoading || !canContinue}
            className='flex h-[50px] w-full items-center justify-center rounded-full bg-white px-5 text-[16px] font-semibold tracking-[-0.025em] text-[#101013] transition-[opacity,transform] duration-200 hover:opacity-96 disabled:cursor-not-allowed disabled:opacity-50'
            aria-label={`${primaryLabel} for ${formatAmountForScreenReader(selectedAmount)}`}
          >
            {isLoading ? 'Processing...' : primaryLabel}
          </button>

          {showOtherPaymentOptions && paymentLabel ? (
            <div className='space-y-3.5'>
              <button
                type='button'
                onClick={() => setShowOtherOptions(open => !open)}
                className='flex w-full items-center gap-3.5 text-[13px] font-medium tracking-[-0.015em] text-white/48 transition-colors duration-200 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[rgb(var(--focus-ring))] focus-visible:ring-offset-2 focus-visible:ring-offset-transparent'
                aria-expanded={showOtherOptions}
              >
                <span className='h-px flex-1 bg-white/8' />
                <span>{otherPaymentOptionsLabel}</span>
                <ChevronDown
                  className={cn(
                    'h-4 w-4 shrink-0 transition-transform duration-200',
                    showOtherOptions && 'rotate-180'
                  )}
                />
                <span className='h-px flex-1 bg-white/8' />
              </button>

              <div
                className={cn(
                  'overflow-hidden transition-[max-height,opacity] duration-200',
                  showOtherOptions
                    ? 'max-h-24 opacity-100'
                    : 'max-h-0 opacity-0'
                )}
              >
                {showOtherOptions ? (
                  <button
                    type='button'
                    onClick={handleContinue}
                    disabled={isLoading || !canContinue}
                    className='flex h-[48px] w-full items-center justify-center gap-3 rounded-full border border-white/10 bg-white/[0.02] px-5 text-[14px] font-medium tracking-[-0.015em] text-white transition-[border-color,background-color,opacity] duration-200 hover:border-white/16 hover:bg-white/[0.04] disabled:cursor-not-allowed disabled:opacity-50'
                    aria-label={`Continue with ${paymentLabel} for ${formatAmountForScreenReader(selectedAmount)}`}
                  >
                    {paymentLabel === 'Venmo' ? (
                      <SocialIcon
                        platform='venmo'
                        size={20}
                        className='shrink-0'
                        aria-hidden
                      />
                    ) : null}
                    <span>{`Continue with ${paymentLabel}`}</span>
                  </button>
                ) : null}
              </div>
            </div>
          ) : null}
        </div>
      </div>
    );
  }

  let continueLabel = `Continue with ${formatAmountForScreenReader(
    selectedAmount
  )}`;
  if (isLoading) {
    continueLabel = 'Processing...';
  } else if (paymentLabel) {
    continueLabel = `Continue with ${paymentLabel}`;
  }

  return (
    <div className={`space-y-5 ${className}`} data-test='pay-selector'>
      <h3 id='pay-selector-heading' className='sr-only'>
        Select amount
      </h3>

      <div className='sr-only' aria-live='polite' ref={statusRef}></div>

      <p className='text-app font-semibold tracking-[-0.015em] text-secondary-token'>
        Choose Amount
      </p>

      <fieldset
        className='grid grid-cols-3 gap-3 border-0 p-0 m-0'
        aria-label='Amount options'
      >
        {amounts.map((amount, idx) => (
          <AmountSelector
            key={amount}
            amount={amount}
            isSelected={idx === selectedIdx}
            onClick={handleAmountSelect}
            index={idx}
          />
        ))}
      </fieldset>

      <Button
        onClick={handleContinue}
        className='mt-4 flex w-full items-center justify-center gap-2.5 rounded-full border border-white/8 text-[15px] font-semibold tracking-[-0.015em] text-btn-primary-foreground shadow-none transition-[opacity,border-color] duration-200 hover:border-white/14'
        size='lg'
        disabled={isLoading}
        variant='primary'
        aria-label={
          paymentLabel
            ? `Continue with ${paymentLabel} for ${formatAmountForScreenReader(selectedAmount)}`
            : `Continue with ${formatAmountForScreenReader(selectedAmount)}`
        }
      >
        {paymentLabel ? (
          <SocialIcon
            platform='venmo'
            size={20}
            className='shrink-0'
            aria-hidden
          />
        ) : null}
        {continueLabel}
      </Button>
    </div>
  );
}
