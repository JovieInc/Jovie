import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import * as React from 'react';
import { describe, expect, it, vi } from 'vitest';
import { expectNoA11yViolations } from '../test-utils/a11y';

import { TitleMenuTrigger } from './title-menu-trigger';

describe('TitleMenuTrigger', () => {
  it('renders a button named by its title, with a safe default type', () => {
    render(<TitleMenuTrigger label='Tour Budget' />);
    const trigger = screen.getByRole('button', { name: 'Tour Budget' });
    expect(trigger).toHaveAttribute('type', 'button');
  });

  it('truncates a long title inside its header and keeps the focus ring inset', () => {
    render(<TitleMenuTrigger label={'Tour Budget '.repeat(20)} />);
    const trigger = screen.getByRole('button');
    expect(trigger.className).toContain('max-w-full');
    expect(trigger.className).toContain('focus-visible:ring-inset');
    expect(trigger.className).not.toMatch(/(^|\s)-m[xl]-/);
    expect(
      trigger.querySelector('[data-slot="title-menu-label"]')?.className
    ).toContain('truncate');
  });

  it('forwards its ref and spreads props for Radix asChild triggers', async () => {
    const ref = React.createRef<HTMLButtonElement>();
    const onClick = vi.fn();
    render(
      <TitleMenuTrigger
        ref={ref}
        label='Chats'
        aria-expanded='true'
        aria-haspopup='menu'
        data-state='open'
        onClick={onClick}
      />
    );
    const trigger = screen.getByRole('button', { name: 'Chats' });
    expect(ref.current).toBe(trigger);
    expect(trigger).toHaveAttribute('aria-expanded', 'true');
    expect(trigger).toHaveAttribute('data-state', 'open');
    await userEvent.click(trigger);
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it('hides the chevron from assistive tech', () => {
    const { container } = render(<TitleMenuTrigger label='Chats' />);
    expect(container.querySelector('svg')).toHaveAttribute(
      'aria-hidden',
      'true'
    );
  });

  it('has no axe violations closed, open and right to left', async () => {
    const { container } = render(
      <div>
        <TitleMenuTrigger label='Chats' />
        <TitleMenuTrigger label='Open' aria-expanded='true' />
        <div dir='rtl' lang='ar'>
          <TitleMenuTrigger label='خطة إصدار الربيع' />
        </div>
      </div>
    );
    await expectNoA11yViolations(container);
  });
});
