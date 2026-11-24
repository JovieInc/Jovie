import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import {
  AppTableCellContent,
  AppTableMediaCell,
  AppTableNumericCell,
  AppTableTextCell,
} from './AppTableCellContent';
import { APP_TABLE_MEDIA_SIZE } from './app-table-row';

describe('AppTableCellContent', () => {
  it('uses the shared flex center host', () => {
    const { container } = render(
      <AppTableCellContent>Title</AppTableCellContent>
    );
    const host = container.firstElementChild;
    expect(host).toHaveAttribute('data-table-cell-content', 'stable');
    expect(host).toHaveAttribute('data-app-table-cell', 'content');
    expect(host).toHaveClass('flex', 'items-center');
  });

  it('sizes media boxes to the dense token', () => {
    const { container } = render(
      <AppTableMediaCell size={APP_TABLE_MEDIA_SIZE.dense} />
    );
    const host = container.firstElementChild as HTMLElement;
    expect(host.style.width).toBe('24px');
    expect(host.style.height).toBe('24px');
    expect(host).toHaveAttribute('data-app-table-cell', 'media');
  });

  it('copies pasteable text on click without bubbling', () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    const clipboard = { writeText };
    vi.stubGlobal('navigator', { clipboard });
    const parentClick = vi.fn();

    const { container } = render(
      <AppTableTextCell copyValue='Take Me Over' copyLabel='Title'>
        Take Me Over
      </AppTableTextCell>
    );

    const button = screen.getByRole('button', { name: /Copy Title/i });
    expect(button).toHaveAttribute('aria-label', 'Copy Title: Take Me Over');
    // Capture on the render host — proves stopPropagation without nested controls.
    container.addEventListener('click', parentClick);
    fireEvent.click(button);
    expect(writeText).toHaveBeenCalledWith('Take Me Over');
    expect(parentClick).not.toHaveBeenCalled();
    container.removeEventListener('click', parentClick);
    vi.unstubAllGlobals();
  });

  it('right-aligns numeric cells with tabular nums', () => {
    render(<AppTableNumericCell>20:01</AppTableNumericCell>);
    const cell = screen.getByText('20:01');
    expect(cell).toHaveClass('text-right', 'tabular-nums');
    expect(cell).toHaveAttribute('data-app-table-cell', 'numeric');
  });
});
