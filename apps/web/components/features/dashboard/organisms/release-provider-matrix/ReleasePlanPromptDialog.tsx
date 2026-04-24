'use client';

import { Button } from '@jovie/ui';
import type { ReactNode } from 'react';
import { UpgradeButton } from '@/components/molecules/UpgradeButton';
import {
  Dialog,
  DialogActions,
  DialogBody,
  DialogDescription,
  DialogTitle,
} from '@/components/organisms/Dialog';

interface ReleasePlanPromptDialogProps {
  readonly open: boolean;
  readonly releaseTitle: string | null;
  readonly isGateLoading: boolean;
  readonly canGenerateReleasePlans: boolean;
  readonly isGeneratingReleasePlan: boolean;
  readonly onClose: () => void;
  readonly onGenerateReleasePlan: () => void;
}

export function ReleasePlanPromptDialog({
  open,
  releaseTitle,
  isGateLoading,
  canGenerateReleasePlans,
  isGeneratingReleasePlan,
  onClose,
  onGenerateReleasePlan,
}: ReleasePlanPromptDialogProps) {
  let dialogTitle: string;
  let dialogDescription: string;
  let actionButton: ReactNode;

  if (isGateLoading) {
    dialogTitle = 'Release Plan';
    dialogDescription =
      'Checking whether this workspace can generate tasks for the release plan.';
    actionButton = (
      <Button type='button' size='sm' disabled>
        Loading...
      </Button>
    );
  } else if (canGenerateReleasePlans) {
    dialogTitle = 'Generate Release Plan';
    dialogDescription =
      'Create the step-by-step tasks for this release and jump straight into the plan.';
    actionButton = (
      <Button
        type='button'
        size='sm'
        onClick={onGenerateReleasePlan}
        disabled={isGeneratingReleasePlan}
      >
        {isGeneratingReleasePlan ? 'Generating...' : 'Generate Release Plan'}
      </Button>
    );
  } else {
    dialogTitle = 'Upgrade To Generate A Release Plan';
    dialogDescription =
      'Upgrade to turn this release into a step-by-step plan with tasks you can assign to Jovie AI.';
    actionButton = <UpgradeButton size='sm'>Upgrade to Pro</UpgradeButton>;
  }

  return (
    <Dialog open={open} onClose={onClose} size='sm'>
      <DialogTitle>{dialogTitle}</DialogTitle>
      <DialogDescription>{dialogDescription}</DialogDescription>
      <DialogBody className='space-y-2'>
        <p className='text-app text-secondary-token'>
          {releaseTitle ?? 'This release'} is ready.
        </p>
      </DialogBody>
      <DialogActions>
        <Button
          type='button'
          variant='outline'
          size='sm'
          onClick={onClose}
          disabled={isGeneratingReleasePlan}
        >
          Maybe Later
        </Button>
        {actionButton}
      </DialogActions>
    </Dialog>
  );
}
