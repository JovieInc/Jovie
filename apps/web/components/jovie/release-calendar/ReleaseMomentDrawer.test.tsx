import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { expectNoA11yViolations } from '@/tests/utils/a11y';
import { ReleaseMomentDrawer } from './ReleaseMomentDrawer';

const moment = {
  slug: 'single-1',
  title: 'Midnight Drive',
  momentType: 'single',
  friday: '2026-12-04',
} as const;

describe('ReleaseMomentDrawer', () => {
  it('renders nothing while no moment is selected', () => {
    render(<ReleaseMomentDrawer moment={null} onClose={vi.fn()} />);

    expect(
      screen.queryByTestId('release-moment-drawer')
    ).not.toBeInTheDocument();
  });

  it('shows the moment, its workflow and the fan notification', async () => {
    render(<ReleaseMomentDrawer moment={moment} onClose={vi.fn()} />);

    const drawer = await screen.findByTestId('release-moment-drawer');
    expect(drawer).toHaveTextContent('Midnight Drive');
    expect(screen.getByText('Single')).toBeInTheDocument();
    expect(screen.getByText('Workflow')).toBeInTheDocument();
    expect(screen.getByTestId('fan-notification-preview')).toHaveTextContent(
      'Email'
    );
    expect(drawer.querySelector('.uppercase')).toBeNull();
    await expectNoA11yViolations(drawer);
  });

  it('closes from the close button', async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    render(<ReleaseMomentDrawer moment={moment} onClose={onClose} />);

    await user.click(await screen.findByTestId('release-moment-drawer-close'));

    expect(onClose).toHaveBeenCalled();
  });
});
