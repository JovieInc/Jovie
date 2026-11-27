import { TooltipProvider } from '@jovie/ui';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { expectNoA11yViolations } from '@/tests/utils/a11y';
import { PopularityIcon } from './PopularityIcon';

function renderIcon(popularity: number | null | undefined) {
  return render(
    <TooltipProvider>
      <PopularityIcon popularity={popularity} />
    </TooltipProvider>
  );
}

describe('PopularityIcon certificate', () => {
  it.each([10, 50, 90])('keeps the %i score axe-clean', async score => {
    const { container } = renderIcon(score);
    expect(
      screen.getByRole('button', { name: `Popularity ${score} out of 100` })
    ).toBeVisible();
    await expectNoA11yViolations(container);
  });

  it('shows a dash with no button when there is no score', async () => {
    const { container } = renderIcon(null);
    expect(screen.getByText('—')).toBeInTheDocument();
    expect(screen.queryByRole('button')).toBeNull();
    await expectNoA11yViolations(container);
  });

  it('clamps an out-of-range score and shows it on hover', async () => {
    const user = userEvent.setup();
    renderIcon(4200);

    const control = screen.getByRole('button', {
      name: 'Popularity 100 out of 100',
    });
    await user.hover(control);
    expect(await screen.findAllByText('/100 popularity')).not.toHaveLength(0);
  });
});
