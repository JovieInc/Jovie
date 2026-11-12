import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { expectNoA11yViolations } from '@/tests/utils/a11y';
import { SmartLinkLoadingState } from './SmartLinkLoadingState';

describe('SmartLinkLoadingState', () => {
  it('reserves the artwork, title, byline and five provider rows inside the page landmark', async () => {
    const { container } = render(<SmartLinkLoadingState />);

    const main = screen.getByRole('main');
    expect(main).toBeInTheDocument();
    // Artwork + title + byline + five provider rows.
    expect(main.querySelectorAll('.h-12.w-full')).toHaveLength(5);
    expect(main.querySelector('.h-64.w-64')).not.toBeNull();
    expect(screen.getAllByRole('status').length).toBeGreaterThan(0);
    await expectNoA11yViolations(container);
  });

  it('keeps the same skeleton in a right-to-left page', async () => {
    const { container } = render(
      <div dir='rtl' lang='ar'>
        <SmartLinkLoadingState />
      </div>
    );

    expect(
      screen.getByRole('main').querySelectorAll('.h-12.w-full')
    ).toHaveLength(5);
    await expectNoA11yViolations(container);
  });
});
