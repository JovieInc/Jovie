import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { expectNoA11yViolations } from '@/tests/utils/a11y';
import { PayLanding } from './PayLanding';

vi.mock('@/features/home/claim-handle', () => ({
  ClaimHandleForm: () => (
    <form>
      <label>
        Choose your handle
        <input name='handle' type='text' />
      </label>
      <button type='submit'>Claim</button>
    </form>
  ),
}));

describe('PayLanding', () => {
  it('renders the hero, the how-it-works steps and the final claim', async () => {
    const { container } = render(<PayLanding />);

    expect(
      screen.getByRole('heading', {
        level: 1,
        name: 'Turn every payment into a follower.',
      })
    ).toBeInTheDocument();
    expect(
      screen.getByRole('heading', {
        name: 'Start turning payments into followers.',
      })
    ).toBeInTheDocument();
    expect(
      screen.getAllByRole('textbox', { name: 'Choose your handle' })
    ).toHaveLength(2);
    expect(screen.getAllByRole('button', { name: 'Claim' })).toHaveLength(2);
    expect(screen.getByRole('img')).toHaveAttribute('alt');
    await expectNoA11yViolations(container);
  });

  it('keeps typed handle text in the final claim form', async () => {
    const user = userEvent.setup();
    render(<PayLanding />);

    const finalSection = screen
      .getByRole('heading', { name: 'Start turning payments into followers.' })
      .closest('section') as HTMLElement;
    const input = within(finalSection).getByRole('textbox', {
      name: 'Choose your handle',
    });

    await user.type(input, 'tim');
    expect(input).toHaveValue('tim');
  });

  it('stays axe-clean in a right-to-left document', async () => {
    const { container } = render(
      <div dir='rtl' lang='ar'>
        <PayLanding />
      </div>
    );

    expect(container.firstElementChild).toHaveAttribute('dir', 'rtl');
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent(
      'Turn every payment into a follower.'
    );
    await expectNoA11yViolations(container);
  });
});
