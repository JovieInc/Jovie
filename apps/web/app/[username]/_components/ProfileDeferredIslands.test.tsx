import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { expectNoA11yViolations } from '@/tests/utils/a11y';
import { DeferredAliasCollisionRecovery } from './ProfileDeferredIslands';

const recoveryProps = vi.hoisted(() => [] as string[]);

vi.mock('@/components/features/profile/AliasCollisionRecovery', () => ({
  AliasCollisionRecovery: ({ username }: { readonly username: string }) => {
    recoveryProps.push(username);
    return <span data-testid='alias-recovery-island'>{username}</span>;
  },
}));

// The island set renders nothing on first paint and mounts its recovery
// module from a separate chunk once the client has hydrated.
describe('ProfileDeferredIslands', () => {
  it('mounts the alias recovery island after hydration with the profile handle', async () => {
    const { container } = render(
      <main>
        <h1>Profile</h1>
        <DeferredAliasCollisionRecovery username='tim' />
      </main>
    );

    const island = await screen.findByTestId('alias-recovery-island');
    expect(island).toHaveTextContent('tim');
    expect(recoveryProps).toContain('tim');
    await expectNoA11yViolations(container);
  });
});
