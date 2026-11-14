import { TooltipProvider } from '@jovie/ui';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Download, Settings2 } from 'lucide-react';
import type { ReactNode } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { expectNoA11yViolations } from '@/tests/utils/a11y';
import { ActionBar, ActionBarButton, ActionBarItem } from './ActionBar';

function bar(children: ReactNode, dir?: 'rtl') {
  return (
    <TooltipProvider>
      <div dir={dir} lang={dir === 'rtl' ? 'ar' : 'en'}>
        <ActionBar className='justify-end'>{children}</ActionBar>
      </div>
    </TooltipProvider>
  );
}

describe('ActionBar', () => {
  it('runs a button action on click and names it by its label', async () => {
    const user = userEvent.setup();
    const onClick = vi.fn();
    render(
      bar(
        <ActionBarButton
          label='Export'
          icon={<Download aria-hidden='true' />}
          onClick={onClick}
        />
      )
    );

    await user.click(screen.getByRole('button', { name: 'Export' }));
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it('runs a button action from the keyboard', async () => {
    const user = userEvent.setup();
    const onClick = vi.fn();
    render(
      bar(
        <ActionBarItem tooltipLabel='Display options' shortcut='V'>
          <ActionBarButton
            label='Display'
            icon={<Settings2 aria-hidden='true' />}
            onClick={onClick}
          />
        </ActionBarItem>
      )
    );

    await user.tab();
    expect(screen.getByRole('button', { name: 'Display' })).toHaveFocus();
    await user.keyboard('{Enter}');
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it('keeps the shared toolbar gap and caller classes on the bar', () => {
    const { container } = render(bar(<span>Actions</span>));

    const actionBar = container.querySelector('[lang] > div');
    expect(actionBar).toHaveClass(
      'gap-(--app-shell-toolbar-gap)',
      'justify-end'
    );
  });

  it.each([
    [
      'with shortcuts',
      bar(
        <ActionBarItem tooltipLabel='Display options' shortcut='V'>
          <ActionBarButton
            label='Display'
            icon={<Settings2 aria-hidden='true' />}
          />
        </ActionBarItem>
      ),
    ],
    [
      'without shortcuts',
      bar(
        <ActionBarButton
          label='Export'
          icon={<Download aria-hidden='true' />}
          mobileIconOnly
        />
      ),
    ],
    [
      'long labels',
      bar(
        <ActionBarButton
          label='Export Every Visible Column As A CSV File'
          icon={<Download aria-hidden='true' />}
        />
      ),
    ],
    [
      'rtl',
      bar(
        <ActionBarItem tooltipLabel='خيارات العرض'>
          <ActionBarButton
            label='العرض'
            icon={<Settings2 aria-hidden='true' />}
          />
        </ActionBarItem>,
        'rtl'
      ),
    ],
  ])('has no accessibility violations %s', async (_name, ui) => {
    const { container } = render(ui);
    await expectNoA11yViolations(container);
  });
});
