import { render, screen } from '@testing-library/react';
import Link from 'next/link';
import { describe, expect, it } from 'vitest';
import { expectNoA11yViolations } from '@/tests/utils/a11y';
import { PhoneFrame } from './PhoneFrame';

describe('PhoneFrame mobile web preview', () => {
  it('preserves interactive content without exposing device artwork', () => {
    const { container, rerender } = render(
      <PhoneFrame className='preview-placement'>
        <Link href='/artist'>View artist</Link>
      </PhoneFrame>
    );
    expect(screen.getByRole('link', { name: 'View artist' })).toHaveAttribute(
      'href',
      '/artist'
    );
    expect(container.firstElementChild).toHaveClass('preview-placement');
    expect(screen.queryByRole('img', { hidden: true })).toBeNull();

    rerender(<PhoneFrame>Updated profile</PhoneFrame>);
    expect(screen.getByText('Updated profile')).toBeInTheDocument();
    expect(screen.queryByRole('link')).toBeNull();
  });
});

// Axe coverage for each state the frame renders.
describe('PhoneFrame states', () => {
  it('renders the default preview without violations', async () => {
    const { container } = render(
      <PhoneFrame>
        <p>Profile preview</p>
      </PhoneFrame>
    );

    expect(container.firstElementChild).toHaveClass('w-71');
    expect(
      container.querySelector('[data-device="mobile-web"]')
    ).not.toBeNull();
    await expectNoA11yViolations(container);
  });

  it('keeps every row of a page taller than the frame', async () => {
    const { container } = render(
      <PhoneFrame>
        <ul>
          {Array.from({ length: 30 }, (_, i) => `Link ${i + 1}`).map(label => (
            <li key={label}>{label}</li>
          ))}
        </ul>
      </PhoneFrame>
    );

    expect(screen.getAllByRole('listitem')).toHaveLength(30);
    await expectNoA11yViolations(container);
  });

  it('keeps interactive content inside a right-to-left page', async () => {
    const { container } = render(
      <div dir='rtl' lang='ar'>
        <PhoneFrame>
          <Link href='/artist'>View artist</Link>
        </PhoneFrame>
      </div>
    );

    expect(
      screen.getByRole('link', { name: 'View artist' })
    ).toBeInTheDocument();
    await expectNoA11yViolations(container);
  });
});
