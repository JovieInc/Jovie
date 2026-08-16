import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { SmartLinkProviderButton } from './SmartLinkProviderButton';

describe('SmartLinkProviderButton', () => {
  it('exposes the canonical provider key for a non-Spotify action', () => {
    render(
      <SmartLinkProviderButton
        label='Apple Music'
        providerKey='apple_music'
        onClick={vi.fn()}
      />
    );

    expect(
      screen.getByRole('button', { name: 'Open Apple Music' })
    ).toHaveAttribute('data-dsp-provider', 'apple_music');
  });
});
