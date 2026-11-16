import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { expectNoA11yViolations } from '@/tests/utils/a11y';
import type { TocEntry } from '@/types/docs';
import { LegalSidebar } from './LegalSidebar';

const toc: TocEntry[] = [
  { id: 'overview', title: 'Overview', level: 2 },
  { id: 'scope', title: 'Scope', level: 3 },
  { id: 'contact', title: 'Contact us', level: 2 },
];

function renderWithHeadings(entries: TocEntry[] = toc) {
  return render(
    <>
      <LegalSidebar toc={entries} className='w-56' />
      {entries.map(entry => (
        <h2 key={entry.id} id={entry.id}>
          {entry.title}
        </h2>
      ))}
    </>
  );
}

describe('LegalSidebar', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    globalThis.history.replaceState(null, '', '/');
  });

  it('renders a labelled document navigation with one button per entry', async () => {
    const { container } = renderWithHeadings();

    const nav = screen.getByRole('navigation', { name: 'Document navigation' });
    expect(nav).toHaveClass('space-y-1', 'w-56');
    expect(screen.getByText('On this page')).toBeVisible();
    expect(
      screen.getAllByRole('button').map(button => button.textContent)
    ).toEqual(['Overview', 'Scope', 'Contact us']);
    expect(screen.getByRole('button', { name: 'Scope' })).toHaveClass(
      'public-doc-nav-item-nested'
    );
    await expectNoA11yViolations(container);
  });

  it('jumps to a section on click and marks it as the current location', async () => {
    const user = userEvent.setup();
    const scrollIntoView = vi.fn();
    Element.prototype.scrollIntoView = scrollIntoView;
    renderWithHeadings();

    const contact = screen.getByRole('button', { name: 'Contact us' });
    await user.click(contact);

    expect(scrollIntoView).toHaveBeenCalledWith({
      behavior: 'smooth',
      block: 'start',
    });
    expect(globalThis.location.hash).toBe('#contact');
    expect(contact).toHaveAttribute('aria-current', 'location');
  });

  it('moves focus between entries with the arrow keys', async () => {
    const user = userEvent.setup();
    renderWithHeadings();

    const overview = screen.getByRole('button', { name: 'Overview' });
    const scope = screen.getByRole('button', { name: 'Scope' });
    overview.focus();
    await user.keyboard('{ArrowDown}');
    expect(scope).toHaveFocus();
    await user.keyboard('{ArrowUp}');
    expect(overview).toHaveFocus();
    await user.keyboard('{ArrowUp}');
    expect(overview).toHaveFocus();
  });

  it('renders nothing when the document has no headings', async () => {
    const { container } = render(<LegalSidebar toc={[]} />);

    expect(screen.queryByRole('navigation')).toBeNull();
    expect(container).toBeEmptyDOMElement();
    await expectNoA11yViolations(container);
  });
});
