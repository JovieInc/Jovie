import { render } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { expectNoA11yViolations } from '@/tests/utils/a11y';
import { MarketingScrollUnlock } from './MarketingScrollUnlock';

describe('MarketingScrollUnlock', () => {
  afterEach(() => {
    document.documentElement.style.removeProperty('overflow-y');
    document.body.style.removeProperty('overflow-y');
  });

  it('unlocks vertical scroll on the root element and renders no DOM', async () => {
    document.documentElement.style.overflowY = 'hidden';

    const { container } = render(<MarketingScrollUnlock />);

    expect(document.documentElement.style.overflowY).toBe('auto');
    expect(container).toBeEmptyDOMElement();
    await expectNoA11yViolations(container);
  });

  it('leaves body overflow alone so sticky elements keep working', () => {
    render(<MarketingScrollUnlock />);

    expect(document.body.style.overflowY).toBe('');
  });

  it('removes the override on unmount', () => {
    const { unmount } = render(<MarketingScrollUnlock />);
    expect(document.documentElement.style.overflowY).toBe('auto');

    unmount();

    expect(document.documentElement.style.overflowY).toBe('');
    expect(document.documentElement.getAttribute('style') ?? '').not.toContain(
      'overflow-y'
    );
  });
});
