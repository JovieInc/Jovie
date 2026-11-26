import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { expectNoA11yViolations } from '@/tests/utils/a11y';
import type { Artist } from '@/types/db';
import { SocialsForm } from './SocialsForm';
import type { SocialLink, UseSocialsFormReturn } from './types';

const formState = vi.hoisted(() => ({ current: null as unknown }));
const suggestionState = vi.hoisted(() => ({
  suggestions: [] as unknown[],
  isLoading: false,
}));

vi.mock('next-themes', () => ({
  useTheme: () => ({ resolvedTheme: 'light' }),
}));

vi.mock('./useSocialsForm', () => ({
  PRIMARY_DSP_IDS: new Set(['spotify', 'apple_music']),
  useSocialsForm: () => formState.current,
}));

vi.mock('./useSocialLinkSuggestions', () => ({
  useSocialLinkSuggestions: () => ({
    suggestions: suggestionState.suggestions,
    isLoading: suggestionState.isLoading,
    actioningId: null,
    confirm: vi.fn(),
    dismiss: vi.fn(),
  }),
}));

const ARTIST = { id: 'artist-1' } as Artist;

function makeForm(
  overrides: Partial<UseSocialsFormReturn> = {}
): UseSocialsFormReturn {
  return {
    loading: false,
    error: undefined,
    success: false,
    socialLinks: [],
    handleSubmit: vi.fn((event: { preventDefault: () => void }) =>
      event.preventDefault()
    ),
    removeSocialLink: vi.fn(),
    updateSocialLink: vi.fn(),
    scheduleNormalize: vi.fn(),
    handleUrlBlur: vi.fn(),
    addSocialLink: vi.fn(),
    verifyWebsite: vi.fn(),
    verifyingLinkId: null,
    verificationError: null,
    clearVerificationError: vi.fn(),
    ...overrides,
  } as UseSocialsFormReturn;
}

const LINK: SocialLink = {
  id: 'l1',
  platform: 'instagram',
  url: 'https://instagram.com/demo',
};

describe('SocialsForm', () => {
  beforeEach(() => {
    suggestionState.suggestions = [];
    suggestionState.isLoading = false;
    formState.current = makeForm();
  });

  it('adds the first link from the empty state', async () => {
    const user = userEvent.setup();
    const form = makeForm();
    formState.current = form;
    const { container } = render(<SocialsForm artist={ARTIST} />);

    await user.click(screen.getByRole('button', { name: 'Add Link' }));

    expect(form.addSocialLink).toHaveBeenCalledOnce();
    await expectNoA11yViolations(container);
  });

  it('shows a skeleton while loading and no form controls', async () => {
    formState.current = makeForm({ loading: true });
    const { container } = render(<SocialsForm artist={ARTIST} />);

    expect(screen.queryByTestId('socials-form')).toBeNull();
    expect(screen.queryByRole('button')).toBeNull();
    await expectNoA11yViolations(container);
  });

  it('keeps typed value and focus across a parent rerender, and removes a row', async () => {
    const user = userEvent.setup();
    const form = makeForm({ socialLinks: [LINK] });
    formState.current = form;
    const { container, rerender } = render(<SocialsForm artist={ARTIST} />);

    const input = screen.getByRole('textbox', { name: 'Instagram URL' });
    await user.click(input);
    await user.type(input, '/extra');
    expect(form.updateSocialLink).toHaveBeenCalledWith(
      0,
      'url',
      expect.stringContaining('/')
    );
    expect(form.scheduleNormalize).toHaveBeenCalled();

    rerender(<SocialsForm artist={ARTIST} />);
    await user.keyboard('{Escape}');

    expect(screen.getByRole('textbox', { name: 'Instagram URL' })).toBe(input);
    expect(input).toHaveFocus();
    expect(input).toHaveValue('https://instagram.com/demo');

    await user.click(screen.getByRole('button', { name: 'Remove Instagram' }));
    expect(form.removeSocialLink).toHaveBeenCalledWith(0);
    await expectNoA11yViolations(container);
  });

  it('adds a row on Enter in the last URL field and submits the form', async () => {
    const user = userEvent.setup();
    const form = makeForm({ socialLinks: [LINK] });
    formState.current = form;
    render(<SocialsForm artist={ARTIST} />);

    await user.click(screen.getByRole('textbox', { name: 'Instagram URL' }));
    await user.keyboard('{Enter}');
    expect(form.addSocialLink).toHaveBeenCalledOnce();

    await user.click(screen.getByRole('button', { name: 'Save Social Links' }));
    expect(form.handleSubmit).toHaveBeenCalledOnce();
  });

  it('renders the error and success banners', async () => {
    formState.current = makeForm({
      socialLinks: [LINK],
      error: 'Could not save',
      success: true,
    });
    const { container } = render(<SocialsForm artist={ARTIST} />);

    expect(screen.getByText('Could not save')).toBeInTheDocument();
    expect(screen.getByText('Social links saved!')).toBeInTheDocument();
    await expectNoA11yViolations(container);
  });

  it('lists detected profiles above the form once suggestions load', () => {
    suggestionState.suggestions = [
      {
        id: 's1',
        platform: 'tiktok',
        platformLabel: 'TikTok',
        url: 'https://tiktok.com/@demo',
        username: 'demo',
        confidence: 0.8,
      },
    ];
    render(<SocialsForm artist={ARTIST} />);

    expect(screen.getByText('Detected profiles')).toBeInTheDocument();
  });
});
