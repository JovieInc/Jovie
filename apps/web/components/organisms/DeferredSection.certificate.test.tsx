import { act, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { expectNoA11yViolations } from '@/tests/utils/a11y';
import { DeferredSection } from './DeferredSection';

type ObserverCallback = (entries: Array<{ isIntersecting: boolean }>) => void;

const originalIntersectionObserver = globalThis.IntersectionObserver;
let observerCallback: ObserverCallback | null = null;
const disconnect = vi.fn();
const observe = vi.fn();

beforeEach(() => {
  observerCallback = null;
  disconnect.mockClear();
  observe.mockClear();
  globalThis.IntersectionObserver = class {
    constructor(callback: ObserverCallback) {
      observerCallback = callback;
    }
    observe = observe;
    disconnect = disconnect;
  } as unknown as typeof IntersectionObserver;
});

afterEach(() => {
  globalThis.IntersectionObserver = originalIntersectionObserver;
});

describe('DeferredSection certificate', () => {
  it('keeps the reserved placeholder busy and axe-clean before it scrolls in', async () => {
    const { container } = render(
      <DeferredSection placeholderHeight={240}>
        <h2>Deferred content</h2>
      </DeferredSection>
    );

    expect(screen.getByTestId('deferred-section')).toHaveAttribute(
      'aria-busy',
      'true'
    );
    expect(observe).toHaveBeenCalledTimes(1);
    expect(screen.queryByText('Deferred content')).not.toBeInTheDocument();
    await expectNoA11yViolations(container);
  });

  it('renders children once the section intersects, then disconnects', async () => {
    const { container } = render(
      <DeferredSection>
        <h2>Deferred content</h2>
      </DeferredSection>
    );

    act(() => {
      observerCallback?.([{ isIntersecting: false }]);
    });
    expect(screen.queryByText('Deferred content')).not.toBeInTheDocument();

    act(() => {
      observerCallback?.([{ isIntersecting: true }]);
    });
    expect(
      screen.getByRole('heading', { name: 'Deferred content' })
    ).toBeVisible();
    expect(screen.getByTestId('deferred-section')).toHaveAttribute(
      'aria-busy',
      'false'
    );
    expect(disconnect).toHaveBeenCalled();
    await expectNoA11yViolations(container);
  });

  it('renders long children axe-clean inside a right-to-left document', async () => {
    const paragraphs = Array.from({ length: 6 }, (_, i) => `فقرة ${i + 1}`);
    const { container } = render(
      <div dir='rtl'>
        <DeferredSection testId='rtl-section'>
          {paragraphs.map(text => (
            <p key={text}>{text}</p>
          ))}
        </DeferredSection>
      </div>
    );

    act(() => {
      observerCallback?.([{ isIntersecting: true }]);
    });
    expect(screen.getByTestId('rtl-section')).toHaveTextContent('فقرة 6');
    await expectNoA11yViolations(container);
  });
});
