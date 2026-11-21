import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ArrowRight } from 'lucide-react';
import { describe, expect, it, vi } from 'vitest';
import { expectNoA11yViolations } from '@/tests/utils/a11y';
import { DrawerActionRow } from './DrawerActionRow';

describe('DrawerActionRow', () => {
  it('renders a named action with optional trailing content and handles activation', async () => {
    const user = userEvent.setup();
    const onClick = vi.fn();

    const { container, rerender } = render(
      <DrawerActionRow
        label='Open public profile'
        onClick={onClick}
        icon={<span aria-hidden='true'>Icon</span>}
        trailing={<ArrowRight aria-hidden='true' />}
      />
    );

    const action = screen.getByRole('button', { name: 'Open public profile' });
    expect(action).toHaveAttribute('data-slot', 'plain-button');
    expect(action).toHaveAttribute('type', 'button');
    expect(action).toHaveTextContent('Open public profile');
    expect(action.querySelector('[aria-hidden="true"]')).not.toBeNull();

    await expectNoA11yViolations(container);
    await user.click(action);
    expect(onClick).toHaveBeenCalledOnce();

    rerender(<DrawerActionRow label='View release notes' />);
    expect(
      screen.getByRole('button', { name: 'View release notes' })
    ).toHaveTextContent('View release notes');
    await expectNoA11yViolations(container);
  });

  it('keeps long right-to-left labels accessible', async () => {
    const label = 'افتح الملف الشخصي وراجع تفاصيل الإصدار المتاحة';
    const { container } = render(
      <div dir='rtl' lang='ar'>
        <DrawerActionRow label={label} />
      </div>
    );
    expect(screen.getByRole('button', { name: label })).toHaveTextContent(
      label
    );
    await expectNoA11yViolations(container);
  });
});
