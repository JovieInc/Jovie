import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { expect, it } from 'vitest';
import {
  HeaderActionsProvider,
  useHeaderActions,
} from '@/contexts/HeaderActionsContext';
import { HeaderSearchSurfaceFromContext } from './HeaderSearchSurfaceFromContext';

function Probe() {
  const { isCommandPaletteOpen } = useHeaderActions();
  return <output>{isCommandPaletteOpen ? 'Open' : 'Closed'}</output>;
}
it('opens and closes the existing shared search from the compact icon by keyboard', async () => {
  render(
    <HeaderActionsProvider>
      <div data-app-shell-sidebar-mount='true'>
        <HeaderSearchSurfaceFromContext compact />
        <button type='button'>Other destination</button>
      </div>
      <Probe />
    </HeaderActionsProvider>
  );
  await userEvent.tab();
  expect(screen.getByRole('button', { name: 'Search Jovie' })).toHaveFocus();
  await userEvent.keyboard('{Enter}');
  expect(screen.getByRole('status')).toHaveTextContent('Open');
  await userEvent.keyboard('{Enter}');
  expect(screen.getByRole('status')).toHaveTextContent('Closed');
  expect(screen.queryByText('Search', { exact: true })).not.toBeInTheDocument();
  await userEvent.keyboard('{Enter}');
  expect(screen.getByRole('status')).toHaveTextContent('Open');
  await userEvent.click(
    screen.getByRole('button', { name: 'Other destination' })
  );
  expect(screen.getByRole('status')).toHaveTextContent('Closed');
});
