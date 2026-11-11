import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { expectNoA11yViolations } from '@/tests/utils/a11y';
import { PublicSurfaceStage } from './PublicSurfaceStage';

describe('PublicSurfaceStage', () => {
  it('renders the card inside one main landmark with the panel gradient behind it', async () => {
    const { container } = render(
      <PublicSurfaceStage className='stage-x' panelClassName='panel-x'>
        <h1>Tim White</h1>
      </PublicSurfaceStage>
    );

    expect(container.firstElementChild).toHaveClass('min-h-dvh', 'stage-x');
    const main = screen.getByRole('main');
    const panel = main.firstElementChild as HTMLElement;
    expect(panel).toHaveClass('panel-x', 'overflow-clip');
    expect(panel.firstElementChild).toHaveClass('pointer-events-none');
    expect(panel).toContainElement(screen.getByRole('heading'));
    await expectNoA11yViolations(container);
  });

  it('renders the after-panel footer below the card, outside it', async () => {
    const { container } = render(
      <PublicSurfaceStage afterPanel={<p>Powered by Jovie</p>}>
        <h1>Tim White</h1>
      </PublicSurfaceStage>
    );

    const main = screen.getByRole('main');
    expect(main.children).toHaveLength(2);
    expect(main.lastElementChild).toHaveTextContent('Powered by Jovie');
    expect(main.firstElementChild).not.toHaveTextContent('Powered by Jovie');
    await expectNoA11yViolations(container);
  });

  it('lets tall content grow the stage instead of fixing its height', async () => {
    const { container } = render(
      <PublicSurfaceStage>
        {Array.from({ length: 24 }, (_, index) => `Tour date ${index + 1}`).map(
          row => (
            <p key={row}>{row}</p>
          )
        )}
      </PublicSurfaceStage>
    );

    const stage = container.firstElementChild as HTMLElement;
    expect(stage.className).not.toMatch(/(^|\s)h-dvh(\s|$)/);
    expect(screen.getByRole('main').querySelectorAll('p')).toHaveLength(24);
    await expectNoA11yViolations(container);
  });

  it('keeps one main landmark in a right-to-left page', async () => {
    const { container } = render(
      <div dir='rtl' lang='ar'>
        <PublicSurfaceStage afterPanel={<p>Jovie</p>}>
          <p>محتوى بطاقة الملف الشخصي</p>
        </PublicSurfaceStage>
      </div>
    );

    expect(screen.getAllByRole('main')).toHaveLength(1);
    await expectNoA11yViolations(container);
  });
});
