import { render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { DeferredSection } from './DeferredSection';

const originalIntersectionObserver = globalThis.IntersectionObserver;

afterEach(() => {
  globalThis.IntersectionObserver = originalIntersectionObserver;
});

describe('DeferredSection', () => {
  it('reserves the requested layout with the canonical large radius', () => {
    render(
      <DeferredSection placeholderHeight={320} placeholderWidth='75%'>
        <div>Deferred content</div>
      </DeferredSection>
    );

    const section = screen.getByTestId('deferred-section');
    const placeholder = section.querySelector('[aria-hidden="true"]');

    expect(section).toHaveAttribute('aria-busy', 'true');
    expect(screen.queryByText('Deferred content')).not.toBeInTheDocument();
    expect(placeholder).toHaveStyle({
      minHeight: '320px',
      minWidth: '75%',
      borderRadius: 'var(--radius-lg)',
    });
  });

  it('renders children when IntersectionObserver is unavailable', async () => {
    globalThis.IntersectionObserver = undefined as never;

    render(
      <DeferredSection>
        <div>Deferred content</div>
      </DeferredSection>
    );

    await waitFor(() => {
      expect(screen.getByText('Deferred content')).toBeInTheDocument();
    });
    expect(screen.getByTestId('deferred-section')).toHaveAttribute(
      'aria-busy',
      'false'
    );
  });
});
