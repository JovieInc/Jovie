import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { expectNoA11yViolations } from '@/tests/utils/a11y';
import { ProductScreenshot } from './ProductScreenshot';

const props = {
  src: '/images/dashboard.png',
  alt: 'Audience dashboard preview',
  width: 1600,
  height: 900,
} as const;

describe('ProductScreenshot', () => {
  it('renders the screenshot in window chrome with the default title', async () => {
    const { container } = render(
      <ProductScreenshot {...props} testId='shot' />
    );

    expect(screen.getByRole('img', { name: props.alt })).toBeVisible();
    expect(screen.getByText('Jovie')).toBeInTheDocument();
    expect(screen.getByTestId('shot').tagName).toBe('FIGURE');
    await expectNoA11yViolations(container);
  });

  it('swaps a broken screenshot for the preview fallback', async () => {
    const { container } = render(
      <ProductScreenshot {...props} title='Audience' />
    );

    fireEvent.error(screen.getByRole('img', { name: props.alt }));

    expect(screen.getByRole('figure', { name: props.alt })).toBeVisible();
    expect(screen.getByText('Preview unavailable')).toBeVisible();
    expect(screen.getAllByText('Audience')).toHaveLength(2);
    expect(screen.queryByRole('img')).toBeNull();
    await expectNoA11yViolations(container);
  });

  it('skips the availability check and drops the chrome bar when asked', async () => {
    const { container } = render(
      <ProductScreenshot
        {...props}
        skipCheck
        chrome='minimal'
        title='Audience'
      />
    );

    expect(screen.getByRole('img', { name: props.alt })).toBeVisible();
    expect(screen.queryByText('Audience')).toBeNull();
    await expectNoA11yViolations(container);
  });

  it('keeps a long title and an Arabic title axe-clean', async () => {
    const longTitle =
      'Jovie · Audience · Every fan who tipped, listened, presaved or asked for a show alert this month';
    const { container, rerender } = render(
      <ProductScreenshot {...props} skipCheck title={longTitle} />
    );
    expect(screen.getByText(longTitle)).toBeInTheDocument();
    await expectNoA11yViolations(container);

    rerender(
      <div dir='rtl' lang='ar'>
        <ProductScreenshot {...props} skipCheck title='جوفي · الجمهور' />
      </div>
    );
    expect(screen.getByText('جوفي · الجمهور')).toBeInTheDocument();
    await expectNoA11yViolations(container);
  });
});
