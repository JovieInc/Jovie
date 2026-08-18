import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  enabled: true,
  notFound: vi.fn(() => {
    throw new Error('NEXT_NOT_FOUND');
  }),
}));

vi.mock('next/navigation', () => ({ notFound: mocks.notFound }));
vi.mock('@/lib/flags/client', () => ({ useAppFlag: () => mocks.enabled }));
vi.mock('@/components/jovie/release-calendar/ReleaseCalendar', () => ({
  ReleaseCalendar: ({
    plan,
    onMomentClick,
  }: {
    readonly plan: Array<{ readonly slug: string; readonly title: string }>;
    readonly onMomentClick: (moment: {
      readonly slug: string;
      readonly title: string;
    }) => void;
  }) => (
    <button type='button' onClick={() => onMomentClick(plan[0])}>
      Calendar with {plan.length} moments
    </button>
  ),
}));
vi.mock('@/components/jovie/release-calendar/ReleaseMomentDrawer', () => ({
  ReleaseMomentDrawer: ({
    moment,
  }: {
    readonly moment: { readonly title: string } | null;
  }) => (
    <div data-testid='release-moment-drawer'>{moment?.title ?? 'Closed'}</div>
  ),
}));

import ReleasePlanPage from './page';

describe('ReleasePlanPage', () => {
  beforeEach(() => {
    mocks.enabled = true;
    mocks.notFound.mockClear();
  });

  it('uses the canonical page/card anatomy and generates the interactive plan', () => {
    render(<ReleasePlanPage />);

    expect(screen.getByTestId('release-plan-shell')).toBeInTheDocument();
    expect(screen.getByTestId('release-plan-empty-state')).toHaveClass(
      'rounded-xl',
      'border'
    );
    expect(screen.getAllByTestId(/release-plan-track-/)).toHaveLength(4);
    expect(screen.getByText('Closed')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Generate Plan' }));
    const calendar = screen.getByRole('button', {
      name: /Calendar with \d+ moments/,
    });
    fireEvent.click(calendar);
    expect(screen.getByTestId('release-moment-drawer')).not.toHaveTextContent(
      'Closed'
    );
  });

  it('preserves the feature-flag not-found boundary', () => {
    mocks.enabled = false;

    expect(() => render(<ReleasePlanPage />)).toThrow('NEXT_NOT_FOUND');
    expect(mocks.notFound).toHaveBeenCalled();
  });
});
