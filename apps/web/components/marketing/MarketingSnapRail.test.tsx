import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { expectNoA11yViolations } from '@/tests/utils/a11y';
import { MarketingSnapRail } from './MarketingSnapRail';

function mockLayout(scrollWidth: number, clientWidth: number) {
  Object.defineProperty(HTMLElement.prototype, 'scrollWidth', {
    configurable: true,
    get: () => scrollWidth,
  });
  Object.defineProperty(HTMLElement.prototype, 'clientWidth', {
    configurable: true,
    get: () => clientWidth,
  });
}

describe('MarketingSnapRail', () => {
  beforeEach(() => {
    vi.stubGlobal(
      'ResizeObserver',
      class {
        observe() {}
        disconnect() {}
        unobserve() {}
      }
    );
    vi.stubGlobal(
      'matchMedia',
      vi.fn().mockReturnValue({ matches: true, addEventListener: vi.fn() })
    );
    mockLayout(0, 0);
  });

  it('renders an empty labelled scroller with disabled controls', async () => {
    const { container } = render(
      <MarketingSnapRail ariaLabel='Features' showMobileControls>
        {null}
      </MarketingSnapRail>
    );

    expect(
      screen.getByRole('region', { name: 'Features' })
    ).toBeInTheDocument();
    for (const button of screen.getAllByRole('button', { hidden: true })) {
      expect(button).toBeDisabled();
    }
    await expectNoA11yViolations(container);
  });

  it('describes the rail with instructions when provided', async () => {
    const { container } = render(
      <MarketingSnapRail
        ariaLabel='Features'
        instructions='Swipe to see more'
        instructionsId='rail-help'
      >
        <div>One</div>
      </MarketingSnapRail>
    );

    expect(screen.getByRole('region', { name: 'Features' })).toHaveAttribute(
      'aria-describedby',
      'rail-help'
    );
    expect(screen.getByText('Swipe to see more')).toBeInTheDocument();
    await expectNoA11yViolations(container);
  });

  it('enables next when content overflows and scrolls the rail on press', async () => {
    mockLayout(2000, 500);
    const user = userEvent.setup();
    const scrollBy = vi.fn();
    HTMLElement.prototype.scrollBy = scrollBy;
    const { container } = render(
      <MarketingSnapRail
        ariaLabel='Features'
        showMobileControls
        nextLabel='Next card'
        previousLabel='Previous card'
      >
        <div>One</div>
        <div>Two</div>
      </MarketingSnapRail>
    );

    const [next] = await screen.findAllByRole('button', {
      name: 'Next card',
      hidden: true,
    });
    expect(next).toBeEnabled();
    for (const previous of screen.getAllByRole('button', {
      name: 'Previous card',
      hidden: true,
    })) {
      expect(previous).toBeDisabled();
    }

    await user.click(next);

    expect(scrollBy).toHaveBeenCalledWith(
      expect.objectContaining({ left: 400, behavior: 'auto' })
    );
    await expectNoA11yViolations(container);
  });
});
