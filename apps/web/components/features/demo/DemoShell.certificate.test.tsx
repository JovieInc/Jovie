import { TooltipProvider } from '@jovie/ui';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ComponentProps } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { expectNoA11yViolations } from '@/tests/utils/a11y';
import { DemoShell } from './DemoShell';

function renderShell(props: Partial<ComponentProps<typeof DemoShell>> = {}) {
  const onTabChange = vi.fn();
  const view = render(
    <TooltipProvider>
      <DemoShell activeTab='inbox' onTabChange={onTabChange} {...props}>
        {'children' in props ? props.children : <p>Demo content</p>}
      </DemoShell>
    </TooltipProvider>
  );
  return { ...view, onTabChange };
}

describe('DemoShell certificate', () => {
  it('reports each sidebar tab to onTabChange', async () => {
    const user = userEvent.setup();
    const { onTabChange } = renderShell();

    await user.click(screen.getByRole('button', { name: /My Releases/ }));
    await user.click(screen.getByRole('button', { name: /Campaigns/ }));
    // Sub-items render as menu-sub buttons without a button role.
    await user.click(screen.getByText('Audience'));
    expect(onTabChange.mock.calls.map(([tab]) => tab)).toEqual([
      'my-releases',
      'campaigns',
      'audience',
    ]);
  });

  it('renders the shell with content axe-clean and names the active tab', async () => {
    const { container } = renderShell({ activeTab: 'releases' });

    expect(screen.getByText('Demo content')).toBeInTheDocument();
    expect(
      screen.getByRole('link', { name: 'Sign up for Jovie' })
    ).toHaveAttribute('href', '/start');
    expect(screen.getAllByText('Releases').length).toBeGreaterThan(1);
    await expectNoA11yViolations(container);
  });

  it('opens with the details panel and toggles it closed', async () => {
    const user = userEvent.setup();
    const { container } = renderShell({
      rightPanel: <p>Release details</p>,
    });

    expect(screen.getByText('Release details')).toBeInTheDocument();
    await user.click(
      screen.getByRole('button', { name: 'Hide details panel' })
    );
    expect(screen.queryByText('Release details')).toBeNull();
    expect(
      screen.getByRole('button', { name: 'Show details panel' })
    ).toBeInTheDocument();
    await expectNoA11yViolations(container);
  });

  it('stays axe-clean with an empty main area', async () => {
    const { container } = renderShell({ children: null });

    expect(screen.queryByText('Demo content')).toBeNull();
    await expectNoA11yViolations(container);
  });

  it('keeps long right-to-left content whole', async () => {
    const long =
      'Every release in the catalog with its stores, links, artwork and campaign status across several lines.';
    const { container } = render(
      <div dir='rtl'>
        <TooltipProvider>
          <DemoShell activeTab='catalog' onTabChange={vi.fn()}>
            <p>{long}</p>
          </DemoShell>
        </TooltipProvider>
      </div>
    );

    expect(screen.getByText(long)).toBeInTheDocument();
    await expectNoA11yViolations(container);
  });
});
