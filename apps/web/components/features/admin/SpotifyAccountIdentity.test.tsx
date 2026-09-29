import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import {
  getSpotifyAccountLabel,
  SpotifyAccountIdentity,
} from './SpotifyAccountIdentity';

describe('SpotifyAccountIdentity', () => {
  it('uses one deterministic label precedence across surfaces', () => {
    expect(
      getSpotifyAccountLabel({
        displayName: 'Jovie Artist',
        handle: 'ignored',
        accountId: 'ignored',
      })
    ).toBe('Jovie Artist');
    expect(getSpotifyAccountLabel({ handle: '@jovie' })).toBe('@jovie');
    expect(getSpotifyAccountLabel({ accountId: 'spotify-1' })).toBe(
      'spotify-1'
    );
  });

  it('renders the shared identity primitive', () => {
    render(<SpotifyAccountIdentity displayName='Jovie Artist' />);
    expect(screen.getByTestId('spotify-account-identity')).toHaveTextContent(
      'Jovie Artist'
    );
  });
});
