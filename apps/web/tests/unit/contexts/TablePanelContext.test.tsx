import { act, render, screen } from '@testing-library/react';
import * as React from 'react';
import { describe, expect, it, vi } from 'vitest';
import {
  RightPanelProvider,
  useRightPanel,
  useSetRightPanel,
} from '@/contexts/RightPanelContext';

/**
 * RightPanelContext Tests
 *
 * Validates the split-context pattern: dispatch consumers (useSetRightPanel)
 * must NOT re-render when state changes, while state consumers (useRightPanel)
 * must re-render when panel changes.
 */

interface RenderCallbackProps {
  readonly onRender: () => void;
}

function SetterConsumer({ onRender }: RenderCallbackProps) {
  const setPanel = useSetRightPanel();
  onRender();
  return (
    <button type='button' onClick={() => setPanel(<div>panel</div>)}>
      set
    </button>
  );
}

function StateConsumer({ onRender }: RenderCallbackProps) {
  const panel = useRightPanel();
  onRender();
  return <div data-testid='panel'>{panel}</div>;
}

describe('RightPanelContext', () => {
  it('useSetRightPanel returns a stable setter reference', () => {
    const refs: Array<(node: React.ReactNode) => void> = [];

    function Capture() {
      const setPanel = useSetRightPanel();
      refs.push(setPanel);
      return null;
    }

    const { rerender } = render(
      <RightPanelProvider>
        <Capture />
      </RightPanelProvider>
    );

    rerender(
      <RightPanelProvider>
        <Capture />
      </RightPanelProvider>
    );

    expect(refs).toHaveLength(2);
    expect(refs[0]).toBe(refs[1]);
  });

  it('useSetRightPanel consumer does not re-render when panel changes', () => {
    const setterRenders = vi.fn();
    const stateRenders = vi.fn();

    render(
      <RightPanelProvider>
        <SetterConsumer onRender={setterRenders} />
        <StateConsumer onRender={stateRenders} />
      </RightPanelProvider>
    );

    // Both render once on mount
    expect(setterRenders).toHaveBeenCalledTimes(1);
    expect(stateRenders).toHaveBeenCalledTimes(1);

    // Trigger a panel change
    act(() => {
      screen.getByText('set').click();
    });

    // State consumer re-renders, setter consumer does NOT
    expect(setterRenders).toHaveBeenCalledTimes(1);
    expect(stateRenders).toHaveBeenCalledTimes(2);
  });

  it('useRightPanel consumer re-renders when panel changes', () => {
    const stateRenders = vi.fn();

    render(
      <RightPanelProvider>
        <SetterConsumer onRender={() => {}} />
        <StateConsumer onRender={stateRenders} />
      </RightPanelProvider>
    );

    expect(stateRenders).toHaveBeenCalledTimes(1);

    act(() => {
      screen.getByText('set').click();
    });

    expect(stateRenders).toHaveBeenCalledTimes(2);
    expect(screen.getByTestId('panel')).toHaveTextContent('panel');
  });

  it('useSetRightPanel throws outside provider', () => {
    expect(() => {
      render(<SetterConsumer onRender={() => {}} />);
    }).toThrow('useSetRightPanel must be used within RightPanelProvider');
  });
});
