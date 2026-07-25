import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { AppFlagProvider, useAppFlag } from '@/lib/flags/client';
import { APP_FLAG_DEFAULTS } from '@/lib/flags/contracts';

function FlagProbe({
  flagName,
}: {
  readonly flagName: keyof typeof APP_FLAG_DEFAULTS;
}) {
  const enabled = useAppFlag(flagName);
  return <div data-testid={`flag-${flagName}`}>{String(enabled)}</div>;
}

describe('AppFlagProvider partial snapshots', () => {
  it('uses a supplied value from a trimmed payload', () => {
    render(
      <AppFlagProvider initialFlags={{ STRIPE_CONNECT_ENABLED: false }}>
        <FlagProbe flagName='STRIPE_CONNECT_ENABLED' />
      </AppFlagProvider>
    );

    expect(screen.getByTestId('flag-STRIPE_CONNECT_ENABLED')).toHaveTextContent(
      'false'
    );
  });

  it('falls back to local defaults for flags omitted from the payload', () => {
    render(
      <AppFlagProvider initialFlags={{ STRIPE_CONNECT_ENABLED: true }}>
        <FlagProbe flagName='ALBUM_ART_GENERATION' />
      </AppFlagProvider>
    );

    expect(screen.getByTestId('flag-ALBUM_ART_GENERATION')).toHaveTextContent(
      String(APP_FLAG_DEFAULTS.ALBUM_ART_GENERATION)
    );
  });
});
