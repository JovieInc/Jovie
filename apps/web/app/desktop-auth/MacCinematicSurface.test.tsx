import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { expectNoA11yViolations } from '@/tests/utils/a11y';
import { MacCinematicSurface } from './MacCinematicSurface';

describe('MacCinematicSurface', () => {
  it('renders one main landmark that carries the handoff state and shell kind', async () => {
    const { container } = render(
      <MacCinematicSurface
        state='opened'
        testId='surface'
        shellKind='desktop-return-handoff'
      >
        <h1>Finish Signing In</h1>
      </MacCinematicSurface>
    );

    const main = screen.getByRole('main');
    expect(main).toBe(screen.getByTestId('surface'));
    expect(main).toHaveAttribute('data-desktop-auth-state', 'opened');
    expect(main).toHaveAttribute(
      'data-auth-shell-kind',
      'desktop-return-handoff'
    );
    expect(main).toHaveAttribute('data-mac-cinematic-shell', 'auth-handoff');
    expect(
      screen.getByRole('heading', { name: 'Finish Signing In' })
    ).toBeInTheDocument();
    await expectNoA11yViolations(container);
  });

  it('keeps the backdrop and corner mark out of the accessibility tree', async () => {
    const { container } = render(
      <MacCinematicSurface state='idle' testId='surface'>
        <p>Continue in your browser, then return to Jovie.</p>
      </MacCinematicSurface>
    );

    const main = screen.getByTestId('surface');
    expect(main).not.toHaveAttribute('data-auth-shell-kind');
    const decorative = main.querySelectorAll(':scope > [aria-hidden]');
    expect(decorative).toHaveLength(3);
    const cornerMark = main.querySelector('[data-mac-corner-mark]');
    expect(cornerMark).toHaveAttribute('aria-hidden');
    expect(cornerMark).toHaveClass('pointer-events-none', 'opacity-35');
    expect(screen.queryByRole('img')).not.toBeInTheDocument();
    await expectNoA11yViolations(container);
  });

  it('holds long and right-to-left content without clipping it horizontally', async () => {
    const longCopy = 'Continue in your browser, then return to Jovie. '.repeat(
      12
    );
    const { container } = render(
      <MacCinematicSurface state='error' testId='surface'>
        <section dir='rtl' lang='ar'>
          <h1>أكمل تسجيل الدخول</h1>
          <p>{longCopy}</p>
        </section>
      </MacCinematicSurface>
    );

    const main = screen.getByTestId('surface');
    expect(main).toHaveClass('overflow-x-hidden', 'min-h-dvh');
    expect(main).toHaveAttribute('data-desktop-auth-state', 'error');
    expect(
      screen.getByRole('heading', { name: 'أكمل تسجيل الدخول' })
    ).toBeInTheDocument();
    expect(main).toHaveTextContent(longCopy.trim());
    await expectNoA11yViolations(container);
  });
});
