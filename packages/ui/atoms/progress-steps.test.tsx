import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { type ProgressStep, ProgressSteps } from './progress-steps';

const STEPS: readonly ProgressStep[] = [
  { id: 'account', label: 'Create account' },
  { id: 'connect', label: 'Connect Spotify' },
  { id: 'verify', label: 'Verify identity' },
  { id: 'launch', label: 'Launch profile' },
];

function stepItems(): HTMLElement[] {
  return screen
    .getAllByRole('listitem')
    .map(item => item.closest('li') as HTMLElement)
    .filter(Boolean);
}

describe('ProgressSteps', () => {
  it('marks only the active step with aria-current and lists completed steps for screen readers', () => {
    render(<ProgressSteps steps={STEPS} current={1} aria-label='Setup' />);

    const items = stepItems();
    expect(items).toHaveLength(4);

    const current = items[1];
    expect(current).toHaveAttribute('aria-current', 'step');
    expect(current).toHaveAttribute('data-state', 'current');
    expect(items[0]).toHaveAttribute('data-state', 'completed');
    expect(items[0]).not.toHaveAttribute('aria-current');
    expect(items[2]).toHaveAttribute('data-state', 'upcoming');
    expect(items[3]).toHaveAttribute('data-state', 'upcoming');

    expect(screen.getByText('Completed', { exact: true })).toBeInTheDocument();
    expect(screen.getAllByText('Completed', { exact: true })).toHaveLength(1);
    expect(
      screen.queryByText('Failed', { exact: true })
    ).not.toBeInTheDocument();

    const list = screen.getByRole('list', { name: 'Setup' });
    expect(list).toHaveAttribute('data-part', 'list');
  });

  it('is resumable: moving the controlled current index re-marks states without remounting', () => {
    const { rerender } = render(
      <ProgressSteps steps={STEPS} current={0} aria-label='Setup' />
    );

    const first = stepItems()[0];
    expect(first).toHaveAttribute('aria-current', 'step');

    rerender(<ProgressSteps steps={STEPS} current={2} aria-label='Setup' />);

    const items = stepItems();
    expect(items[0]).toHaveAttribute('data-state', 'completed');
    expect(items[1]).toHaveAttribute('data-state', 'completed');
    expect(items[2]).toHaveAttribute('aria-current', 'step');
    expect(items[2]).toHaveAttribute('data-state', 'current');
    expect(items[3]).toHaveAttribute('data-state', 'upcoming');
    // Two completed steps now carry the screen-reader state word.
    expect(screen.getAllByText('Completed', { exact: true })).toHaveLength(2);
  });

  it('marks the active step as failed and announces the failure politely', () => {
    render(
      <ProgressSteps steps={STEPS} current={1} failed aria-label='Setup' />
    );

    expect(stepItems()[1]).toHaveAttribute('data-state', 'failed');
    expect(stepItems()[1]).not.toHaveAttribute('aria-current');
    expect(screen.getByText('Failed', { exact: true })).toBeInTheDocument();

    const status = screen.getByRole('status');
    expect(status).toHaveAttribute('aria-live', 'polite');
    expect(status).toHaveTextContent('Step failed: Connect Spotify');
  });

  it('announces determinate progress as a polite status region', () => {
    const { rerender } = render(
      <ProgressSteps steps={STEPS} current={0} aria-label='Setup' />
    );

    const status = screen.getByRole('status');
    expect(status).toHaveTextContent('Step 1 of 4: Create account');

    rerender(<ProgressSteps steps={STEPS} current={1} aria-label='Setup' />);
    expect(status).toHaveTextContent('Step 2 of 4: Connect Spotify');
  });

  it('reports indeterminate mode as a progressbar without aria-valuenow or aria-current', () => {
    render(
      <ProgressSteps steps={STEPS} indeterminate aria-label='Import steps' />
    );

    const bar = screen.getByRole('progressbar', { name: 'Import steps' });
    expect(bar).toHaveAttribute('aria-valuemin', '0');
    expect(bar).toHaveAttribute('aria-valuemax', '4');
    expect(bar).not.toHaveAttribute('aria-valuenow');
    expect(bar).toHaveAttribute('data-state', 'indeterminate');

    for (const item of stepItems()) {
      expect(item).toHaveAttribute('data-state', 'upcoming');
      expect(item).not.toHaveAttribute('aria-current');
    }
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
  });

  it('degrades a non-finite current to indeterminate semantics (ProgressBar precedent)', () => {
    render(
      <ProgressSteps steps={STEPS} current={Number.NaN} aria-label='Setup' />
    );

    const region = screen.getByRole('progressbar', { name: 'Setup' });
    expect(region).toHaveAttribute('data-state', 'indeterminate');
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
  });

  it('clamps out-of-range current values: above-range completes the flow, below-range starts it', () => {
    const { rerender } = render(
      <ProgressSteps steps={STEPS} current={99} aria-label='Setup' />
    );

    // current >= total: every step reads completed and none is current.
    for (const item of stepItems()) {
      expect(item).toHaveAttribute('data-state', 'completed');
      expect(item).not.toHaveAttribute('aria-current');
    }
    expect(screen.getAllByText('Completed', { exact: true })).toHaveLength(4);
    expect(screen.getByRole('status')).toHaveTextContent(
      'All 4 steps complete'
    );

    rerender(<ProgressSteps steps={STEPS} current={-7} aria-label='Setup' />);
    expect(stepItems()[0]).toHaveAttribute('aria-current', 'step');
    expect(stepItems()[3]).toHaveAttribute('data-state', 'upcoming');
  });

  it('keeps marker geometry fixed across states so completing steps never shifts layout', () => {
    const { rerender } = render(
      <ProgressSteps steps={STEPS} current={0} aria-label='Setup' />
    );

    const markersBefore = screen
      .getAllByRole('listitem')
      .map(item => item.querySelector('[data-part="marker"]'));
    const markersAfter = () =>
      screen
        .getAllByRole('listitem')
        .map(item => item.querySelector('[data-part="marker"]'));

    rerender(<ProgressSteps steps={STEPS} current={3} aria-label='Setup' />);

    expect(markersAfter()).toHaveLength(4);
    for (const marker of markersAfter()) {
      expect(marker).toHaveClass('h-5', 'w-5', 'shrink-0');
    }
    expect(markersBefore).toHaveLength(4);
  });

  it('uses canonical tokens and reduced-motion fallbacks on every reachable state', () => {
    render(
      <ProgressSteps steps={STEPS} current={1} failed aria-label='Setup' />
    );

    for (const marker of screen
      .getAllByRole('listitem')
      .map(item => item.querySelector('[data-part="marker"]'))) {
      expect(marker).toHaveClass(
        'rounded-full',
        'border',
        'transition-colors',
        'duration-subtle',
        'ease-subtle',
        'motion-reduce:transition-none'
      );
    }

    const failedMarker = screen
      .getAllByRole('listitem')
      .map(item => item.querySelector('[data-part="marker"]'))
      .at(1);
    expect(failedMarker).toHaveClass('border-error', 'text-error');

    const completedMarker = screen
      .getAllByRole('listitem')
      .map(item => item.querySelector('[data-part="marker"]'))
      .at(0);
    expect(completedMarker).toHaveClass(
      'bg-accent',
      'text-(--color-accent-foreground)'
    );
  });

  it('renders connectors only between steps, tinted when the earlier step completed', () => {
    render(<ProgressSteps steps={STEPS} current={2} aria-label='Setup' />);

    const region = screen.getByRole('list', { name: 'Setup' });
    const connectors = region.querySelectorAll('[data-part="connector"]');
    expect(connectors).toHaveLength(3);
    expect(connectors[0]).toHaveClass('bg-accent');
    expect(connectors[1]).toHaveClass('bg-accent');
    expect(connectors[2]).toHaveClass('bg-surface-2');
  });

  it('renders nothing for an empty step list', () => {
    const { container } = render(<ProgressSteps steps={[]} current={0} />);
    expect(container).toBeEmptyDOMElement();
  });
});
