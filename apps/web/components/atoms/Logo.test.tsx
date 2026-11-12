import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { expectNoA11yViolations } from '@/tests/utils/a11y';
import { Logo } from './Logo';

describe('Logo', () => {
  it('renders an accessible wordmark using the requested size', () => {
    render(<Logo size='xl' tone='color' />);

    const wordmark = screen.getByRole('img', { name: 'Jovie logo' });
    expect(wordmark).toHaveClass('h-16', 'w-auto');
    expect(wordmark).toHaveAttribute('data-wordmark-master', 'display');
    expect(wordmark.querySelectorAll('path')).toHaveLength(5);
  });

  it('draws the same construction wordmark for word and wordAlt', () => {
    const { container } = render(
      <>
        <Logo variant='word' size='md' />
        <Logo variant='wordAlt' size='md' />
      </>
    );
    const [word, alt] = container.querySelectorAll('svg');
    expect(word.innerHTML).toBe(alt.innerHTML);
  });

  it('uses the Text master below 24 px', () => {
    render(<Logo size='xs' />);
    expect(screen.getByRole('img', { name: 'Jovie logo' })).toHaveAttribute(
      'data-wordmark-master',
      'text'
    );
  });

  it('applies a named marketing mark size without changing the ordinary icon scale', () => {
    const { rerender } = render(
      <Logo variant='icon' size='sm' markSize='marketing' />
    );
    const assertMarkSize = (size: string) => {
      const icon = screen.getByRole('img', { name: 'Jovie' });
      expect(icon).toHaveAttribute('width', size);
      expect(icon).toHaveAttribute('height', size);
      expect(icon.parentElement).toHaveAttribute('data-brand-mark-size', size);
    };
    assertMarkSize('28');
    rerender(<Logo variant='icon' size='sm' />);
    assertMarkSize('20');
  });

  it('renders the icon variant through the canonical brand mark', () => {
    render(<Logo variant='icon' size='lg' tone='muted' />);

    const icon = screen.getByRole('img', { name: 'Jovie' });
    expect(icon).toHaveAttribute('width', '32');
    expect(icon).toHaveAttribute('height', '32');
    expect(icon.parentElement).toHaveAttribute('data-brand-mark-size', '32');
    expect(icon.parentElement).toHaveClass('text-muted-foreground/50');
  });

  it('paints the white tone with the on-media token in both themes', async () => {
    const { container } = render(<Logo tone='white' />);

    const wordmark = screen.getByRole('img', { name: 'Jovie logo' });
    expect(wordmark).toHaveClass('text-on-media');
    expect(wordmark).not.toHaveClass('text-white');
    expect(wordmark.getAttribute('style')).toBeNull();
    await expectNoA11yViolations(container);
  });

  it('inks the default wordmark with the primary text token', async () => {
    const { container } = render(<Logo />);

    const wordmark = screen.getByRole('img', { name: 'Jovie logo' });
    expect(wordmark).toHaveClass('h-8', 'w-auto');
    expect(wordmark.getAttribute('style')).toContain(
      'var(--linear-text-primary, currentColor)'
    );
    expect(wordmark).toHaveAttribute('fill', 'currentColor');
    await expectNoA11yViolations(container);
  });

  it('draws full and fullAlt as the single wordmark, never mark plus wordmark', () => {
    const { container } = render(
      <>
        <Logo variant='full' data-testid='full' />
        <Logo variant='fullAlt' data-testid='full-alt' />
      </>
    );

    expect(container.querySelectorAll('svg')).toHaveLength(2);
    expect(screen.getByTestId('full')).toHaveAttribute('role', 'img');
    expect(screen.getByTestId('full-alt').innerHTML).toBe(
      screen.getByTestId('full').innerHTML
    );
  });

  it('hides a decorative wordmark and icon from assistive technology', async () => {
    const { container } = render(
      <>
        <Logo aria-hidden size='xs' data-testid='word' />
        <Logo aria-hidden variant='icon' data-testid='icon' />
      </>
    );

    const word = screen.getByTestId('word');
    expect(word).toHaveAttribute('aria-hidden', 'true');
    expect(word).not.toHaveAttribute('role');
    expect(word).not.toHaveAttribute('aria-label');
    expect(screen.queryByRole('img')).not.toBeInTheDocument();
    await expectNoA11yViolations(container);
  });

  it('passes className through to the wordmark and the icon', () => {
    render(
      <>
        <Logo className='shrink-0' data-testid='word' />
        <Logo variant='icon' className='shrink-0' data-testid='icon' />
      </>
    );

    expect(screen.getByTestId('word')).toHaveClass('shrink-0');
    expect(
      screen.getByRole('img', { name: 'Jovie' }).parentElement
    ).toHaveClass('shrink-0');
  });

  it('has no axe violations in a long right-to-left row', async () => {
    const { container } = render(
      <div dir='rtl' className='flex w-64 items-center gap-3'>
        <Logo size='sm' />
        <span className='min-w-0 truncate text-sm'>
          جلسات منتصف الليل، الإصدار الثاني الفاخر الممتد
        </span>
      </div>
    );

    expect(screen.getByRole('img', { name: 'Jovie logo' })).toHaveClass('h-6');
    await expectNoA11yViolations(container);
  });
});
