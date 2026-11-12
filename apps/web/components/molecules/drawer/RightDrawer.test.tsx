import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { expectNoA11yViolations } from '@/tests/utils/a11y';
import { RightDrawer } from './RightDrawer';

// The full focus, Escape and motion suite lives in
// tests/components/organisms/RightDrawer.interaction.test.tsx.
const mockUseBreakpointDown = vi.fn();
vi.mock('@/hooks/useBreakpoint', () => ({
  useBreakpointDown: (...args: unknown[]) => mockUseBreakpointDown(...args),
}));

function Rails({
  firstOpen,
  secondOpen,
}: {
  readonly firstOpen: boolean;
  readonly secondOpen: boolean;
}) {
  return (
    <>
      <RightDrawer isOpen={firstOpen} width={320} ariaLabel='First rail'>
        <button type='button'>First rail action</button>
      </RightDrawer>
      <RightDrawer isOpen={secondOpen} width={320} ariaLabel='Second rail'>
        <button type='button'>Second rail action</button>
      </RightDrawer>
    </>
  );
}

describe('RightDrawer', () => {
  beforeEach(() => {
    mockUseBreakpointDown.mockReset();
    mockUseBreakpointDown.mockReturnValue(false);
  });

  it('hands Escape to its keyboard handler while open', async () => {
    const onKeyDown = vi.fn();
    render(
      <RightDrawer
        isOpen
        width={360}
        ariaLabel='Release details'
        onKeyDown={onKeyDown}
      >
        <button type='button'>Edit release</button>
      </RightDrawer>
    );

    fireEvent.keyDown(document, { key: 'Escape' });

    expect(onKeyDown).toHaveBeenCalledTimes(1);
    expect(onKeyDown.mock.calls[0][0]).toMatchObject({ key: 'Escape' });
    await expectNoA11yViolations(
      screen.getByRole('complementary', { name: 'Release details' })
    );
  });

  it('ignores Escape once closed', async () => {
    const onKeyDown = vi.fn();
    const { container } = render(
      <RightDrawer
        isOpen={false}
        width={360}
        ariaLabel='Release details'
        onKeyDown={onKeyDown}
      >
        <button type='button'>Edit release</button>
      </RightDrawer>
    );

    fireEvent.keyDown(document, { key: 'Escape' });

    expect(onKeyDown).not.toHaveBeenCalled();
    await expectNoA11yViolations(container);
  });

  it('becomes the active mobile rail again when it is reopened', async () => {
    mockUseBreakpointDown.mockReturnValue(true);
    const view = render(<Rails firstOpen secondOpen />);
    const first = screen.getByLabelText('First rail');
    const second = screen.getByLabelText('Second rail');

    await waitFor(() => expect(first).toHaveAttribute('aria-hidden', 'true'));
    expect(second).toHaveAttribute('aria-modal', 'true');

    // Closing clears the stale supersession, and reopening claims focus
    // ownership back from the other rail.
    view.rerender(<Rails firstOpen={false} secondOpen />);
    view.rerender(<Rails firstOpen secondOpen />);

    await waitFor(() => expect(first).toHaveAttribute('aria-modal', 'true'));
    expect(first.inert).toBeFalsy();
    expect(second).toHaveAttribute('aria-hidden', 'true');
    expect(second.inert).toBe(true);
    await expectNoA11yViolations(first);
  });

  it('leaves the last rail active when two open rails become mobile together', async () => {
    // Both rails are open on desktop, then the viewport drops below lg in one
    // render. Both start presenting in the same commit and announce
    // themselves; the later announcement must win instead of each rail
    // superseding the other and both going inert.
    const view = render(<Rails firstOpen secondOpen />);
    mockUseBreakpointDown.mockReturnValue(true);
    view.rerender(<Rails firstOpen secondOpen />);

    const first = screen.getByLabelText('First rail');
    const second = screen.getByLabelText('Second rail');
    await waitFor(() => expect(second).toHaveAttribute('aria-modal', 'true'));
    expect(second.inert).toBeFalsy();
    expect(first).toHaveAttribute('aria-hidden', 'true');
    expect(first.inert).toBe(true);
    await expectNoA11yViolations(second);
  });
});
