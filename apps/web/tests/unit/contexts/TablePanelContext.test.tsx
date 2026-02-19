import { act, render, screen } from '@testing-library/react';
import * as React from 'react';
import { describe, expect, it, vi } from 'vitest';
import {
  TablePanelProvider,
  useSetTablePanel,
  useTablePanel,
} from '@/contexts/TablePanelContext';

/**
 * TablePanelContext Tests
 *
 * Validates the split-context pattern: dispatch consumers (useSetTablePanel)
 * must NOT re-render when state changes, while state consumers (useTablePanel)
 * must re-render when panel changes.
 */

interface RenderCallbackProps {
  readonly onRender: () => void;
}

function SetterConsumer({ onRender }: RenderCallbackProps) {
  const setPanel = useSetTablePanel();
  onRender();
  return (
    <button type='button' onClick={() => setPanel(<div>panel</div>)}>
      set
    </button>
  );
}

function StateConsumer({ onRender }: RenderCallbackProps) {
  const panel = useTablePanel();
  onRender();
  return <div data-testid='panel'>{panel}</div>;
}

describe('TablePanelContext', () => {
  it('useSetTablePanel returns a stable setter reference', () => {
    const refs: Array<(node: React.ReactNode) => void> = [];

    function Capture() {
      const setPanel = useSetTablePanel();
      refs.push(setPanel);
      return null;
    }

    const { rerender } = render(
      <TablePanelProvider>
        <Capture />
      </TablePanelProvider>
    );

    rerender(
      <TablePanelProvider>
        <Capture />
      </TablePanelProvider>
    );

    expect(refs).toHaveLength(2);
    expect(refs[0]).toBe(refs[1]);
  });

  it('useSetTablePanel consumer does not re-render when panel changes', () => {
    const setterRenders = vi.fn();
    const stateRenders = vi.fn();

    render(
      <TablePanelProvider>
        <SetterConsumer onRender={setterRenders} />
        <StateConsumer onRender={stateRenders} />
      </TablePanelProvider>
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

  it('useTablePanel consumer re-renders when panel changes', () => {
    const stateRenders = vi.fn();

    render(
      <TablePanelProvider>
        <SetterConsumer onRender={() => {}} />
        <StateConsumer onRender={stateRenders} />
      </TablePanelProvider>
    );

    expect(stateRenders).toHaveBeenCalledTimes(1);

    act(() => {
      screen.getByText('set').click();
    });

    expect(stateRenders).toHaveBeenCalledTimes(2);
    expect(screen.getByTestId('panel')).toHaveTextContent('panel');
  });

  it('useSetTablePanel throws outside provider', () => {
    expect(() => {
      render(<SetterConsumer onRender={() => {}} />);
    }).toThrow('useSetTablePanel must be used within TablePanelProvider');
  });
});
