import { ProgressSteps } from '@jovie/ui';
import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { expectNoA11yViolations } from '@/tests/utils/a11y';

const STEPS = [
  { id: 'account', label: 'Create account' },
  { id: 'connect', label: 'Connect Spotify' },
  { id: 'verify', label: 'Verify identity' },
  { id: 'launch', label: 'Launch profile' },
];

describe('ProgressSteps a11y (apps/web axe audit for the @jovie/ui atom)', () => {
  it.each([
    { state: 'first step current', current: 0 },
    { state: 'mid flow with completed steps', current: 2 },
    { state: 'last step current', current: 3 },
    { state: 'flow complete (above-range clamp)', current: 99 },
  ])('passes an axe audit when $state', async ({ current }) => {
    const { container } = render(
      <ProgressSteps steps={STEPS} current={current} aria-label='Setup steps' />
    );
    await expectNoA11yViolations(container);
  });

  it('passes an axe audit with a failed step', async () => {
    const { container } = render(
      <ProgressSteps
        steps={STEPS}
        current={1}
        failed
        aria-label='Setup steps'
      />
    );
    await expectNoA11yViolations(container);
  });

  it('passes an axe audit in indeterminate mode', async () => {
    const { container } = render(
      <ProgressSteps steps={STEPS} indeterminate aria-label='Import steps' />
    );
    await expectNoA11yViolations(container);
  });

  it('exposes the shared atom from the @jovie/ui barrel', () => {
    expect(ProgressSteps).toBeTypeOf('function');
  });
});
