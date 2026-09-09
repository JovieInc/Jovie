import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { MarketingCtaSection } from './MarketingCtaSection';

describe('MarketingCtaSection native boundary', () => {
  it('forwards native section attributes and preserves child interaction without adding wrappers', () => {
    const activate = vi.fn();
    const { container } = render(
      <MarketingCtaSection
        id='close'
        className='existing-paint'
        aria-labelledby='title'
        data-testid='marketing-section-cta'
      >
        <h2 id='title'>Existing title</h2>
        <button type='button' onClick={activate}>
          Existing action
        </button>
      </MarketingCtaSection>
    );
    const section = screen.getByTestId('marketing-section-cta');
    expect(container.children).toHaveLength(1);
    expect(section.tagName).toBe('SECTION');
    expect(section).toHaveAttribute('id', 'close');
    expect(section).toHaveAttribute('aria-labelledby', 'title');
    expect(section.className).toBe('existing-paint');
    expect(section.children).toHaveLength(2);
    expect(section.firstElementChild?.tagName).toBe('H2');
    fireEvent.click(screen.getByRole('button', { name: 'Existing action' }));
    expect(activate).toHaveBeenCalledTimes(1);
  });
});
