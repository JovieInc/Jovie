import { render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { expectNoA11yViolations } from '@/tests/utils/a11y';
import { StatusPipeline, type StatusPipelineStage } from './StatusPipeline';

const stage = (
  id: string,
  label: string,
  state: StatusPipelineStage['state'],
  value: string,
  evidence: string
): StatusPipelineStage => ({ id, label, state, value, evidence });

describe('StatusPipeline certificate', () => {
  it('shows every stage pending before readings arrive (loading)', async () => {
    const { container } = render(
      <StatusPipeline
        ariaLabel='Lifecycle'
        stages={[
          stage('desired', 'Desired', 'pending', 'Not reached', 'Registry'),
          stage('built', 'Built', 'pending', 'Not reached', 'Merges'),
        ]}
      />
    );

    const list = screen.getByRole('list', { name: 'Lifecycle' });
    const items = within(list).getAllByRole('listitem');
    expect(items).toHaveLength(2);
    for (const item of items) {
      expect(item).toHaveAttribute('data-state', 'pending');
      expect(item).not.toHaveAttribute('aria-current');
    }
    expect(screen.getByText('Not reached. Registry')).toHaveClass('sr-only');
    await expectNoA11yViolations(container);
  });

  it('renders an empty labelled list when there are no stages', async () => {
    const { container } = render(
      <StatusPipeline ariaLabel='Lifecycle' stages={[]} testId='pipe' />
    );

    const list = screen.getByTestId('pipe');
    expect(list).toHaveAttribute('aria-label', 'Lifecycle');
    expect(within(list).queryAllByRole('listitem')).toHaveLength(0);
    await expectNoA11yViolations(container);
  });

  it('marks unknown readings muted and the current stage as the step (partial)', async () => {
    const { container } = render(
      <StatusPipeline
        ariaLabel='Lifecycle'
        testId='pipe'
        stages={[
          stage('built', 'Built', 'current', 'In review', 'Pull request'),
          stage(
            'observed',
            'Observed',
            'unknown',
            'Not instrumented',
            'Analytics'
          ),
        ]}
      />
    );

    expect(screen.getByTestId('pipe-stage-built')).toHaveAttribute(
      'aria-current',
      'step'
    );
    expect(screen.getByText('In review')).toHaveClass('text-primary-token');
    expect(screen.getByText('Not instrumented')).toHaveClass(
      'text-tertiary-token'
    );
    expect(screen.getByText('Unknown. Analytics')).toBeInTheDocument();
    await expectNoA11yViolations(container);
  });

  it('keeps long readings as evidence titles and stays axe-clean in RTL', async () => {
    const evidence =
      'Deploy log, production and staging environments, last 7 days';
    const { container } = render(
      <div dir='rtl'>
        <StatusPipeline
          ariaLabel='دورة حياة المنتج'
          testId='pipe'
          stages={[
            stage(
              'deployed',
              'Deployed to production and staging',
              'failed',
              'Rolled back after the canary error budget was spent',
              evidence
            ),
            stage('built', 'مبني', 'blocked', 'قيد المراجعة', 'طلب دمج'),
          ]}
        />
      </div>
    );

    expect(screen.getByTestId('pipe-stage-deployed')).toHaveAttribute(
      'title',
      evidence
    );
    expect(
      screen.getByText('Rolled back after the canary error budget was spent')
    ).toHaveClass('truncate');
    expect(screen.getByText(`Failed. ${evidence}`)).toBeInTheDocument();
    expect(screen.getByText('Blocked. طلب دمج')).toBeInTheDocument();
    await expectNoA11yViolations(container);
  });
});
