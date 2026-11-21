import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import {
  availableUpdate,
  downloadingUpdate,
} from '@/lib/desktop/desktop-updates.test-utils';
import { expectNoA11yViolations } from '@/tests/utils/a11y';
import { DesktopUpdateModalView } from './DesktopUpdateModal';

function renderView(
  state: Parameters<typeof DesktopUpdateModalView>[0]['state'],
  overrides: Partial<Parameters<typeof DesktopUpdateModalView>[0]> = {}
) {
  const props = {
    open: true,
    state,
    notes: null,
    loading: false,
    onDownload: vi.fn(),
    onInstall: vi.fn(),
    onRetry: vi.fn(),
    onLater: vi.fn(),
    ...overrides,
  };
  render(<DesktopUpdateModalView {...props} />);
  return props;
}

describe('DesktopUpdateModalView certificate', () => {
  it('has no axe violations with notes, focuses the primary action and starts the download', async () => {
    const user = userEvent.setup();
    const props = renderView(availableUpdate('26.9.16'), {
      notes: { summary: 'Calmer sidebar.', items: ['New audio dock'] },
    });
    const download = screen.getByRole('button', { name: 'Download' });
    expect(download).toHaveFocus();
    expect(screen.getByText("What's New")).not.toHaveClass('uppercase');
    await expectNoA11yViolations(document.body);
    await user.click(download);
    expect(props.onDownload).toHaveBeenCalledTimes(1);
  });

  it('has no axe violations while release notes load', async () => {
    renderView(availableUpdate('26.9.16'), { loading: true });
    await expectNoA11yViolations(document.body);
  });

  it('has no axe violations while downloading and hides via the focused action', async () => {
    const user = userEvent.setup();
    const props = renderView(downloadingUpdate(), { version: '26.9.16' });
    const hide = screen.getAllByRole('button')[0];
    expect(hide).toHaveFocus();
    await expectNoA11yViolations(document.body);
    await user.click(hide);
    expect(props.onLater).toHaveBeenCalledTimes(1);
  });
});
