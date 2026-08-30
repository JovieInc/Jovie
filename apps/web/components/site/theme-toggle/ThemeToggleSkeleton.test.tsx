import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { ThemeToggleSkeleton } from './ThemeToggleSkeleton';

describe('ThemeToggleSkeleton', () => {
  it('reserves the icon control geometry while theme state hydrates', () => {
    const { getByRole, getByText } = render(
      <ThemeToggleSkeleton appearance='icon' />
    );

    expect(getByRole('button')).toBeDisabled();
    expect(getByText('Loading theme toggle')).toBeInTheDocument();
  });

  it('reserves all three segments for segmented hydration', () => {
    const { getByRole } = render(
      <ThemeToggleSkeleton appearance='segmented' />
    );
    const toolbar = getByRole('toolbar', { name: 'Theme' });

    expect(toolbar.children).toHaveLength(3);
    expect(toolbar).toHaveClass('border-subtle', 'bg-surface-2');
  });
});
