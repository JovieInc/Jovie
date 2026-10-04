'use client';

import { Button, Input } from '@jovie/ui';
import { type FormEvent, useId, useMemo, useState } from 'react';
import {
  Dialog,
  DialogActions,
  DialogBody,
  DialogDescription,
  DialogTitle,
} from '@/components/organisms/Dialog';
import type { LaunchDecisionKind } from '@/lib/launch';
import { resolveStepAutonomy } from '@/lib/tasks/playbooks/autonomy';
import {
  PLAYBOOK_PICKER_COPY as COPY,
  PLAYBOOK_ASSIST_DESCRIPTION,
  PLAYBOOK_ASSIST_LABEL,
  PLAYBOOK_AUTONOMY_DESCRIPTION,
  PLAYBOOK_AUTONOMY_LABEL,
  PLAYBOOK_LAUNCH_SIZES,
  playbookStepCountLabel,
} from '@/lib/tasks/playbooks/copy';
import {
  getDefaultPlaybookId,
  listPlaybookTemplates,
  type PlaybookCreatorType,
} from '@/lib/tasks/playbooks/registry';
import {
  PLAYBOOK_AUTONOMY_LEVELS,
  type PlaybookAutonomy,
  type PlaybookId,
  type PlaybookTemplate,
} from '@/lib/tasks/playbooks/types';
import { cn } from '@/lib/utils';

export interface PlaybookPickerSubmit {
  readonly playbookId: PlaybookId;
  readonly projectName: string;
  readonly targetDate: string;
  readonly autonomy: PlaybookAutonomy;
  readonly intakeAnswers?: readonly string[];
  readonly launchDecision?: LaunchDecisionKind;
}

export interface PlaybookPickerDialogProps {
  readonly open: boolean;
  readonly creatorType?: PlaybookCreatorType | null;
  readonly pending?: boolean;
  readonly onClose: () => void;
  readonly onSubmit: (input: PlaybookPickerSubmit) => void;
  readonly onOpenReleases: () => void;
}

const MAX_PHASES_SHOWN = 6;

/** The plan's shape at a glance; long sequences collapse to first and last. */
function phaseSummary(template: PlaybookTemplate): string {
  const phases = [...new Set(template.steps.map(step => step.phase))];
  if (phases.length <= MAX_PHASES_SHOWN) return phases.join(' · ');
  return [...phases.slice(0, 3), '…', phases[phases.length - 1]].join(' · ');
}

/** Only offer a choice when some step could actually run as an agent. */
function hasAgentSteps(template: PlaybookTemplate): boolean {
  return template.steps.some(
    step => resolveStepAutonomy('autopilot', step) !== 'hands_on'
  );
}

function intakePrompts(template: PlaybookTemplate): readonly string[] {
  return template.intake.kind === 'none' ? [] : template.intake.prompts;
}

function ChoiceRow<T extends string>({
  name,
  label,
  options,
  value,
  onChange,
  titles,
}: Readonly<{
  name: string;
  label: string;
  options: ReadonlyArray<readonly [T, string]>;
  value: T;
  onChange: (value: T) => void;
  titles?: Readonly<Partial<Record<T, string>>>;
}>) {
  return (
    <fieldset className='space-y-1 sm:col-span-2'>
      <legend className='text-xs font-medium text-secondary-token'>
        {label}
      </legend>
      <div className='flex flex-wrap gap-x-4 gap-y-1'>
        {options.map(([optionValue, optionLabel]) => (
          <label
            key={optionValue}
            title={titles?.[optionValue]}
            className='flex cursor-pointer items-center gap-1.5 text-xs text-primary-token'
          >
            <input
              type='radio'
              name={name}
              value={optionValue}
              checked={value === optionValue}
              onChange={() => onChange(optionValue)}
              className='accent-current'
            />
            {optionLabel}
          </label>
        ))}
      </div>
    </fieldset>
  );
}

export function PlaybookPickerDialog({
  open,
  creatorType,
  pending = false,
  onClose,
  onSubmit,
  onOpenReleases,
}: Readonly<PlaybookPickerDialogProps>) {
  const templates = useMemo(
    () => listPlaybookTemplates(creatorType),
    [creatorType]
  );
  const defaultId = getDefaultPlaybookId(creatorType);
  const [selectedId, setSelectedId] = useState<PlaybookId>(defaultId);
  const [projectName, setProjectName] = useState('');
  const [targetDate, setTargetDate] = useState('');
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [autonomy, setAutonomy] = useState<PlaybookAutonomy | null>(null);
  const [launchSize, setLaunchSize] =
    useState<LaunchDecisionKind>('coordinated_launch');
  const formId = useId();
  const nameId = useId();
  const dateId = useId();

  const selected =
    templates.find(template => template.id === selectedId) ?? templates[0];
  const isReleaseAnchored = selected.anchor === 'release';
  const prompts = intakePrompts(selected);
  const showAutonomy = hasAgentSteps(selected);
  const effectiveAutonomy = autonomy ?? selected.defaultAutonomy;
  const canSubmit =
    !isReleaseAnchored &&
    !pending &&
    projectName.trim().length > 0 &&
    targetDate.length > 0;

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!canSubmit) return;
    const intakeAnswers = prompts.map(
      (_, index) => answers[`${selected.id}:${index}`]?.trim() ?? ''
    );
    onSubmit({
      playbookId: selected.id,
      projectName: projectName.trim(),
      targetDate,
      autonomy: effectiveAutonomy,
      ...(intakeAnswers.some(Boolean) ? { intakeAnswers } : {}),
      ...(selected.intake.kind === 'merged_pr'
        ? { launchDecision: launchSize }
        : {}),
    });
  };

  return (
    <Dialog
      open={open}
      onClose={onClose}
      size='4xl'
      // The app-shell stylesheet re-emits the base max-w-lg after the
      // global sm:max-w-4xl, so restate the width where both compile.
      className='md:max-w-4xl'
    >
      <DialogTitle>{COPY.title}</DialogTitle>
      <DialogDescription>{COPY.description}</DialogDescription>
      <DialogBody className='-mx-1 grid max-h-[calc(100dvh-21rem)] gap-x-6 overflow-y-auto px-1 sm:max-h-[calc(100dvh-15rem)] md:grid-cols-[minmax(0,5fr)_minmax(0,6fr)]'>
        <fieldset
          data-testid='playbook-picker-list'
          className='space-y-0.5 md:-ml-3'
        >
          <legend className='sr-only'>{COPY.listLabel}</legend>
          {templates.map(template => {
            const isSelected = template.id === selected.id;
            return (
              <label
                key={template.id}
                data-testid={`playbook-option-${template.id}`}
                className={cn(
                  'flex cursor-pointer items-start gap-3 rounded-lg px-3 py-2.5 transition-colors',
                  isSelected ? 'bg-surface-2' : 'hover:bg-surface-2/60'
                )}
              >
                <input
                  type='radio'
                  name='playbook'
                  value={template.id}
                  checked={isSelected}
                  onChange={() => {
                    setSelectedId(template.id);
                    setAutonomy(null);
                  }}
                  className='mt-1 accent-current'
                />
                <span className='min-w-0 flex-1'>
                  <span className='flex flex-wrap items-center gap-x-2 gap-y-0.5'>
                    <span className='text-sm font-medium text-primary-token'>
                      {template.name}
                    </span>
                    {template.id === defaultId ? (
                      <span className='text-2xs text-tertiary-token'>
                        {COPY.suggested}
                      </span>
                    ) : null}
                  </span>
                  <span className='mt-0.5 line-clamp-2 text-xs text-secondary-token'>
                    {template.summary}
                  </span>
                  <span className='mt-1 block text-2xs text-tertiary-token'>
                    {playbookStepCountLabel(template.steps.length)}
                    {' · '}
                    <span
                      title={PLAYBOOK_ASSIST_DESCRIPTION[template.assistMode]}
                    >
                      {PLAYBOOK_ASSIST_LABEL[template.assistMode]}
                    </span>
                  </span>
                </span>
              </label>
            );
          })}
        </fieldset>

        <div
          data-testid='playbook-picker-detail'
          className='mt-4 space-y-3 border-t border-subtle pt-4 md:sticky md:top-0 md:mt-0 md:self-start md:border-t-0 md:border-l md:pt-1 md:pl-6'
        >
          <p className='text-2xs text-tertiary-token max-sm:hidden'>
            {phaseSummary(selected)}
          </p>

          {isReleaseAnchored ? (
            <p className='text-xs text-secondary-token'>
              {COPY.releaseAnchorNote}
            </p>
          ) : (
            <form
              id={formId}
              onSubmit={handleSubmit}
              className='grid gap-3 sm:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]'
            >
              <div className='min-w-0 space-y-1'>
                <label
                  htmlFor={nameId}
                  className='text-xs font-medium text-secondary-token'
                >
                  {COPY.nameLabel}
                </label>
                <Input
                  id={nameId}
                  value={projectName}
                  onChange={event => setProjectName(event.target.value)}
                  placeholder={selected.projectNamePlaceholder}
                  maxLength={200}
                />
              </div>
              <div className='min-w-0 space-y-1'>
                <label
                  htmlFor={dateId}
                  className='text-xs font-medium text-secondary-token'
                >
                  {selected.targetDateLabel}
                </label>
                <Input
                  id={dateId}
                  type='date'
                  value={targetDate}
                  onChange={event => setTargetDate(event.target.value)}
                />
              </div>
              {selected.intake.kind === 'merged_pr' ? (
                <ChoiceRow
                  name='launch-size'
                  label={COPY.launchSizeLabel}
                  options={PLAYBOOK_LAUNCH_SIZES}
                  value={launchSize}
                  onChange={setLaunchSize}
                />
              ) : null}
              {showAutonomy ? (
                <ChoiceRow
                  name='autonomy'
                  label={COPY.autonomyLabel}
                  options={PLAYBOOK_AUTONOMY_LEVELS.map(
                    level => [level, PLAYBOOK_AUTONOMY_LABEL[level]] as const
                  )}
                  value={effectiveAutonomy}
                  onChange={setAutonomy}
                  titles={PLAYBOOK_AUTONOMY_DESCRIPTION}
                />
              ) : null}
              {prompts.length > 0 ? (
                <div
                  data-testid='playbook-picker-intake'
                  className='space-y-2 sm:col-span-2'
                >
                  <p className='text-xs font-medium text-secondary-token'>
                    {selected.intake.kind === 'merged_pr'
                      ? COPY.intakeLabelPullRequest
                      : COPY.intakeLabel}
                    <span className='ml-2 font-normal text-tertiary-token'>
                      {COPY.intakeHint}
                    </span>
                  </p>
                  {prompts.map((prompt, index) => {
                    const key = `${selected.id}:${index}`;
                    return (
                      <Input
                        key={key}
                        aria-label={prompt}
                        placeholder={prompt}
                        value={answers[key] ?? ''}
                        onChange={event =>
                          setAnswers(current => ({
                            ...current,
                            [key]: event.target.value,
                          }))
                        }
                        maxLength={2000}
                      />
                    );
                  })}
                </div>
              ) : null}
            </form>
          )}

          {selected.sources.length > 0 ? (
            <p
              data-testid='playbook-picker-sources'
              className='text-2xs text-tertiary-token'
            >
              {COPY.sourcesLabel}:{' '}
              {selected.sources.map((source, index) => (
                <span key={source.url}>
                  {index > 0 ? ' · ' : null}
                  <a
                    href={source.url}
                    target='_blank'
                    rel='noopener noreferrer'
                    title={source.author}
                    className='underline decoration-dotted underline-offset-2 hover:text-secondary-token'
                  >
                    {source.title}
                  </a>
                </span>
              ))}
            </p>
          ) : null}
        </div>
      </DialogBody>
      <DialogActions>
        <Button type='button' size='sm' variant='secondary' onClick={onClose}>
          {COPY.cancel}
        </Button>
        {isReleaseAnchored ? (
          <Button type='button' size='sm' onClick={onOpenReleases}>
            {COPY.releaseAnchorAction}
          </Button>
        ) : (
          <Button type='submit' size='sm' form={formId} disabled={!canSubmit}>
            {pending ? COPY.submitPending : COPY.submit}
          </Button>
        )}
      </DialogActions>
    </Dialog>
  );
}
