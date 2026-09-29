import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { PerformanceDashboard } from './PerformanceDashboard';

function dispatchWebVital(name: string, value: number, rating: string) {
  act(() => {
    globalThis.dispatchEvent(
      new CustomEvent('web-vitals', { detail: { name, value, rating } })
    );
  });
}

describe('PerformanceDashboard', () => {
  afterEach(() => {
    document.body.innerHTML = '';
  });

  it('renders a poor rating with the error token, not raw red-* (JOV-6773)', () => {
    render(<PerformanceDashboard showDebug />);

    fireEvent.click(
      screen.getByRole('button', { name: 'Toggle Performance Metrics' })
    );
    dispatchWebVital('LCP', 4500, 'poor');

    const rating = screen.getByText('4500ms');
    expect(rating.className).toContain('text-error');
    expect(rating.className).not.toMatch(/\bred-\d/);
  });

  it('does not render without showDebug outside development', () => {
    const { container } = render(<PerformanceDashboard />);
    expect(container).toBeEmptyDOMElement();
  });
});
