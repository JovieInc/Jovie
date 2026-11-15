import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { expectNoA11yViolations } from '@/tests/utils/a11y';
import { ProductScreenshotClient } from './ProductScreenshotClient';

const props = {
  alt: 'Audience dashboard preview',
  aspectRatio: '16 / 9',
  chrome: 'window',
  height: 900,
  priority: false,
  src: '/images/dashboard.png',
  title: 'Audience',
  width: 1600,
} as const;

describe('ProductScreenshotClient', () => {
  it('shows the screenshot while it is available', async () => {
    const { container } = render(<ProductScreenshotClient {...props} />);

    expect(screen.getByRole('img', { name: props.alt })).toBeVisible();
    expect(screen.queryByText('Preview unavailable')).toBeNull();
    await expectNoA11yViolations(container);
  });

  it('falls back to the preview card when the image fails to load', async () => {
    const { container } = render(<ProductScreenshotClient {...props} />);

    fireEvent.error(screen.getByRole('img', { name: props.alt }));

    expect(screen.getByRole('figure', { name: props.alt })).toBeVisible();
    expect(screen.getByText('Preview unavailable')).toBeVisible();
    expect(screen.queryByRole('img')).toBeNull();
    await expectNoA11yViolations(container);
  });

  it('tries the image again when the source changes after a failure', async () => {
    const { container, rerender } = render(
      <ProductScreenshotClient {...props} />
    );
    fireEvent.error(screen.getByRole('img', { name: props.alt }));
    expect(screen.getByText('Preview unavailable')).toBeVisible();

    rerender(
      <ProductScreenshotClient {...props} src='/images/dashboard-v2.png' />
    );

    expect(screen.getByRole('img', { name: props.alt })).toBeVisible();
    expect(screen.queryByText('Preview unavailable')).toBeNull();
    await expectNoA11yViolations(container);
  });

  it('keeps a long title and an Arabic title axe-clean', async () => {
    const longTitle =
      'Jovie · Audience · Every fan who tipped, listened, presaved or asked for a show alert this month';
    const { container, rerender } = render(
      <ProductScreenshotClient {...props} chrome='window' title={longTitle} />
    );
    expect(screen.getByText(longTitle)).toBeInTheDocument();
    await expectNoA11yViolations(container);

    rerender(
      <div dir='rtl' lang='ar'>
        <ProductScreenshotClient {...props} title='جوفي · الجمهور' />
      </div>
    );
    expect(screen.getByText('جوفي · الجمهور')).toBeInTheDocument();
    await expectNoA11yViolations(container);
  });
});
