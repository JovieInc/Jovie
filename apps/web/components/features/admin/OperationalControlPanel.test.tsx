import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { expectNoA11yViolations } from '@/tests/utils/a11y';
import { OperationalControlPanel } from './OperationalControlPanel';

const originalLocation = globalThis.location;
const reload = vi.fn();

function clearCookie() {
  document.cookie = '__dev_toolbar=; path=/; max-age=0';
}

describe('OperationalControlPanel certificate', () => {
  beforeEach(() => {
    Object.defineProperty(globalThis, 'location', {
      configurable: true,
      value: { ...originalLocation, reload },
    });
    clearCookie();
  });

  afterEach(() => {
    Object.defineProperty(globalThis, 'location', {
      configurable: true,
      value: originalLocation,
    });
    clearCookie();
    reload.mockReset();
  });

  it('starts off without the cookie and turns the dev toolbar on', async () => {
    const user = userEvent.setup();
    const { container } = render(<OperationalControlPanel />);

    const toggle = screen.getByRole('switch', { name: 'Dev toolbar' });
    expect(toggle).not.toBeChecked();
    await expectNoA11yViolations(container);

    await user.click(toggle);
    expect(document.cookie).toContain('__dev_toolbar=1');
    expect(toggle).toBeChecked();
    expect(reload).toHaveBeenCalledOnce();
  });

  it('reads an existing cookie and turns the dev toolbar off', async () => {
    const user = userEvent.setup();
    document.cookie = '__dev_toolbar=1; path=/';
    const { container } = render(<OperationalControlPanel />);

    const toggle = screen.getByRole('switch', { name: 'Dev toolbar' });
    expect(toggle).toBeChecked();
    await expectNoA11yViolations(container);

    await user.click(toggle);
    expect(document.cookie).not.toContain('__dev_toolbar=1');
    expect(toggle).not.toBeChecked();
    expect(reload).toHaveBeenCalledOnce();
  });

  it('stays axe-clean inside an RTL document', async () => {
    const { container } = render(
      <div dir='rtl' lang='ar'>
        <OperationalControlPanel />
      </div>
    );
    expect(screen.getByText('Operational controls')).toBeInTheDocument();
    await expectNoA11yViolations(container);
  });
});
