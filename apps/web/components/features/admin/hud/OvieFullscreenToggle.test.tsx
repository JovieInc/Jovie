import { TooltipProvider } from '@jovie/ui';
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { OvieFullscreenToggle } from './OvieFullscreenToggle';

describe('OvieFullscreenToggle', () => {
  it('exposes and invokes the full-screen action in both states', () => {
    const onToggle = vi.fn();
    const { rerender } = render(
      <TooltipProvider>
        <OvieFullscreenToggle onToggle={onToggle} inDesktopApp={false} />
      </TooltipProvider>
    );
    const enter = screen.getByRole('button', { name: /^Full Screen/ });
    expect(enter).toHaveAttribute('aria-pressed', 'false');
    fireEvent.click(enter);
    expect(onToggle).toHaveBeenCalledOnce();
    rerender(
      <TooltipProvider>
        <OvieFullscreenToggle on onToggle={onToggle} inDesktopApp />
      </TooltipProvider>
    );
    const exit = screen.getByRole('button', { name: /^Exit Full Screen/ });
    expect(exit).toHaveAttribute('aria-pressed', 'true');
    fireEvent.click(exit);
    expect(onToggle).toHaveBeenCalledTimes(2);
  });
});
