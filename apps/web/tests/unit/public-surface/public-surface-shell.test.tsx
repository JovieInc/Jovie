import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import {
  PublicSurfaceFooter,
  PublicSurfaceHeader,
  PublicSurfaceShell,
  PublicSurfaceStage,
} from '@/components/organisms/public-surface';

vi.mock('next/image', () => ({
  __esModule: true,
  default: (props: { alt?: string; src: string }) => (
    <img alt={props.alt ?? ''} {...props} />
  ),
}));

describe('PublicSurfaceShell primitives', () => {
  it('renders shell, stage, header, and footer together', () => {
    const { container } = render(
      <PublicSurfaceShell ambientMediaUrl='https://cdn.example.com/ambient.jpg'>
        <PublicSurfaceStage>
          <PublicSurfaceHeader
            leftSlot={<span>left slot</span>}
            rightSlot={<button type='button'>right slot</button>}
          />
          <div>body content</div>
          <PublicSurfaceFooter>
            <div>footer content</div>
          </PublicSurfaceFooter>
        </PublicSurfaceStage>
      </PublicSurfaceShell>
    );

    expect(screen.getByText('left slot')).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'right slot' })
    ).toBeInTheDocument();
    expect(screen.getByText('body content')).toBeInTheDocument();
    expect(screen.getByText('footer content')).toBeInTheDocument();
    expect(container.querySelectorAll('img').length).toBeGreaterThan(0);
  });
});
