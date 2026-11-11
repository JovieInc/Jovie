import { render } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { expectNoA11yViolations } from '@/tests/utils/a11y';
import { ThemeToggleSkeleton } from './ThemeToggleSkeleton';

describe('ThemeToggleSkeleton', () => {
  it('reserves the icon control geometry while theme state hydrates', async () => {
    const { container, getByRole, getByText } = render(
      <ThemeToggleSkeleton appearance='icon' />
    );

    expect(getByRole('button')).toBeDisabled();
    expect(getByText('Loading theme toggle')).toBeInTheDocument();
    await expectNoA11yViolations(container);
  });

  it('cannot be activated or focused before the live toggle hydrates', async () => {
    const user = userEvent.setup();
    const { getByRole } = render(
      <>
        <ThemeToggleSkeleton appearance='icon' />
        <button type='button'>Next control</button>
      </>
    );
    const placeholder = getByRole('button', { name: 'Loading theme toggle' });

    await user.click(placeholder);
    expect(placeholder).not.toHaveFocus();
    await user.tab();
    expect(getByRole('button', { name: 'Next control' })).toHaveFocus();
  });

  it('reserves all three segments for segmented hydration', async () => {
    const user = userEvent.setup();
    const { container, getByRole } = render(
      <ThemeToggleSkeleton appearance='segmented' />
    );
    const toolbar = getByRole('toolbar', { name: 'Theme' });

    expect(toolbar.children).toHaveLength(3);
    expect(toolbar).toHaveClass('border-subtle', 'bg-surface-2');
    await user.tab();
    expect(document.body).toHaveFocus();
    await expectNoA11yViolations(container);
  });

  it('reserves the footer root target and visible segment geometry', async () => {
    const { container, getByRole } = render(
      <ThemeToggleSkeleton appearance='segmented' size='footer' />
    );
    const toolbar = getByRole('toolbar', { name: 'Theme' });

    expect(toolbar).toHaveClass('h-11', 'px-0', 'py-2');
    expect(toolbar.children[0]).toHaveClass('h-7', 'w-11', 'px-3');
    await expectNoA11yViolations(container);
  });

  it('keeps the same three segments in a right-to-left row', async () => {
    const { container, getByRole } = render(
      <div dir='rtl'>
        <ThemeToggleSkeleton appearance='segmented' size='footer' />
      </div>
    );

    expect(getByRole('toolbar', { name: 'Theme' }).children).toHaveLength(3);
    await expectNoA11yViolations(container);
  });
});
