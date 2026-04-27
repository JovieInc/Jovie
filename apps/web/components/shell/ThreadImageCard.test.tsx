import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { ThreadImageCard } from './ThreadImageCard';

describe('ThreadImageCard', () => {
  it('shows the prompt while generating', () => {
    render(<ThreadImageCard prompt='cosmic radiation' status='generating' />);
    expect(screen.getAllByText(/cosmic radiation/).length).toBeGreaterThan(0);
  });

  it('hides the toolbar while generating', () => {
    render(<ThreadImageCard prompt='p' status='generating' />);
    expect(screen.queryByRole('button', { name: 'Download' })).toBeNull();
  });

  it('renders only the toolbar buttons whose handlers are provided', () => {
    render(
      <ThreadImageCard
        prompt='p'
        status='ready'
        previewUrl='https://example.com/x.jpg'
        onCopy={() => undefined}
      />
    );
    expect(screen.queryByRole('button', { name: 'Download' })).toBeNull();
    expect(screen.getByRole('button', { name: 'Copy' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Regenerate' })).toBeNull();
  });

  it('hides the entire toolbar when no handlers are provided', () => {
    render(
      <ThreadImageCard
        prompt='p'
        status='ready'
        previewUrl='https://example.com/x.jpg'
      />
    );
    expect(screen.queryByRole('button', { name: 'Download' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Copy' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Regenerate' })).toBeNull();
  });

  it('fires the matching handler when its toolbar button is clicked', () => {
    const onCopy = vi.fn();
    render(
      <ThreadImageCard
        prompt='p'
        status='ready'
        previewUrl='https://example.com/x.jpg'
        onCopy={onCopy}
      />
    );
    screen.getByRole('button', { name: 'Copy' }).click();
    expect(onCopy).toHaveBeenCalledOnce();
  });
});
