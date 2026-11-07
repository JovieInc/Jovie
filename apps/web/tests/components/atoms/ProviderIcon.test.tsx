import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { ProviderIcon } from '@/components/atoms/ProviderIcon';
import type { ProviderKey } from '@/lib/discography/types';

vi.mock('next-themes', () => ({
  useTheme: () => ({
    resolvedTheme: 'light',
  }),
}));

describe('ProviderIcon', () => {
  it('renders a fallback icon for unsupported providers', () => {
    render(
      <ProviderIcon
        provider={'unsupported_provider' as ProviderKey}
        aria-label='Unsupported provider'
      />
    );

    expect(screen.getByLabelText('Unsupported provider')).toBeInTheDocument();
  });

  it('renders a brand glyph for newly supported VK Music and Traxsource', () => {
    for (const provider of ['vk_music', 'traxsource'] as ProviderKey[]) {
      const { container, unmount } = render(
        <ProviderIcon provider={provider} aria-label={provider} />
      );
      expect(container.querySelector('svg path')).not.toBeNull();
      unmount();
    }
  });
});
