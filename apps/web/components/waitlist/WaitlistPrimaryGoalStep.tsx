'use client';

import { Button } from '@jovie/ui';
import { useEffect, useRef } from 'react';
import {
  type FormErrors,
  PRIMARY_GOAL_OPTIONS,
  type PrimaryGoal,
} from './types';

interface WaitlistPrimaryGoalStepProps {
  primaryGoal: PrimaryGoal | null;
  primaryGoalFocusIndex: number;
  fieldErrors: FormErrors;
  isSubmitting: boolean;
  isHydrating: boolean;
  onSelect: (goal: PrimaryGoal) => void;
  onKeyDown: (e: React.KeyboardEvent) => void;
  setButtonRef: (index: number, el: HTMLButtonElement | null) => void;
}

export function WaitlistPrimaryGoalStep({
  primaryGoal,
  primaryGoalFocusIndex,
  fieldErrors,
  isSubmitting,
  isHydrating,
  onSelect,
  onKeyDown,
  setButtonRef,
}: WaitlistPrimaryGoalStepProps) {
  const buttonRefs = useRef<Array<HTMLButtonElement | null>>([]);

  const selectedIndex = primaryGoal
    ? PRIMARY_GOAL_OPTIONS.findIndex(o => o.value === primaryGoal)
    : 0;

  useEffect(() => {
    if (isHydrating) return;
    const button =
      buttonRefs.current[selectedIndex >= 0 ? selectedIndex : 0] ??
      buttonRefs.current[0];
    button?.focus();
  }, [isHydrating, selectedIndex]);

  return (
    <>
      <div className='space-y-1'>
        <h1 className='text-lg font-medium text-primary-token text-center'>
          Primary goal
        </h1>
        <p
          id='waitlist-primary-goal-hint'
          className='text-sm text-secondary-token text-center'
        >
          You can change this later.
        </p>
      </div>

      <div
        className='grid grid-cols-1 gap-2'
        role='radiogroup'
        aria-label='Primary goal'
        aria-describedby={
          fieldErrors.primaryGoal
            ? 'waitlist-primary-goal-hint waitlist-primary-goal-error'
            : 'waitlist-primary-goal-hint'
        }
        onKeyDown={onKeyDown}
      >
        {PRIMARY_GOAL_OPTIONS.map((option, index) => {
          const isSelected = primaryGoal === option.value;
          const isTabStop = primaryGoal ? isSelected : index === 0;

          return (
            <Button
              key={option.value}
              ref={el => {
                buttonRefs.current[index] = el;
                setButtonRef(index, el);
              }}
              type='button'
              role='radio'
              aria-checked={isSelected}
              tabIndex={isTabStop ? 0 : -1}
              onClick={() => onSelect(option.value)}
              variant={isSelected ? 'primary' : 'secondary'}
              className='w-full h-12 justify-center rounded-[6px] text-base sm:text-sm leading-5'
              disabled={isSubmitting}
            >
              {option.label}
            </Button>
          );
        })}
      </div>

      {fieldErrors.primaryGoal && (
        <p
          id='waitlist-primary-goal-error'
          role='alert'
          className='text-sm text-red-400'
        >
          {fieldErrors.primaryGoal?.[0]}
        </p>
      )}
    </>
  );
}
