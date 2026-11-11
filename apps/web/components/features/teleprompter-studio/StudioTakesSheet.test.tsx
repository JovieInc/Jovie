import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { expectNoA11yViolations } from '@/tests/utils/a11y';
import { type StudioTake, StudioTakesSheet } from './StudioTakesSheet';

const takes: StudioTake[] = [
  {
    id: 'take_1',
    number: 1,
    source: 'script',
    durationMs: 30_000,
    localUrl: 'blob:take-1',
    status: 'saved',
    kept: false,
  },
  {
    id: 'take_2',
    number: 2,
    source: 'answer',
    question: 'Where did you write it?',
    durationMs: 20_000,
    localUrl: 'blob:take-2',
    status: 'failed',
    kept: false,
  },
];

function renderSheet(
  overrides: Partial<Parameters<typeof StudioTakesSheet>[0]> = {}
) {
  const props = {
    title: 'Release day shout-out',
    takes,
    onToggleKept: vi.fn(),
    onRetry: vi.fn(),
    onDone: vi.fn(),
    ...overrides,
  };
  render(<StudioTakesSheet {...props} />);
  return props;
}

describe('StudioTakesSheet', () => {
  it('lists takes with their total and privacy note', () => {
    renderSheet();

    expect(screen.getByText(/2 takes/)).toBeInTheDocument();
    expect(screen.getByText('Script')).toBeInTheDocument();
    expect(screen.getByText("Didn't save")).toBeInTheDocument();
    expect(screen.getByText('Only you can see these')).toBeInTheDocument();
  });

  it('marks a keeper, retries a failed save and finishes', () => {
    const props = renderSheet();

    fireEvent.click(screen.getByText('Mark Keeper'));
    fireEvent.click(screen.getByText('Retry'));
    fireEvent.click(screen.getByText('Done'));
    expect(props.onToggleKept).toHaveBeenCalledWith('take_1');
    expect(props.onRetry).toHaveBeenCalledWith('take_2');
    expect(props.onDone).toHaveBeenCalled();
  });

  it('passes axe with takes, with failed takes, and empty', async () => {
    for (const list of [
      takes,
      takes.map(take => ({ ...take, status: 'failed' as const })),
      [],
    ]) {
      const { container, unmount } = render(
        <StudioTakesSheet
          title='Release day shout-out'
          takes={list}
          onToggleKept={vi.fn()}
          onRetry={vi.fn()}
          onDone={vi.fn()}
        />
      );
      await expectNoA11yViolations(container);
      unmount();
    }
  });
});
