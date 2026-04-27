import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { ThreadTurn } from './ThreadTurn';

describe('ThreadTurn', () => {
  it('renders a right-aligned bubble for the user speaker', () => {
    const { container } = render(<ThreadTurn speaker='me'>hello</ThreadTurn>);
    expect(screen.getByText('hello')).toBeInTheDocument();
    expect(container.firstElementChild?.className).toContain('justify-end');
  });

  it('renders a flat-text block for the jovie speaker', () => {
    const { container } = render(
      <ThreadTurn speaker='jovie'>response body</ThreadTurn>
    );
    expect(screen.getByText('response body')).toBeInTheDocument();
    const root = container.firstElementChild as HTMLElement;
    expect(root.className).not.toContain('justify-end');
    expect(root.className).toContain('text-secondary-token');
  });

  it('uses the tertiary-token tone when subtle is set', () => {
    const { container } = render(
      <ThreadTurn speaker='jovie' subtle>
        Generating…
      </ThreadTurn>
    );
    expect((container.firstElementChild as HTMLElement).className).toContain(
      'text-tertiary-token'
    );
  });
});
