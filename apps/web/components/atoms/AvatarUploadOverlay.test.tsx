import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { expectNoA11yViolations } from '@/tests/utils/a11y';
import { AvatarUploadOverlay } from './AvatarUploadOverlay';

describe('AvatarUploadOverlay', () => {
  it('preserves the default person radius across hover and drag states', () => {
    const { rerender } = render(<AvatarUploadOverlay iconSize={20} />);

    const hoverOverlay = screen.getByTestId('avatar-uploadable-hover-overlay');
    expect(hoverOverlay).toHaveClass('absolute', 'inset-0', 'rounded-full');
    expect(hoverOverlay).toHaveAttribute('aria-hidden', 'true');

    rerender(<AvatarUploadOverlay iconSize={20} isDragOver />);

    const dragOverlay = screen.getByTestId('avatar-uploadable-drag-overlay');
    expect(dragOverlay).toHaveClass('absolute', 'inset-0', 'rounded-full');
    expect(dragOverlay).toHaveAttribute('aria-hidden', 'true');
  });

  it('uses the supplied artwork radius without reintroducing a circular mask', () => {
    render(
      <AvatarUploadOverlay
        iconSize={20}
        isDragOver
        shapeClassName='rounded-lg'
      />
    );

    const overlay = screen.getByTestId('avatar-uploadable-drag-overlay');
    expect(overlay).toHaveClass('rounded-lg');
    expect(overlay).not.toHaveClass('rounded-full');
  });
});

describe('AvatarUploadOverlay accessibility', () => {
  it.each([
    ['hover', {}],
    ['drag over', { isDragOver: true }],
    ['artwork drag over', { isDragOver: true, shapeClassName: 'rounded-lg' }],
  ])(
    'stays out of the accessibility tree in the %s state',
    async (_label, props) => {
      const { container } = render(
        <button type='button' aria-label='Upload photo' className='relative'>
          <AvatarUploadOverlay iconSize={20} {...props} />
        </button>
      );
      expect(
        screen.getByRole('button', { name: 'Upload photo' })
      ).toBeVisible();
      await expectNoA11yViolations(container);
    }
  );
});
