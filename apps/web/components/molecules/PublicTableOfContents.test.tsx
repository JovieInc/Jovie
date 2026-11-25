import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { expectNoA11yViolations } from '@/tests/utils/a11y';
import { PublicTableOfContents } from './PublicTableOfContents';

const toc = [
  { id: 'one', title: 'One', level: 2 },
  { id: 'two', title: 'Two', level: 3 },
  { id: 'three', title: 'Three', level: 2 },
];

describe('PublicTableOfContents', () => {
  afterEach(() => {
    document.body.innerHTML = '';
    vi.restoreAllMocks();
  });

  it('renders nothing for an empty list', () => {
    const { container } = render(<PublicTableOfContents toc={[]} />);

    expect(container).toBeEmptyDOMElement();
  });

  it('lists the headings in a labelled navigation landmark', async () => {
    const { container } = render(<PublicTableOfContents toc={toc} />);

    expect(
      screen.getByRole('navigation', { name: 'Table of contents' })
    ).toBeInTheDocument();
    expect(screen.getAllByRole('button')).toHaveLength(3);
    await expectNoA11yViolations(container);
  });

  it('scrolls to a heading and marks it current when pressed', async () => {
    const user = userEvent.setup();
    const scrollIntoView = vi.fn();
    const target = document.createElement('h2');
    target.id = 'two';
    target.scrollIntoView = scrollIntoView;
    document.body.append(target);
    const { container } = render(<PublicTableOfContents toc={toc} />);

    await user.click(screen.getByRole('button', { name: 'Two' }));

    expect(scrollIntoView).toHaveBeenCalledWith({
      behavior: 'smooth',
      block: 'start',
    });
    expect(screen.getByRole('button', { name: 'Two' })).toHaveAttribute(
      'aria-current',
      'location'
    );
    await expectNoA11yViolations(container);
  });

  it('moves focus with the arrow keys', async () => {
    const user = userEvent.setup();
    render(<PublicTableOfContents toc={toc} />);
    const [first, second] = screen.getAllByRole('button');

    first.focus();
    await user.keyboard('{ArrowDown}');
    expect(second).toHaveFocus();
    await user.keyboard('{ArrowUp}');
    expect(first).toHaveFocus();
  });

  it('keeps the nav item focus ring instead of adding a second one', () => {
    render(<PublicTableOfContents toc={toc} />);

    for (const button of screen.getAllByRole('button')) {
      expect(button).toHaveAttribute('type', 'button');
      expect(button).toHaveClass('public-doc-nav-item');
      expect(button.className).not.toContain('focus-visible:ring-2');
    }
  });
});
