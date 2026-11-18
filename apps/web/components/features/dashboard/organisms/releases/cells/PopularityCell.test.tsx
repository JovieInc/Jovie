import { TooltipProvider } from '@jovie/ui';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { expectNoA11yViolations } from '@/tests/utils/a11y';
import { PopularityCell } from './PopularityCell';

function renderCell(popularity: number | null | undefined) {
  return render(
    <TooltipProvider delayDuration={0}>
      <PopularityCell popularity={popularity} />
    </TooltipProvider>
  );
}

describe('PopularityCell certificate', () => {
  it('draws the score as a bar and names it for assistive tech', async () => {
    const { container } = renderCell(72.4);

    const button = screen.getByRole('button', {
      name: 'Spotify popularity 72 out of 100',
    });
    const fill = button.querySelector('div > div');
    expect(fill).toHaveStyle({ width: '72.4%' });
    await expectNoA11yViolations(container);
  });

  it('shows the exact score in a tooltip on keyboard focus', async () => {
    const user = userEvent.setup();
    renderCell(72);

    await user.tab();
    expect(
      screen.getByRole('button', { name: 'Spotify popularity 72 out of 100' })
    ).toHaveFocus();
    expect(await screen.findByRole('tooltip')).toHaveTextContent(
      '72/100 popularity'
    );
  });

  it.each([
    [250, 100],
    [-20, 0],
  ])('clamps %s to %s', async (value, clamped) => {
    const { container } = renderCell(value);

    const button = screen.getByRole('button', {
      name: `Spotify popularity ${clamped} out of 100`,
    });
    expect(button.querySelector('div > div')).toHaveStyle({
      width: `${clamped}%`,
    });
    await expectNoA11yViolations(container);
  });

  it.each([null, undefined, Number.NaN])(
    'falls back to a dash for %s',
    async value => {
      const { container } = renderCell(value);

      expect(screen.getByText('—')).toBeInTheDocument();
      expect(screen.queryByRole('button')).toBeNull();
      await expectNoA11yViolations(container);
    }
  );
});
