import { render, screen, within } from '@testing-library/react';
import type { ComponentProps } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { HOME_LOOP_FIXTURE_COPY } from '@/components/organisms/home-loop/fixtures';
import { OvieCompanyHome } from './OvieCompanyHome';

function props(): ComponentProps<typeof OvieCompanyHome> {
  return {
    tiles: [],
    since: null,
    copy: HOME_LOOP_FIXTURE_COPY,
    asks: [],
    asksStatus: 'ready',
    answers: {},
    done: Array.from({ length: 9 }, (_, n) => ({
      id: String(n),
      label: `Release ${n}`,
      url: null,
      verified: false,
    })),
    doneSummary: null,
    mergesToday: 12,
    loopStatus: 'ready',
    onApprove: vi.fn(),
    onReply: vi.fn(),
  };
}

describe('OvieCompanyHome', () => {
  it('bounds shipped rows and accounts for the remaining merges', () => {
    render(<OvieCompanyHome {...props()} />);
    const shipped = screen.getByTestId('ovie-shipped-list');
    expect(within(shipped).getAllByRole('listitem')).toHaveLength(6);
    expect(shipped).toHaveTextContent('+6 more merges');
    expect(screen.getByTestId('home-loop-asks-section')).toHaveTextContent(
      'Nothing needs your decision.'
    );
  });

  it('replaces shipped rows with generated content in the same section', () => {
    render(
      <OvieCompanyHome
        {...props()}
        generatedInFlight={<p>Generated shipping card</p>}
      />
    );
    expect(screen.queryByTestId('ovie-shipped-list')).toBeNull();
    expect(
      within(screen.getByTestId('home-loop-done-section')).getByText(
        'Generated shipping card'
      )
    ).toBeVisible();
  });
});
