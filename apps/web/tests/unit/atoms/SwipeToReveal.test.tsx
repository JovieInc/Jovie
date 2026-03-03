import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import {
  SwipeToReveal,
  SwipeToRevealGroup,
} from '@/components/atoms/SwipeToReveal';

vi.mock('@/hooks/useTouchDevice', () => ({
  useTouchDevice: () => false,
}));

vi.mock('@/hooks/useSwipeToReveal', () => ({
  useSwipeToReveal: () => ({
    isOpen: false,
    close: vi.fn(),
    handlers: {},
    style: {},
  }),
}));

describe('SwipeToReveal', () => {
  it('renders children on non-touch device (forceEnabled not set)', () => {
    render(
      <SwipeToReveal actions={<button type='button'>Delete</button>}>
        <div data-testid='content'>Item</div>
      </SwipeToReveal>
    );
    expect(screen.getByTestId('content')).toBeInTheDocument();
    expect(screen.queryByText('Delete')).toBeNull();
  });

  it('renders children when forceEnabled=false explicitly', () => {
    render(
      <SwipeToReveal
        forceEnabled={false}
        actions={<button type='button'>Delete</button>}
      >
        <div data-testid='content'>Item</div>
      </SwipeToReveal>
    );
    expect(screen.getByTestId('content')).toBeInTheDocument();
    expect(screen.queryByText('Delete')).toBeNull();
  });

  it('renders the swipe container when forceEnabled=true', () => {
    render(
      <SwipeToReveal
        forceEnabled
        actions={<button type='button'>Delete</button>}
      >
        <div data-testid='content'>Item</div>
      </SwipeToReveal>
    );
    expect(screen.getByTestId('content')).toBeInTheDocument();
    expect(screen.getByText('Delete')).toBeInTheDocument();
  });

  it('renders actions container when forceEnabled=true', () => {
    render(
      <SwipeToReveal
        forceEnabled
        actions={<button type='button'>Remove</button>}
      >
        <span>Content</span>
      </SwipeToReveal>
    );
    expect(screen.getByText('Remove')).toBeInTheDocument();
  });

  it('actions container is aria-hidden when not open', () => {
    render(
      <SwipeToReveal
        forceEnabled
        actions={<button type='button'>Remove</button>}
      >
        <span>Content</span>
      </SwipeToReveal>
    );
    const actionsContainer = screen.getByText('Remove').parentElement;
    expect(actionsContainer).toHaveAttribute('aria-hidden', 'true');
  });
});

describe('SwipeToRevealGroup', () => {
  it('renders children', () => {
    render(
      <SwipeToRevealGroup>
        <div data-testid='child'>Hello</div>
      </SwipeToRevealGroup>
    );
    expect(screen.getByTestId('child')).toBeInTheDocument();
  });
});
