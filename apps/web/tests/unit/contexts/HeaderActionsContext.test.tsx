import { fireEvent, render, screen } from '@testing-library/react';
import { type ReactNode, useState } from 'react';
import { describe, expect, it } from 'vitest';
import {
  HeaderActionsProvider,
  useOptionalHeaderActions,
  useRegisterHeaderActions,
} from '@/contexts/HeaderActionsContext';

function HeaderActionsProbe() {
  const state = useOptionalHeaderActions();

  return <div data-testid='header-actions-probe'>{state?.headerActions}</div>;
}

function RouteActionRegistration({
  children,
}: {
  readonly children: ReactNode;
}) {
  useRegisterHeaderActions(children);
  return null;
}

function ToggleRouteActions() {
  const [expanded, setExpanded] = useState(false);

  return (
    <>
      <button type='button' onClick={() => setExpanded(value => !value)}>
        Toggle
      </button>
      <RouteActionRegistration>
        <button type='button'>
          {expanded ? 'Expanded Action' : 'Base Action'}
        </button>
      </RouteActionRegistration>
    </>
  );
}

describe('HeaderActionsContext', () => {
  it('registers and clears route-owned header actions', () => {
    const view = render(
      <HeaderActionsProvider>
        <RouteActionRegistration>
          <button type='button'>New Task</button>
        </RouteActionRegistration>
        <HeaderActionsProbe />
      </HeaderActionsProvider>
    );

    expect(screen.getByRole('button', { name: 'New Task' })).toBeDefined();

    view.rerender(
      <HeaderActionsProvider>
        <HeaderActionsProbe />
      </HeaderActionsProvider>
    );

    expect(screen.queryByRole('button', { name: 'New Task' })).toBeNull();
  });

  it('updates the registered actions when route state changes', () => {
    render(
      <HeaderActionsProvider>
        <ToggleRouteActions />
        <HeaderActionsProbe />
      </HeaderActionsProvider>
    );

    expect(screen.getByRole('button', { name: 'Base Action' })).toBeDefined();

    fireEvent.click(screen.getByRole('button', { name: 'Toggle' }));

    expect(
      screen.getByRole('button', { name: 'Expanded Action' })
    ).toBeDefined();
    expect(screen.queryByRole('button', { name: 'Base Action' })).toBeNull();
  });
});
