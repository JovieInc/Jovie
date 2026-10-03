import { render, screen } from '@testing-library/react';
import Link from 'next/link';
import { describe, expect, it } from 'vitest';
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
