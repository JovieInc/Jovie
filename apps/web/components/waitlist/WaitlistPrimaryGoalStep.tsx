'use client';

import { Button } from '@jovie/ui';
import { memo, useCallback, useEffect, useRef } from 'react';
import { FORM_LAYOUT } from '@/lib/auth/constants';
import {
  type FormErrors,
  PRIMARY_GOAL_OPTIONS,
  type PrimaryGoal,
} from './types';

interface GoalButtonProps {
  readonly value: PrimaryGoal;
  readonly label: string;
  readonly isSelected: boolean;
  readonly isTabStop: boolean;
  readonly isSubmitting: boolean;
  readonly onSelect: (goal: PrimaryGoal) => void;
  readonly onButtonRef: (el: HTMLButtonElement | null) => void;
}

const GoalButton = memo(function GoalButton({
  value,
  label,
  isSelected,
  isTabStop,
  isSubmitting,
  onSelect,
  onButtonRef,
}: GoalButtonProps) {
  const handleClick = useCallback(() => {
    onSelect(value);
  }, [onSelect, value]);

  return (
    <Button
      ref={onButtonRef}
      type='button'
      role='radio'
      aria-checked={isSelected}
      tabIndex={isTabStop ? 0 : -1}
      onClick={handleClick}
      variant={isSelected ? 'primary' : 'secondary'}
      className='w-full h-11 justify-center rounded-[6px] text-[13px] leading-5'
      disabled={isSubmitting}
    >
      {label}
    </Button>
  );
});

interface WaitlistPrimaryGoalStepProps {
  readonly primaryGoal: PrimaryGoal | null;
  readonly primaryGoalFocusIndex: number;
  readonly fieldErrors: FormErrors;
  readonly isSubmitting: boolean;
  readonly isHydrating: boolean;
  readonly onSelect: (goal: PrimaryGoal) => void;
  readonly onKeyDown: (e: React.KeyboardEvent) => void;
  readonly setButtonRef: (index: number, el: HTMLButtonElement | null) => void;
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

  // Create stable ref callbacks for each button
  const createRefCallback = useCallback(
    (index: number) => (el: HTMLButtonElement | null) => {
      buttonRefs.current[index] = el;
      setButtonRef(index, el);
    },
    [setButtonRef]
  );

  return (
    <>
      <div className={FORM_LAYOUT.headerSection}>
        <h1 className={FORM_LAYOUT.title}>Primary goal</h1>
        <p id='waitlist-primary-goal-hint' className={FORM_LAYOUT.hint}>
          You can change this later.
        </p>
      </div>

      <div
        className='grid grid-cols-1 gap-2'
        role='radiogroup'
        aria-label='Primary goal'
        tabIndex={0}
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
            <GoalButton
              key={option.value}
              value={option.value}
              label={option.label}
              isSelected={isSelected}
              isTabStop={isTabStop}
              isSubmitting={isSubmitting}
              onSelect={onSelect}
              onButtonRef={createRefCallback(index)}
            />
          );
        })}
      </div>

      <div className={FORM_LAYOUT.errorContainer}>
        {fieldErrors.primaryGoal && (
          <p
            id='waitlist-primary-goal-error'
            role='alert'
            className='text-sm text-red-400'
          >
            {fieldErrors.primaryGoal?.[0]}
          </p>
        )}
      </div>
    </>
  );
}
