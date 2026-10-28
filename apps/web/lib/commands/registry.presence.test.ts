import { describe, expect, it } from 'vitest';
import { APP_ROUTES } from '@/constants/routes';
import { commandsForSurface } from './registry';

describe('Identity command discovery', () => {
  it('offers the supported workspace without a rollout prerequisite', () => {
    const identity = commandsForSurface('cmdk').find(
      command => command.kind === 'nav' && command.id === 'go-presence'
    );
    expect(identity).toMatchObject({ kind: 'nav', href: APP_ROUTES.PRESENCE });
    expect(identity).not.toHaveProperty('requiredFlag');
  });
});
