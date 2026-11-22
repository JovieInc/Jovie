import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { expectNoA11yViolations } from '@/tests/utils/a11y';
import { SidebarLinkInput } from './SidebarLinkInput';

describe('SidebarLinkInput', () => {
  beforeEach(() => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
  });

  afterEach(async () => {
    // The field schedules blur timers (autosuggest close, empty cancel); flush
    // them before teardown so none fires after the DOM is gone.
    cleanup();
    await vi.advanceTimersByTimeAsync(300);
    vi.useRealTimers();
  });

  it('renders the link URL input', () => {
    render(
      <SidebarLinkInput
        categoryFilter='social'
        existingPlatforms={[]}
        onAdd={vi.fn()}
        onCancel={vi.fn()}
      />
    );

    expect(screen.getByRole('textbox')).toBeInTheDocument();
  });

  it('calls onCancel when Escape is pressed with the autosuggest closed', async () => {
    const user = userEvent.setup();
    const onCancel = vi.fn();

    render(
      <SidebarLinkInput
        categoryFilter='social'
        existingPlatforms={[]}
        onAdd={vi.fn()}
        onCancel={onCancel}
      />
    );

    const input = screen.getByRole('textbox');
    input.focus();
    await user.keyboard('{Escape}');

    expect(onCancel).toHaveBeenCalledTimes(1);
  });

  it('focuses the field on open and keeps typed text and focus across a rerender', async () => {
    const user = userEvent.setup();
    const props = {
      categoryFilter: 'social' as const,
      existingPlatforms: [],
      onAdd: vi.fn(),
      onCancel: vi.fn(),
    };
    const { container, rerender } = render(<SidebarLinkInput {...props} />);
    const input = screen.getByRole('textbox', { name: 'Add Link' });
    expect(input).toHaveFocus();

    await user.type(
      input,
      'https://instagram.com/an-extremely-long-handle-that-keeps-on-going'
    );
    rerender(<SidebarLinkInput {...props} />);

    expect(input).toHaveValue(
      'https://instagram.com/an-extremely-long-handle-that-keeps-on-going'
    );
    expect(input).toHaveFocus();
    await expectNoA11yViolations(container);
  });

  it('adds the detected link from the Add row', async () => {
    const user = userEvent.setup();
    const onAdd = vi.fn();
    render(
      <SidebarLinkInput
        categoryFilter='social'
        existingPlatforms={[]}
        onAdd={onAdd}
        onCancel={vi.fn()}
      />
    );

    await user.type(
      screen.getByRole('textbox', { name: 'Add Link' }),
      'https://instagram.com/demo'
    );
    await user.click(
      screen.getByRole('button', { name: /instagram\.com\/demo/ })
    );

    expect(onAdd).toHaveBeenCalledOnce();
  });

  it('renders in a right-to-left container without a11y violations', async () => {
    const { container } = render(
      <div dir='rtl'>
        <SidebarLinkInput
          categoryFilter='social'
          existingPlatforms={[]}
          onAdd={vi.fn()}
          onCancel={vi.fn()}
        />
      </div>
    );
    await expectNoA11yViolations(container);
  });
});
