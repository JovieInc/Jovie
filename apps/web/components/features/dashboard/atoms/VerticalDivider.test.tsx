import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { expectNoA11yViolations } from '@/tests/utils/a11y';
import { VerticalDivider } from './VerticalDivider';

describe('VerticalDivider', () => {
  it('draws a decorative hairline that assistive technology skips', async () => {
    const { container } = render(
      <div role='toolbar' aria-label='Header actions'>
        <button type='button'>Toggle sidebar</button>
        <VerticalDivider />
        <button type='button'>Share</button>
      </div>
    );

    const divider = container.querySelector('[aria-hidden="true"]');
    expect(divider).toHaveClass('h-5', 'w-px', 'bg-subtle');
    expect(divider).toBeEmptyDOMElement();
    await expectNoA11yViolations(container);
  });
});
