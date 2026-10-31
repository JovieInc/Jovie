import { render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { StatusPipeline, type StatusPipelineStage } from './StatusPipeline';

const stages: readonly StatusPipelineStage[] = [
  {
    id: 'desired',
    label: 'Desired',
    state: 'done',
    value: 'Registered',
    evidence: 'Registry',
  },
  {
    id: 'certified',
    label: 'Certified',
    state: 'current',
    value: 'review ready',
    evidence: 'Certification',
  },
  {
    id: 'exposed',
    label: 'Exposed',
    state: 'unknown',
    value: 'Not instrumented',
    evidence: 'Analytics',
  },
  {
    id: 'healthy',
    label: 'Healthy',
    state: 'pending',
    value: 'Deployed, unobserved',
    evidence: 'Derived',
  },
];

describe('StatusPipeline', () => {
  it('renders an ordered, named list with one item per stage', () => {
    render(<StatusPipeline ariaLabel='Delivery Lifecycle' stages={stages} />);
    const list = screen.getByRole('list', { name: 'Delivery Lifecycle' });
    expect(list.tagName).toBe('OL');
    expect(within(list).getAllByRole('listitem')).toHaveLength(4);
  });

  it('gives every stage its state, reading and evidence, never decoration', () => {
    render(<StatusPipeline ariaLabel='Delivery Lifecycle' stages={stages} />);
    const certified = screen.getByTestId('status-pipeline-stage-certified');
    expect(certified).toHaveAttribute('data-state', 'current');
    expect(certified).toHaveAttribute('aria-current', 'step');
    expect(certified).toHaveTextContent('review ready');
    expect(certified).toHaveAttribute('title', 'Certification');
    expect(
      screen.getByTestId('status-pipeline-stage-exposed')
    ).toHaveTextContent('Unknown. Analytics');
    expect(screen.getByRole('list')).not.toHaveTextContent('→');
  });

  it('marks only the current stage as the current step', () => {
    render(<StatusPipeline ariaLabel='Delivery Lifecycle' stages={stages} />);
    expect(
      screen
        .getAllByRole('listitem')
        .filter(item => item.getAttribute('aria-current') === 'step')
    ).toHaveLength(1);
  });
});
