import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { expectNoA11yViolations } from '@/tests/utils/a11y';
import { PublicSurfaceHeader } from './PublicSurfaceHeader';

const back = <button type='button'>Back</button>;
const share = <button type='button'>Share</button>;

describe('PublicSurfaceHeader', () => {
  it('keeps both slot wrappers and drops the center slot when it has no content', async () => {
    const { container } = render(<PublicSurfaceHeader />);

    const bar = container.firstElementChild as HTMLElement;
    expect(bar).toHaveClass('justify-between');
    expect(bar.children).toHaveLength(2);
    expect(bar.querySelector('.flex-1')).toBeNull();
    await expectNoA11yViolations(container);
  });

  it('renders only the left control when the right slot is absent', async () => {
    const { container } = render(<PublicSurfaceHeader leftSlot={back} />);

    const bar = container.firstElementChild as HTMLElement;
    expect(bar.firstElementChild).toContainElement(
      screen.getByRole('button', { name: 'Back' })
    );
    expect(bar.lastElementChild).toBeEmptyDOMElement();
    await expectNoA11yViolations(container);
  });

  it('places a long title between both controls in reading order', async () => {
    const title =
      'Never Say A Word (Extended Club Mix) feat. The Los Angeles After Hours Orchestra';
    const { container } = render(
      <PublicSurfaceHeader leftSlot={back} rightSlot={share} className='px-3'>
        <p className='truncate'>{title}</p>
      </PublicSurfaceHeader>
    );

    const bar = container.firstElementChild as HTMLElement;
    expect(bar).toHaveClass('px-3');
    expect(bar.children[1]).toHaveClass('flex-1');
    expect(bar.children[1]).toHaveTextContent(title);
    expect(bar.textContent).toBe(`Back${title}Share`);
    await expectNoA11yViolations(container);
  });

  it('keeps the same slot order in a right-to-left page', async () => {
    const { container } = render(
      <div dir='rtl' lang='ar'>
        <PublicSurfaceHeader leftSlot={back} rightSlot={share}>
          <p>منتصف الليل</p>
        </PublicSurfaceHeader>
      </div>
    );

    expect(screen.getAllByRole('button').map(b => b.textContent)).toEqual([
      'Back',
      'Share',
    ]);
    await expectNoA11yViolations(container);
  });
});
