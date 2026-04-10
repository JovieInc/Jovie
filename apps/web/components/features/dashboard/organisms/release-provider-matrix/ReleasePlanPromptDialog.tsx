'use client';

import { Button } from '@jovie/ui';
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
  return (
    <Dialog open={open} onClose={onClose} size='sm'>
      <DialogTitle>
        {isGateLoading
          ? 'Release Plan'
          : canGenerateReleasePlans
            ? 'Generate Release Plan'
            : 'Upgrade To Generate A Release Plan'}
      </DialogTitle>
      <DialogDescription>
        {isGateLoading
          ? 'Checking whether this workspace can generate tasks for the release plan.'
          : canGenerateReleasePlans
            ? 'Create the step-by-step tasks for this release and jump straight into the plan.'
            : 'Upgrade to turn this release into a step-by-step plan with tasks you can assign to Jovie AI.'}
      </DialogDescription>
      <DialogBody className='space-y-2'>
        <p className='text-[13px] text-secondary-token'>
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
        {isGateLoading ? (
          <Button type='button' size='sm' disabled>
            Loading...
          </Button>
        ) : canGenerateReleasePlans ? (
          <Button
            type='button'
            size='sm'
            onClick={onGenerateReleasePlan}
            disabled={isGeneratingReleasePlan}
          >
            {isGeneratingReleasePlan
              ? 'Generating...'
              : 'Generate Release Plan'}
          </Button>
        ) : (
          <UpgradeButton size='sm'>Upgrade to Pro</UpgradeButton>
        )}
      </DialogActions>
    </Dialog>
  );
}
