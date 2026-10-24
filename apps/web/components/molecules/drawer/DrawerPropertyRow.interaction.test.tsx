import { HoverReveal } from '@jovie/ui';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { expect, it, vi } from 'vitest';
import { DrawerPropertyRow } from './DrawerPropertyRow';

it('owns hover reveal across label and value while keeping the action keyboard reachable', async () => {
  const user = userEvent.setup();
  const onCopy = vi.fn();
  render(
    <DrawerPropertyRow
      label='ISRC'
      value={
        <HoverReveal asChild>
          <button type='button' onClick={onCopy}>
            Copy ISRC
          </button>
        </HoverReveal>
      }
    />
  );
  const label = screen.getByText('ISRC');
  const action = screen.getByRole('button', { name: 'Copy ISRC' });
  expect(label.parentElement).toHaveClass('group');
  expect(label.parentElement).toContainElement(action);
  expect(action).toHaveClass(
    'group-hover:opacity-100',
    'group-focus-within:opacity-100'
  );
  await user.hover(label);
  await user.tab();
  expect(action).toHaveFocus();
  await user.unhover(label);
  expect(action).toHaveFocus();
  await user.keyboard('{Enter}');
  expect(onCopy).toHaveBeenCalledOnce();
});
