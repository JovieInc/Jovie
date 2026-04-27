import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { AgentPulse } from './AgentPulse';

describe('AgentPulse', () => {
  it('renders an aria-hidden span with the calm-breath utility class', () => {
    const { container } = render(<AgentPulse />);
    const root = container.firstElementChild as HTMLElement;
    expect(root.getAttribute('aria-hidden')).toBe('true');
    expect(root.className).toContain('anim-calm-breath');
  });

  it('forwards a custom animation duration to the inline style', () => {
    const { container } = render(<AgentPulse durationMs={2400} />);
    const root = container.firstElementChild as HTMLElement;
    expect(root.style.animationDuration).toBe('2400ms');
  });
});
