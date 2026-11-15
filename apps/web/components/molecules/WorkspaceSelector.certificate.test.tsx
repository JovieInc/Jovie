import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { expectNoA11yViolations } from '@/tests/utils/a11y';
import { WorkspaceSelector } from './WorkspaceSelector';

const workspaces = [
  { id: 'customer', label: 'Jovie', href: '/app', brandVariant: 'jovie' },
  { id: 'ov', label: 'OV', href: '/app/ov', brandVariant: 'ov' },
] as const;

describe('WorkspaceSelector certificate', () => {
  it('opens the workspace menu from the trigger', async () => {
    const user = userEvent.setup();
    const { container } = render(
      <WorkspaceSelector
        currentWorkspaceId='customer'
        workspaces={workspaces}
      />
    );
    const trigger = screen.getByRole('button', {
      name: 'Switch Workspace: Jovie',
    });
    await expectNoA11yViolations(container);

    await user.click(trigger);

    const current = await screen.findByRole('menuitem', { name: 'Jovie' });
    expect(current).toHaveAttribute('aria-current', 'page');
    expect(screen.getByRole('menuitem', { name: 'OV' })).toHaveAttribute(
      'href',
      '/app/ov'
    );
  });

  it('renders nothing without workspaces', () => {
    const { container } = render(
      <WorkspaceSelector currentWorkspaceId='customer' workspaces={[]} />
    );
    expect(container).toBeEmptyDOMElement();
  });

  it('renders a long RTL workspace name without violations', async () => {
    const { container } = render(
      <div dir='rtl' lang='ar'>
        <WorkspaceSelector
          currentWorkspaceId='customer'
          workspaces={[
            {
              id: 'customer',
              label: 'جوفي للتسجيلات والنشر الموسيقي',
              href: '/app',
              brandVariant: 'jovie',
            },
          ]}
        />
      </div>
    );
    expect(
      screen.getByRole('button', {
        name: 'Switch Workspace: جوفي للتسجيلات والنشر الموسيقي',
      })
    ).toBeInTheDocument();
    await expectNoA11yViolations(container);
  });
});
