import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { expectNoA11yViolations } from '@/tests/utils/a11y';
import { HomepagePrimaryAction } from './HomepagePrimaryAction';

const { mockPush, mockSearch, mockClear } = vi.hoisted(() => ({
  mockPush: vi.fn(),
  mockSearch: vi.fn(),
  mockClear: vi.fn(),
}));

Element.prototype.scrollIntoView = vi.fn();

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: mockPush }),
}));
vi.mock('@/lib/analytics', () => ({ track: vi.fn(), page: vi.fn() }));
vi.mock('@/lib/queries/useArtistSearchQuery', () => ({
  useArtistSearchQuery: () => ({
    results: [],
    state: 'idle',
    search: mockSearch,
    searchImmediate: vi.fn(),
    clear: mockClear,
  }),
}));

function renderAction() {
  return render(
    <HomepagePrimaryAction
      appearance='editorial'
      placeholder='Search your name'
      submitLabel='Find me'
      submitTestId='homepage-primary-cta'
    />
  );
}

describe('HomepagePrimaryAction certificate', () => {
  beforeEach(() => {
    mockPush.mockClear();
    mockSearch.mockClear();
    mockClear.mockClear();
  });

  it('renders the name search as the one primary action, axe-clean', async () => {
    const { container } = renderAction();

    expect(screen.getByRole('combobox')).toHaveAccessibleName(
      'Search your name'
    );
    expect(screen.getByTestId('homepage-primary-cta')).toHaveTextContent(
      'Find me'
    );
    expect(
      screen.queryByRole('link', { name: 'Request access' })
    ).not.toBeInTheDocument();
    await expectNoA11yViolations(container);
  });

  it('searches as the visitor types and keeps the typed name', async () => {
    const user = userEvent.setup();
    const { container } = renderAction();
    const input = screen.getByRole('combobox');

    await user.type(input, 'Taylor');

    expect(input).toHaveValue('Taylor');
    expect(mockSearch).toHaveBeenLastCalledWith('Taylor');
    await expectNoA11yViolations(container);
  });

  it('moves focus to the field when the empty submit is pressed', async () => {
    const user = userEvent.setup();
    renderAction();
    const input = screen.getByRole('combobox');
    input.blur();

    await user.click(screen.getByRole('button', { name: 'Find me' }));

    expect(input).toHaveFocus();
    expect(mockPush).not.toHaveBeenCalled();
  });

  it('keeps a right-to-left placeholder as the accessible name', async () => {
    const { container } = render(
      <div dir='rtl' lang='ar'>
        <HomepagePrimaryAction
          appearance='editorial'
          placeholder='ابحث عن اسمك'
          submitLabel='ابحث'
        />
      </div>
    );

    expect(screen.getByRole('combobox')).toHaveAccessibleName('ابحث عن اسمك');
    await expectNoA11yViolations(container);
  });
});
