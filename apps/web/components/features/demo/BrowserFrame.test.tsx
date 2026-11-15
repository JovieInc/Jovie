import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { expectNoA11yViolations } from '@/tests/utils/a11y';
import { BrowserFrame } from './BrowserFrame';

describe('BrowserFrame', () => {
  it('wraps its content in chrome drawn from the on-media token', async () => {
    const { container } = render(
      <BrowserFrame>
        <p>Dashboard screenshot</p>
      </BrowserFrame>
    );

    expect(screen.getByText('Dashboard screenshot')).toBeInTheDocument();
    const frame = container.firstElementChild;
    expect(frame).toHaveClass('border-on-media/10', 'bg-on-media/5');
    expect(frame).not.toHaveClass('border-white/10');
    const dots = container.querySelectorAll('span.rounded-full');
    expect(dots).toHaveLength(3);
    for (const dot of dots) expect(dot).toHaveClass('bg-on-media/20');
    await expectNoA11yViolations(container);
  });

  it('renders the chrome alone when it has no content', async () => {
    const { container } = render(<BrowserFrame>{null}</BrowserFrame>);

    expect(container.firstElementChild?.children).toHaveLength(1);
    await expectNoA11yViolations(container);
  });

  it('keeps right-to-left content inside the frame', async () => {
    const { container } = render(
      <BrowserFrame>
        <p dir='rtl' lang='ar'>
          خطة الإصدار
        </p>
      </BrowserFrame>
    );

    expect(screen.getByText('خطة الإصدار')).toHaveAttribute('dir', 'rtl');
    await expectNoA11yViolations(container);
  });
});
