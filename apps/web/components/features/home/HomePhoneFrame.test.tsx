import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { expectNoA11yViolations } from '@/tests/utils/a11y';
import { HomePhoneFrame } from './HomePhoneFrame';

const LONG_COPY =
  'A release page with listen links for every service, a presave countdown, tour dates near the fan and a tip jar, all in one scrolling profile that keeps going well past the visible screen.';

describe('HomePhoneFrame', () => {
  it('renders its children inside a bezel-free mobile web screen', async () => {
    const { container } = render(
      <HomePhoneFrame>
        <p>Screen content</p>
      </HomePhoneFrame>
    );

    const screenNode = container.querySelector('[data-device="mobile-web"]');
    expect(screenNode).toHaveClass(
      'mobile-web-screen',
      'homepage-phone-screen'
    );
    expect(screenNode).toContainElement(screen.getByText('Screen content'));
    await expectNoA11yViolations(container);
  });

  it('uses the compact width and merges a caller class', async () => {
    const { container, rerender } = render(
      <HomePhoneFrame className='custom-frame'>
        <p>Wide</p>
      </HomePhoneFrame>
    );
    const frame = container.firstElementChild;
    expect(frame).toHaveClass('homepage-phone-frame', 'custom-frame');
    expect(frame?.className).toContain(
      '[--homepage-phone-frame-width:20.5rem]'
    );

    rerender(
      <HomePhoneFrame compact>
        <p>Compact</p>
      </HomePhoneFrame>
    );
    expect(container.firstElementChild?.className).toContain(
      '[--homepage-phone-frame-width:20rem]'
    );
    expect(container.firstElementChild?.className).not.toContain('20.5rem');
    await expectNoA11yViolations(container);
  });

  it('keeps an empty screen in place when there is nothing to show', async () => {
    const { container } = render(<HomePhoneFrame>{null}</HomePhoneFrame>);

    const screenNode = container.querySelector('[data-device="mobile-web"]');
    expect(screenNode).toBeInTheDocument();
    expect(screenNode).toBeEmptyDOMElement();
    await expectNoA11yViolations(container);
  });

  it('holds long and right-to-left content', async () => {
    const { container } = render(
      <div dir='rtl' lang='ar'>
        <HomePhoneFrame>
          <p>{LONG_COPY}</p>
          <p>صفحة الإصدار مع روابط الاستماع لكل خدمة</p>
        </HomePhoneFrame>
      </div>
    );

    expect(screen.getByText(LONG_COPY)).toBeInTheDocument();
    expect(
      screen.getByText('صفحة الإصدار مع روابط الاستماع لكل خدمة')
    ).toBeInTheDocument();
    await expectNoA11yViolations(container);
  });
});
