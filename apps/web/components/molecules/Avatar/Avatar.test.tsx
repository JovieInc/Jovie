import { fireEvent, render, screen } from '@testing-library/react';
import type { ImgHTMLAttributes } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { expectNoA11yViolations } from '@/tests/utils/a11y';
import { Avatar } from './Avatar';

// next/image needs the Next runtime loader; a plain <img> keeps the real
// onLoad/onError wiring that drives the shimmer and the initials fallback.
vi.mock('next/image', () => ({
  default: ({
    priority: _priority,
    quality: _quality,
    blurDataURL: _blurDataURL,
    placeholder: _placeholder,
    unoptimized,
    ...props
  }: ImgHTMLAttributes<HTMLImageElement> & {
    priority?: boolean;
    quality?: number;
    blurDataURL?: string;
    placeholder?: string;
    unoptimized?: boolean;
  }) => (
    <img
      {...props}
      alt={props.alt}
      data-testid='avatar-image'
      data-unoptimized={unoptimized ? 'true' : 'false'}
    />
  ),
}));

const SRC = 'https://example.com/avatar.jpg';

describe('Avatar', () => {
  it('names the avatar once and hides the inner image from assistive tech', async () => {
    const { container } = render(
      <Avatar src={SRC} alt='Tim White' name='Tim White' size='lg' />
    );

    expect(screen.getByRole('img', { name: 'Tim White' })).toBeInTheDocument();
    expect(screen.getByTestId('avatar-image')).toHaveAttribute('alt', '');
    expect(screen.getByTestId('avatar-image')).toHaveAttribute(
      'aria-hidden',
      'true'
    );
    await expectNoA11yViolations(container);
  });

  it('shows a shimmer while loading and reveals the image once it loads', async () => {
    const { container } = render(
      <Avatar src={SRC} alt='Tim White' name='Tim White' />
    );

    const image = screen.getByTestId('avatar-image');
    expect(image).toHaveClass('opacity-0');
    expect(container.querySelector('.skeleton')).not.toBeNull();
    await expectNoA11yViolations(container);

    fireEvent.load(image);

    expect(image).toHaveClass('opacity-100');
    expect(container.querySelector('.skeleton')).toBeNull();
  });

  it('falls back to initials in the same frame when the image fails', async () => {
    const { container } = render(
      <Avatar src={SRC} alt='Tim White' name='Tim White' size='lg' />
    );
    const frame = container.querySelector('[data-slot="app-avatar-frame"]');
    const widthBefore = (frame as HTMLElement).style.width;

    fireEvent.error(screen.getByTestId('avatar-image'));

    expect(screen.queryByTestId('avatar-image')).not.toBeInTheDocument();
    expect(screen.getByText('TW')).toBeInTheDocument();
    expect(
      (container.querySelector('[data-slot="app-avatar-frame"]') as HTMLElement)
        .style.width
    ).toBe(widthBefore);
    await expectNoA11yViolations(container);
  });

  it('starts a fresh load when the source changes after a failure', () => {
    const { rerender } = render(
      <Avatar src={SRC} alt='Tim White' name='Tim White' />
    );
    fireEvent.error(screen.getByTestId('avatar-image'));
    expect(screen.getByText('TW')).toBeInTheDocument();

    rerender(
      <Avatar
        src='https://example.com/avatar-2.jpg'
        alt='Tim White'
        name='Tim White'
      />
    );

    expect(screen.getByTestId('avatar-image')).toHaveAttribute(
      'src',
      'https://example.com/avatar-2.jpg'
    );
  });

  it('renders a question mark when neither image nor name is known', async () => {
    const { container } = render(<Avatar src={null} alt='Unknown artist' />);

    expect(
      screen.getByRole('img', { name: 'Unknown artist' })
    ).toHaveTextContent('?');
    await expectNoA11yViolations(container);
  });

  it('keeps long names to two initials', () => {
    render(
      <Avatar
        alt='Maria Fernanda de la Cruz Hernández Villanueva'
        name='Maria Fernanda de la Cruz Hernández Villanueva'
      />
    );

    expect(
      screen.getByRole('img', {
        name: 'Maria Fernanda de la Cruz Hernández Villanueva',
      })
    ).toHaveTextContent(/^MV$/);
  });

  it('is decorative when alt is empty', async () => {
    const { container } = render(<Avatar alt='' name='Tim White' />);

    expect(screen.queryByRole('img')).not.toBeInTheDocument();
    expect(container.querySelector('[data-slot="app-avatar"]')).toHaveAttribute(
      'aria-hidden',
      'true'
    );
    await expectNoA11yViolations(container);
  });

  it('adds the verified badge to person avatars only', () => {
    const { rerender } = render(
      <Avatar alt='Tim White' name='Tim White' verified />
    );
    expect(
      screen.getByRole('img', { name: 'Verified Jovie Profile' })
    ).toBeInTheDocument();

    rerender(
      <Avatar
        alt='Release artwork'
        name='Night Drive'
        shape='artwork'
        verified
      />
    );
    expect(
      screen.queryByRole('img', { name: 'Verified Jovie Profile' })
    ).not.toBeInTheDocument();
  });

  it('has no axe violations for a verified right-to-left name', async () => {
    const { container } = render(
      <div dir='rtl'>
        <Avatar
          alt='فرقة الأصوات العربية'
          name='فرقة الأصوات العربية'
          verified
        />
      </div>
    );

    expect(
      screen.getByRole('img', { name: 'فرقة الأصوات العربية' })
    ).toHaveTextContent('فا');
    await expectNoA11yViolations(container);
  });
});
