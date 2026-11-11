import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { StudioStage } from './StudioStage';

describe('StudioStage', () => {
  it('keeps the camera dim behind the words', () => {
    render(<StudioStage peek={false} between={false} grid={false} />);

    expect(
      screen.getByTestId('teleprompter-studio-camera').className
    ).toContain('opacity-30');
    expect(screen.getByTestId('teleprompter-studio-ring')).toBeInTheDocument();
  });

  it('dims further between takes and shows the grid on request', () => {
    const { container } = render(<StudioStage peek={false} between grid />);

    expect(
      screen.getByTestId('teleprompter-studio-camera').className
    ).toContain('opacity-15');
    expect(container.querySelectorAll('.grid-cols-3 > span')).toHaveLength(9);
  });

  it('shows the camera at full strength while peeking', () => {
    render(<StudioStage peek between={false} grid={false} />);

    expect(
      screen.getByTestId('teleprompter-studio-camera').className
    ).toContain('opacity-100');
  });
});
