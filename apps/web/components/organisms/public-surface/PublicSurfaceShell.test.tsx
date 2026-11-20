import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { expectNoA11yViolations } from '@/tests/utils/a11y';
import { PublicSurfaceShell } from './PublicSurfaceShell';

vi.mock('next/image', () => ({
  default: (props: { readonly alt: string; readonly className?: string }) => (
    <img alt={props.alt} className={props.className} />
  ),
}));

const scrim = (container: HTMLElement) =>
  container.querySelector('.bg-\\(image\\:--public-surface-ambient-scrim\\)');

describe('PublicSurfaceShell', () => {
  it('blurs the ambient artwork behind the token scrim and hides it from assistive tech', async () => {
    const { container } = render(
      <PublicSurfaceShell ambientMediaUrl='/art.jpg' backgroundPattern='grid'>
        <h1>Tim White</h1>
      </PublicSurfaceShell>
    );

    const ambient = container.querySelector('[aria-hidden="true"]');
    expect(ambient?.querySelector('img')).toHaveClass('blur-[84px]');
    expect(ambient?.querySelector('img')).toHaveAttribute('alt', '');
    expect(scrim(container)).not.toBeNull();
    // Ambient media wins over the pattern and glows.
    expect(container.querySelectorAll('[aria-hidden="true"]')).toHaveLength(1);
    expect(container.firstElementChild).toHaveClass(
      'profile-viewport',
      'bg-base'
    );
    await expectNoA11yViolations(container);
  });

  it('falls back to the pattern and glows when there is no artwork (partial)', async () => {
    const { container } = render(
      <PublicSurfaceShell
        ambientMediaUrl={null}
        backgroundPattern='dots'
        showGradientBlurs
      >
        <h1>Tim White</h1>
      </PublicSurfaceShell>
    );

    expect(screen.queryByRole('img')).toBeNull();
    expect(scrim(container)).toBeNull();
    expect(
      container.querySelector('.bg-\\(image\\:--background-pattern-dots\\)')
    ).not.toBeNull();
    expect(
      container.querySelectorAll('.bg-\\(--profile-stage-glow-a\\)')
    ).toHaveLength(1);
    await expectNoA11yViolations(container);
  });

  it('renders children alone by default', async () => {
    const { container } = render(
      <PublicSurfaceShell className='overflow-y-auto'>
        <h1>Tim White</h1>
      </PublicSurfaceShell>
    );

    const shell = container.firstElementChild as HTMLElement;
    expect(shell).toHaveClass('overflow-y-auto');
    expect(shell.children).toHaveLength(1);
    await expectNoA11yViolations(container);
  });

  it('keeps tall content inside the shell without axe violations', async () => {
    const rows = Array.from({ length: 24 }, (_, i) => `Tour date ${i + 1}`);
    const { container } = render(
      <PublicSurfaceShell
        ambientMediaUrl='/art.jpg'
        className='overflow-y-auto'
      >
        {rows.map(row => (
          <p key={row}>{row}</p>
        ))}
      </PublicSurfaceShell>
    );

    expect(container.querySelectorAll('p')).toHaveLength(24);
    await expectNoA11yViolations(container);
  });

  it('renders in a right-to-left page without axe violations', async () => {
    const { container } = render(
      <div dir='rtl' lang='ar'>
        <PublicSurfaceShell ambientMediaUrl='/art.jpg'>
          <p>محتوى الملف الشخصي</p>
        </PublicSurfaceShell>
      </div>
    );

    expect(screen.getByText('محتوى الملف الشخصي')).toBeInTheDocument();
    await expectNoA11yViolations(container);
  });
});
