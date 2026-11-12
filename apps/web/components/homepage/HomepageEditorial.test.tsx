import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { expect, it } from 'vitest';
import { expectNoA11yViolations } from '@/tests/utils/a11y';
import { HomepageInviteClose } from './HomepageEditorial';

it('keeps the handle and focus through a parent update, Escape, and blur', async () => {
  const user = userEvent.setup();
  const { container, rerender } = render(<HomepageInviteClose />);
  const input = screen.getByRole('textbox', { name: 'Your handle' });
  await user.type(input, 'myhandle');
  rerender(
    <HomepageInviteClose
      copy={{ headline: 'Claim your handle.', subhead: 'Your page is ready.' }}
    />
  );
  expect(input).toHaveValue('myhandle');
  expect(input).toHaveFocus();
  await user.keyboard('{Escape}');
  expect(input).toHaveValue('myhandle');
  expect(input).toHaveFocus();
  await user.tab();
  expect(input).toHaveValue('myhandle');
  expect(
    screen.getByRole('button', { name: 'Claim your handle' })
  ).toHaveFocus();
  const form = container.querySelector('form');
  expect(form).toHaveAttribute('action', '/start');
  expect(form).toHaveAttribute('method', 'get');
  expect(new FormData(form ?? undefined).get('handle')).toBe('myhandle');
  await expectNoA11yViolations(container);
});
