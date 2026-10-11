import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { RailStagedContent } from './RailStagedContent';

function Fixture({ hidden }: { hidden: boolean }) {
  return (
    <>
      <button type='button' data-rail-toggle='left'>
        Toggle left rail
      </button>
      <button type='button'>Editor</button>
      <RailStagedContent hidden={hidden} data-testid='chrome'>
        <button type='button'>Switch workspace</button>
      </RailStagedContent>
    </>
  );
}

describe('staged rail chrome', () => {
  it('removes hidden chrome from AX/tab navigation and returns owned focus without scrolling', () => {
    const { rerender } = render(<Fixture hidden={false} />);
    screen.getByRole('button', { name: 'Switch workspace' }).focus();
    rerender(<Fixture hidden />);
    expect(screen.getByTestId('chrome')).toHaveAttribute('inert');
    expect(screen.getByTestId('chrome')).toHaveAttribute('aria-hidden', 'true');
    expect(
      screen.getByRole('button', { name: 'Toggle left rail' })
    ).toHaveFocus();
    rerender(<Fixture hidden={false} />);
    expect(screen.getByTestId('chrome')).not.toHaveAttribute('inert');
    expect(
      screen.getByRole('button', { name: 'Switch workspace' })
    ).toBeVisible();
  });

  it('does not take focus from a live editor on close or reopen', () => {
    const { rerender } = render(<Fixture hidden={false} />);
    screen.getByRole('button', { name: 'Switch workspace' }).focus();
    screen.getByRole('button', { name: 'Editor' }).focus();
    rerender(<Fixture hidden />);
    expect(screen.getByRole('button', { name: 'Editor' })).toHaveFocus();
    rerender(<Fixture hidden={false} />);
    expect(screen.getByRole('button', { name: 'Editor' })).toHaveFocus();
  });

  it('ignores hidden and disabled toggles when restoring focus', () => {
    const { rerender } = render(<Fixture hidden={false} />);
    const toggle = screen.getByRole('button', { name: 'Toggle left rail' });
    toggle.setAttribute('disabled', '');
    screen.getByRole('button', { name: 'Switch workspace' }).focus();
    const available = document.createElement('button');
    available.setAttribute('data-rail-toggle', 'left');
    document.body.append(available);
    fireEvent.focusIn(screen.getByRole('button', { name: 'Switch workspace' }));
    rerender(<Fixture hidden />);
    expect(available).toHaveFocus();
    available.remove();
  });
});
