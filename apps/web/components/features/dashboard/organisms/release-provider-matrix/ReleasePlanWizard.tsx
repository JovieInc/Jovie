'use client';

import { Button } from '@jovie/ui';
import { useCallback, useMemo, useState } from 'react';
import {
  Dialog,
  DialogActions,
  DialogBody,
  DialogDescription,
  DialogTitle,
} from '@/components/organisms/Dialog';
import type {
  DistributionModel,
  Genre,
  Goal,
  ReleaseContext,
  ReleaseFormat,
  Territory,
} from '@/lib/release-tasks/applicability';

type StepKey =
  | 'releaseFormat'
  | 'distribution'
  | 'genre'
  | 'primaryGoal'
  | 'territory';

const STEPS: StepKey[] = [
  'releaseFormat',
  'distribution',
  'genre',
  'primaryGoal',
  'territory',
];

type WizardAnswers = {
  releaseFormat: ReleaseFormat | null;
  distribution: DistributionModel | null;
  genre: Genre | null;
  primaryGoal: Goal | null;
  territory: Territory | null;
};

const INITIAL: WizardAnswers = {
  releaseFormat: null,
  distribution: null,
  genre: null,
  primaryGoal: null,
  territory: null,
};

type Choice<T extends string> = { value: T; label: string };

const RELEASE_FORMAT_CHOICES: Choice<ReleaseFormat>[] = [
  { value: 'single', label: 'Single' },
  { value: 'ep', label: 'EP' },
  { value: 'album', label: 'Album' },
];

const DISTRIBUTION_CHOICES: Choice<DistributionModel>[] = [
  { value: 'diy', label: 'DIY' },
  { value: 'indie_label', label: 'Indie label' },
  { value: 'major_label', label: 'Major label' },
];

const GENRE_CHOICES: Choice<Genre>[] = [
  { value: 'electronic', label: 'Electronic' },
  { value: 'pop', label: 'Pop' },
  { value: 'rock', label: 'Rock' },
  { value: 'hiphop', label: 'Hip-hop' },
  { value: 'country', label: 'Country' },
  { value: 'rnb', label: 'R&B' },
  { value: 'classical', label: 'Classical' },
  { value: 'jazz', label: 'Jazz' },
  { value: 'folk', label: 'Folk' },
  { value: 'metal', label: 'Metal' },
  { value: 'other', label: 'Other' },
];

const GOAL_CHOICES: Choice<Goal>[] = [
  { value: 'streams', label: 'Streams' },
  { value: 'radio', label: 'Radio' },
  { value: 'press', label: 'Press' },
  { value: 'fanbase', label: 'Fanbase growth' },
  { value: 'catalog', label: 'Catalog depth' },
];

const TERRITORY_CHOICES: Choice<Territory>[] = [
  { value: 'GLOBAL', label: 'Global' },
  { value: 'US', label: 'US' },
  { value: 'EU', label: 'EU' },
  { value: 'UK', label: 'UK' },
  { value: 'LATAM', label: 'LATAM' },
  { value: 'APAC', label: 'APAC' },
];

const STEP_META: Record<StepKey, { title: string; description: string }> = {
  releaseFormat: {
    title: 'What are you releasing?',
    description: 'Single, EP, or album. This changes which prep tasks show up.',
  },
  distribution: {
    title: 'How is it being distributed?',
    description:
      'DIY covers your own submissions. A label handles most rights paperwork for you.',
  },
  genre: {
    title: "What's the genre?",
    description:
      'Genre decides radio lanes, YouTube network fits, and DJ promo pools.',
  },
  primaryGoal: {
    title: "What's the #1 goal for this release?",
    description:
      'Your primary goal sharpens which pitch and promo tasks get prioritised.',
  },
  territory: {
    title: 'Where do you care most?',
    description:
      'Territory governs things like NACC college radio (US) and other region-specific work.',
  },
};

interface ReleasePlanWizardProps {
  readonly open: boolean;
  readonly releaseTitle: string | null;
  readonly isGateLoading: boolean;
  readonly canGenerateReleasePlans: boolean;
  readonly isGeneratingReleasePlan: boolean;
  readonly onClose: () => void;
  readonly onSubmit: (ctx: ReleaseContext) => void;
}

export function ReleasePlanWizard({
  open,
  releaseTitle,
  isGateLoading,
  canGenerateReleasePlans,
  isGeneratingReleasePlan,
  onClose,
  onSubmit,
}: ReleasePlanWizardProps) {
  const [stepIndex, setStepIndex] = useState(0);
  const [answers, setAnswers] = useState<WizardAnswers>(INITIAL);

  const currentStep = STEPS[stepIndex] ?? STEPS[0];
  const stepMeta = currentStep ? STEP_META[currentStep] : null;
  const isLastStep = stepIndex === STEPS.length - 1;

  const currentValue = currentStep ? answers[currentStep] : null;
  const canAdvance = currentValue !== null;

  const handlePick = useCallback((key: StepKey, value: string) => {
    setAnswers(prev => ({ ...prev, [key]: value }) as WizardAnswers);
  }, []);

  const reset = useCallback(() => {
    setStepIndex(0);
    setAnswers(INITIAL);
  }, []);

  const handleClose = useCallback(() => {
    if (isGeneratingReleasePlan) return;
    reset();
    onClose();
  }, [isGeneratingReleasePlan, onClose, reset]);

  const handleBack = useCallback(() => {
    setStepIndex(idx => Math.max(0, idx - 1));
  }, []);

  const handleNext = useCallback(() => {
    if (!canAdvance) return;
    setStepIndex(idx => Math.min(STEPS.length - 1, idx + 1));
  }, [canAdvance]);

  const handleSubmit = useCallback(() => {
    if (
      !(
        answers.releaseFormat &&
        answers.distribution &&
        answers.genre &&
        answers.primaryGoal &&
        answers.territory
      )
    ) {
      return;
    }
    const ctx: ReleaseContext = {
      releaseFormat: answers.releaseFormat,
      distribution: answers.distribution,
      genre: answers.genre,
      primaryGoal: answers.primaryGoal,
      territory: [answers.territory],
      hasPublisher: answers.distribution !== 'diy',
    };
    onSubmit(ctx);
  }, [answers, onSubmit]);

  const choices = useMemo(() => {
    switch (currentStep) {
      case 'releaseFormat':
        return RELEASE_FORMAT_CHOICES;
      case 'distribution':
        return DISTRIBUTION_CHOICES;
      case 'genre':
        return GENRE_CHOICES;
      case 'primaryGoal':
        return GOAL_CHOICES;
      case 'territory':
        return TERRITORY_CHOICES;
      default:
        return [];
    }
  }, [currentStep]);

  // Gate / upgrade states mirror ReleasePlanPromptDialog.
  if (isGateLoading) {
    return (
      <Dialog open={open} onClose={handleClose} size='md'>
        <DialogTitle>Release Plan</DialogTitle>
        <DialogDescription>
          Checking whether this workspace can generate a release plan.
        </DialogDescription>
        <DialogActions>
          <Button type='button' size='sm' disabled>
            Loading...
          </Button>
        </DialogActions>
      </Dialog>
    );
  }

  if (!canGenerateReleasePlans) {
    return (
      <Dialog open={open} onClose={handleClose} size='md'>
        <DialogTitle>Release Plan</DialogTitle>
        <DialogDescription>
          Release plans are a Pro feature. Upgrade to generate a tailored task
          list for{' '}
          <span className='font-medium'>{releaseTitle ?? 'this release'}</span>.
        </DialogDescription>
        <DialogActions>
          <Button
            type='button'
            size='sm'
            variant='secondary'
            onClick={handleClose}
          >
            Maybe later
          </Button>
          <Button type='button' size='sm' onClick={handleClose}>
            Upgrade
          </Button>
        </DialogActions>
      </Dialog>
    );
  }

  return (
    <Dialog open={open} onClose={handleClose} size='lg'>
      <DialogTitle>Plan for {releaseTitle ?? 'this release'}</DialogTitle>
      <DialogDescription>
        Five quick questions. Jovie picks a task list tailored to your context.
      </DialogDescription>
      <DialogBody>
        <div className='space-y-4' data-testid='wizard-step'>
          <div className='text-xs uppercase tracking-wide text-muted-foreground'>
            Step {stepIndex + 1} of {STEPS.length}
          </div>
          <div>
            <div className='text-base font-medium'>{stepMeta?.title}</div>
            <div className='text-sm text-muted-foreground mt-1'>
              {stepMeta?.description}
            </div>
          </div>
          <fieldset
            className='flex flex-wrap gap-2 pt-2 border-0 p-0 m-0'
            aria-label={stepMeta?.title}
          >
            {choices.map(choice => {
              const selected = currentValue === choice.value;
              return (
                <button
                  key={choice.value}
                  type='button'
                  onClick={() =>
                    currentStep && handlePick(currentStep, choice.value)
                  }
                  aria-pressed={selected}
                  data-testid={`choice-${choice.value}`}
                  className={`px-3 py-1.5 rounded-full text-sm border transition-colors ${
                    selected
                      ? 'bg-foreground text-background border-foreground'
                      : 'bg-transparent text-foreground border-border hover:border-foreground/60'
                  }`}
                >
                  {choice.label}
                </button>
              );
            })}
          </fieldset>
        </div>
      </DialogBody>
      <DialogActions>
        <Button
          type='button'
          size='sm'
          variant='secondary'
          onClick={handleBack}
          disabled={stepIndex === 0 || isGeneratingReleasePlan}
        >
          Back
        </Button>
        {isLastStep ? (
          <Button
            type='button'
            size='sm'
            onClick={handleSubmit}
            disabled={!canAdvance || isGeneratingReleasePlan}
            data-testid='wizard-submit'
          >
            {isGeneratingReleasePlan ? 'Generating...' : 'Generate plan'}
          </Button>
        ) : (
          <Button
            type='button'
            size='sm'
            onClick={handleNext}
            disabled={!canAdvance}
            data-testid='wizard-next'
          >
            Next
          </Button>
        )}
      </DialogActions>
    </Dialog>
  );
}
