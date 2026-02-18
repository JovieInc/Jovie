import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { ProgressIndicator } from '@/components/atoms/ProgressIndicator';

describe('ProgressIndicator', () => {
  const mockSteps = [
    {
      id: '1',
      title: 'Start',
      description: 'Begin the process',
      estimatedTimeSeconds: 30,
    },
    {
      id: '2',
      title: 'Processing',
      description: 'Processing data',
      estimatedTimeSeconds: 60,
    },
    {
      id: '3',
      title: 'Complete',
      description: 'Finish up',
      estimatedTimeSeconds: 15,
    },
  ];

  it('renders progress indicator with correct attributes', () => {
    render(
      <ProgressIndicator currentStep={1} totalSteps={3} steps={mockSteps} />
    );

    const progressbar = screen.getByRole('progressbar');
    expect(progressbar).toBeInTheDocument();
    expect(progressbar).toHaveAttribute('value', '2');
    expect(progressbar).toHaveAttribute('max', '3');
  });

  it('displays correct step information', () => {
    render(
      <ProgressIndicator currentStep={1} totalSteps={3} steps={mockSteps} />
    );

    expect(screen.getByText('Step 2 of 3')).toBeInTheDocument();
  });

  it('calculates and displays remaining time correctly', () => {
    render(
      <ProgressIndicator
        currentStep={0}
        totalSteps={3}
        steps={mockSteps}
        showTimeEstimate={true}
      />
    );

    // Remaining time should be 60 + 15 = 75 seconds = 2 minutes
    expect(screen.getByText('2m remaining')).toBeInTheDocument();
  });

  it('formats time correctly for seconds under 60', () => {
    const shortSteps = [
      { id: '1', title: 'Start', estimatedTimeSeconds: 30 },
      { id: '2', title: 'End', estimatedTimeSeconds: 20 },
    ];

    render(
      <ProgressIndicator
        currentStep={0}
        totalSteps={2}
        steps={shortSteps}
        showTimeEstimate={true}
      />
    );

    expect(screen.getByText('20s remaining')).toBeInTheDocument();
  });

  it('hides time estimate when showTimeEstimate is false', () => {
    render(
      <ProgressIndicator
        currentStep={0}
        totalSteps={3}
        steps={mockSteps}
        showTimeEstimate={false}
      />
    );

    expect(screen.queryByText(/remaining/)).not.toBeInTheDocument();
  });

  it('renders all steps with correct states', () => {
    render(
      <ProgressIndicator currentStep={1} totalSteps={3} steps={mockSteps} />
    );

    // Step 1 should be completed (shows checkmark)
    expect(screen.getByText('Start')).toBeInTheDocument();

    // Step 2 should be current (shows number 2)
    expect(screen.getByText('Processing')).toBeInTheDocument();
    expect(screen.getByText('2')).toBeInTheDocument();

    // Step 3 should be upcoming (shows number 3)
    expect(screen.getByText('Complete')).toBeInTheDocument();
    expect(screen.getByText('3')).toBeInTheDocument();
  });

  it('shows description for current step only', () => {
    render(
      <ProgressIndicator currentStep={1} totalSteps={3} steps={mockSteps} />
    );

    // Only current step (Processing) should show description
    expect(screen.getByText('Processing data')).toBeInTheDocument();
    expect(screen.queryByText('Begin the process')).not.toBeInTheDocument();
    expect(screen.queryByText('Finish up')).not.toBeInTheDocument();
  });

  it('calculates progress percentage correctly', () => {
    render(
      <ProgressIndicator currentStep={1} totalSteps={3} steps={mockSteps} />
    );

    // Step 2 of 3 should be 66.67% progress
    const progressBar = screen
      .getByRole('progressbar')
      .querySelector('[style*="width"]');
    expect(progressBar).toHaveStyle('width: 66.66666666666666%');
  });

  it('applies custom className', () => {
    const customClass = 'custom-progress-class';
    render(
      <ProgressIndicator
        currentStep={0}
        totalSteps={3}
        steps={mockSteps}
        className={customClass}
      />
    );

    const progressbar = screen.getByRole('progressbar');
    expect(progressbar).toHaveClass(customClass);
  });

  it('handles edge case when no remaining time', () => {
    render(
      <ProgressIndicator
        currentStep={2}
        totalSteps={3}
        steps={mockSteps}
        showTimeEstimate={true}
      />
    );

    // On last step, no remaining time should be shown
    expect(screen.queryByText(/remaining/)).not.toBeInTheDocument();
  });

  it('uses default estimated time when not provided', () => {
    const stepsWithoutTime = [
      { id: '1', title: 'Start' },
      { id: '2', title: 'End' },
    ];

    render(
      <ProgressIndicator
        currentStep={0}
        totalSteps={2}
        steps={stepsWithoutTime}
        showTimeEstimate={true}
      />
    );

    // Should use default 30 seconds
    expect(screen.getByText('30s remaining')).toBeInTheDocument();
  });
});
