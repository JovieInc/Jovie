import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { expectNoA11yViolations } from '@/tests/utils/a11y';
import { AgentPulse } from './AgentPulse';

describe('AgentPulse certificate', () => {
  it('stays out of the accessibility tree beside its affordance, axe-clean', async () => {
    const { container } = render(
      <span className='relative inline-flex h-8 w-8'>
        <span>A</span>
        <AgentPulse />
      </span>
    );
    const ring = container.querySelector('[aria-hidden="true"]') as HTMLElement;
    expect(ring).toHaveClass('pointer-events-none', 'anim-calm-breath');
    expect(ring.style.animationDuration).toBe('1600ms');
    await expectNoA11yViolations(container);
  });

  it('accepts a tone override and a slower pulse', async () => {
    const { container } = render(
      <span className='relative inline-flex h-8 w-8'>
        <AgentPulse className='ring-secondary-token' durationMs={3200} />
      </span>
    );
    const ring = container.querySelector('[aria-hidden="true"]') as HTMLElement;
    expect(ring).toHaveClass('ring-secondary-token');
    expect(ring.style.animationDuration).toBe('3200ms');
    await expectNoA11yViolations(container);
  });
});
