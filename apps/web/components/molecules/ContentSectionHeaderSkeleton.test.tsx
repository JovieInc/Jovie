import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { expectNoA11yViolations } from '@/tests/utils/a11y';
import { ContentSectionHeaderSkeleton } from './ContentSectionHeaderSkeleton';

describe('ContentSectionHeaderSkeleton', () => {
  it('paints only the title and description lines with no actions', async () => {
    const { container } = render(
      <ContentSectionHeaderSkeleton titleWidth='w-48' descriptionWidth='w-72' />
    );

    const header = container.firstElementChild as HTMLElement;
    expect(header).toHaveAttribute('aria-hidden', 'true');
    expect(header.children).toHaveLength(1);
    expect(header.querySelector('.w-48')).not.toBeNull();
    expect(header.querySelector('.w-72')).not.toBeNull();
    await expectNoA11yViolations(container);
  });

  it('keys repeated action widths uniquely and paints one block per action', async () => {
    const { container } = render(
      <ContentSectionHeaderSkeleton
        actionWidths={['w-20', 'w-20', 'w-8']}
        actionsClassName='gap-3'
      />
    );

    const header = container.firstElementChild as HTMLElement;
    const actions = header.children[1] as HTMLElement;
    expect(actions).toHaveClass('gap-3');
    expect(actions.children).toHaveLength(3);
    expect(actions.querySelectorAll('.w-20')).toHaveLength(2);
    await expectNoA11yViolations(container);
  });
});
