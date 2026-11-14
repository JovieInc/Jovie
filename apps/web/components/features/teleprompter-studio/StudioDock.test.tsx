import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { expectNoA11yViolations } from '@/tests/utils/a11y';
import { StudioDock } from './StudioDock';

function renderDock(overrides: Partial<Parameters<typeof StudioDock>[0]> = {}) {
  const props = {
    visible: true,
    isRecording: false,
    canRecord: true,
    between: false,
    followMode: 'voice' as const,
    grid: false,
    peek: false,
    lightOpen: false,
    takesOpen: false,
    takeCount: 0,
    onSpeed: vi.fn(),
    onToggleGrid: vi.fn(),
    onTogglePeek: vi.fn(),
    onToggleRecording: vi.fn(),
    onToggleLight: vi.fn(),
    onToggleVoice: vi.fn(),
    onToggleTakes: vi.fn(),
    ...overrides,
  };
  const view = render(<StudioDock {...props} />);
  return { ...props, container: view.container, unmount: view.unmount };
}

describe('StudioDock', () => {
  it('starts a take and toggles the framing tools', () => {
    const props = renderDock();

    fireEvent.click(screen.getByLabelText('Start recording'));
    fireEvent.click(screen.getByText('Grid'));
    fireEvent.click(screen.getByText('Peek'));
    fireEvent.click(screen.getByText('Light'));
    expect(props.onToggleRecording).toHaveBeenCalled();
    expect(props.onToggleGrid).toHaveBeenCalled();
    expect(props.onTogglePeek).toHaveBeenCalled();
    expect(props.onToggleLight).toHaveBeenCalled();
  });

  it('labels the record button for an answer and hides voice when unsupported', () => {
    renderDock({ between: true });

    expect(screen.getByLabelText('Record your answer')).toBeInTheDocument();
    expect(screen.queryByText('Voice')).toBeNull();
  });

  it('locks speed while the script follows the voice during a take', () => {
    renderDock({ isRecording: true, voiceEnabled: true });

    expect(screen.getByLabelText('Stop recording')).toBeInTheDocument();
    expect(screen.getByText('Speed').closest('button')).toBeDisabled();
  });

  it('passes axe ready, recording and without voice support', async () => {
    for (const overrides of [
      {},
      { isRecording: true, grid: true, takeCount: 2 },
      { voiceEnabled: undefined },
    ]) {
      const { container, unmount } = renderDock(overrides);
      await expectNoA11yViolations(container);
      unmount();
    }
  });
});
