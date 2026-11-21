import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { expectNoA11yViolations } from '@/tests/utils/a11y';
import { WikiSearchForm } from './WikiSearchForm';

describe('WikiSearchForm', () => {
  it('submits a GET search to the wiki and stays axe-clean', async () => {
    const { container } = render(<WikiSearchForm />);
    const input = screen.getByRole('searchbox', { name: 'Search wiki' });
    expect(input).toHaveAttribute('name', 'q');
    expect(input).toHaveValue('');
    expect(input.closest('form')).toHaveAttribute('action', '/hud/wiki');
    expect(input.closest('form')).toHaveAttribute('method', 'GET');
    expect(input).not.toHaveClass('border-gray-300');
    await expectNoA11yViolations(container);
  });

  it('keeps typed text and focus across a rerender and blur', async () => {
    const user = userEvent.setup();
    const { rerender } = render(<WikiSearchForm initialQuery='runbook' />);
    const input = screen.getByRole('searchbox', { name: 'Search wiki' });
    expect(input).toHaveValue('runbook');
    await user.type(input, ' deploy');
    rerender(<WikiSearchForm initialQuery='runbook' />);
    expect(screen.getByRole('searchbox')).toHaveValue('runbook deploy');
    expect(screen.getByRole('searchbox')).toHaveFocus();
    await user.tab();
    expect(screen.getByRole('searchbox')).toHaveValue('runbook deploy');
  });

  it('renders a right-to-left query axe-clean', async () => {
    const { container } = render(<WikiSearchForm initialQuery='دليل النشر' />);
    expect(screen.getByRole('searchbox')).toHaveValue('دليل النشر');
    await expectNoA11yViolations(container);
  });
});
