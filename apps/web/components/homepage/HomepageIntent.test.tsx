import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockPush = vi.fn();
const mockTrack = vi.fn();

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: mockPush, prefetch: vi.fn() }),
}));

vi.mock('@/lib/analytics', () => ({
  track: (...args: unknown[]) => mockTrack(...args),
}));

import { HomepageIntent } from '@/components/homepage/HomepageIntent';
import { HOMEPAGE_INTENT_KEY } from '@/components/homepage/intent';

function getInput() {
  return screen.getByPlaceholderText('Message...') as HTMLInputElement;
}

function getSubmit() {
  return screen.getByRole('button', { name: 'Submit prompt' });
}

describe('HomepageIntent', () => {
  beforeEach(() => {
    mockPush.mockClear();
    mockTrack.mockClear();
    globalThis.localStorage?.clear();
  });

  it('1. renders headline, subhead, input, and all 4 pills with correct labels', () => {
    render(<HomepageIntent />);
    expect(
      screen.getByRole('heading', { name: 'Your AI Artist Manager.' })
    ).toBeTruthy();
    expect(
      screen.getByText(
        'Drop more music. Learn what hits. Build momentum before you burn out.'
      )
    ).toBeTruthy();
    expect(getInput()).toBeTruthy();
    expect(
      screen.getByRole('button', { name: 'Create release page' })
    ).toBeTruthy();
    expect(
      screen.getByRole('button', { name: 'Generate album art' })
    ).toBeTruthy();
    expect(
      screen.getByRole('button', { name: 'Generate playlist pitch' })
    ).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Plan a release' })).toBeTruthy();
  });

  it('2. pill click prefills input with insertedPrompt and places cursor at end', () => {
    render(<HomepageIntent />);
    const input = getInput();
    const setSelectionRange = vi.spyOn(input, 'setSelectionRange');
    const focusSpy = vi.spyOn(input, 'focus');

    fireEvent.click(
      screen.getByRole('button', { name: 'Create release page' })
    );

    expect(input.value).toBe('Create a release page for ');
    expect(focusSpy).toHaveBeenCalled();
    expect(setSelectionRange).toHaveBeenCalledWith(
      'Create a release page for '.length,
      'Create a release page for '.length
    );
  });

  it('3. submit with empty input is a no-op (no push, no storage, no event)', () => {
    render(<HomepageIntent />);
    fireEvent.click(getSubmit());
    expect(mockPush).not.toHaveBeenCalled();
    expect(globalThis.localStorage?.getItem(HOMEPAGE_INTENT_KEY)).toBeNull();
    expect(
      mockTrack.mock.calls.find(c => c[0] === 'homepage_prompt_submitted')
    ).toBeUndefined();
  });

  it('4. submit with text writes correct HomepageIntent object to localStorage', () => {
    render(<HomepageIntent />);
    const input = getInput();
    fireEvent.change(input, { target: { value: 'my new EP' } });
    fireEvent.click(getSubmit());

    const raw = globalThis.localStorage?.getItem(HOMEPAGE_INTENT_KEY);
    expect(raw).toBeTruthy();
    const parsed = JSON.parse(raw as string);
    expect(parsed.source).toBe('homepage');
    expect(parsed.finalPrompt).toBe('my new EP');
    expect(parsed.pillId).toBeNull();
    expect(parsed.pillLabel).toBeNull();
    expect(parsed.insertedPrompt).toBeNull();
    expect(parsed.experimentId).toBe('homepage_intent_pills_v1');
    expect(parsed.variantId).toBe('release_assets_v1');
    expect(typeof parsed.createdAt).toBe('string');
    expect(() => new Date(parsed.createdAt).toISOString()).not.toThrow();
  });

  it('5. submit fires homepage_prompt_submitted with expected shape', () => {
    render(<HomepageIntent />);
    fireEvent.click(
      screen.getByRole('button', { name: 'Create release page' })
    );
    const input = getInput();
    fireEvent.change(input, {
      target: { value: 'Create a release page for my EP' },
    });
    fireEvent.click(getSubmit());

    const call = mockTrack.mock.calls.find(
      c => c[0] === 'homepage_prompt_submitted'
    );
    expect(call).toBeTruthy();
    const props = call?.[1] as Record<string, unknown>;
    expect(props.pillId).toBe('create_release_page');
    expect(props.pillUsed).toBe(true);
    expect(props.promptLength).toBe('Create a release page for my EP'.length);
  });

  it('6. submit calls router.push with /signin?redirect_url=/onboarding', () => {
    render(<HomepageIntent />);
    fireEvent.change(getInput(), { target: { value: 'anything' } });
    fireEvent.click(getSubmit());
    expect(mockPush).toHaveBeenCalledTimes(1);
    const target = mockPush.mock.calls[0][0] as string;
    expect(target).toContain('/signin');
    expect(target).toContain('redirect_url=%2Fonboarding');
  });

  it('7. homepage_viewed fires exactly once on mount', () => {
    const { rerender } = render(<HomepageIntent />);
    rerender(<HomepageIntent />);
    const viewed = mockTrack.mock.calls.filter(c => c[0] === 'homepage_viewed');
    expect(viewed.length).toBe(1);
  });

  it('8. homepage_prompt_edited fires at most once per session', () => {
    render(<HomepageIntent />);
    const input = getInput();
    fireEvent.change(input, { target: { value: 'a' } });
    fireEvent.change(input, { target: { value: 'ab' } });
    fireEvent.change(input, { target: { value: 'abc' } });
    const edited = mockTrack.mock.calls.filter(
      c => c[0] === 'homepage_prompt_edited'
    );
    expect(edited.length).toBe(1);
  });

  it('9. localStorage.setItem throw does not crash submit and still redirects', () => {
    const original = globalThis.localStorage.setItem;
    globalThis.localStorage.setItem = () => {
      throw new Error('QuotaExceeded');
    };
    try {
      render(<HomepageIntent />);
      fireEvent.change(getInput(), { target: { value: 'hello' } });
      expect(() => fireEvent.click(getSubmit())).not.toThrow();
      expect(mockPush).toHaveBeenCalledTimes(1);
    } finally {
      globalThis.localStorage.setItem = original;
    }
  });

  it('10. Enter submits; Escape clears input', () => {
    render(<HomepageIntent />);
    const input = getInput();
    fireEvent.change(input, { target: { value: 'hello' } });
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(mockPush).toHaveBeenCalledTimes(1);

    mockPush.mockClear();
    fireEvent.change(input, { target: { value: 'again' } });
    fireEvent.keyDown(input, { key: 'Escape' });
    expect(input.value).toBe('');
    expect(mockPush).not.toHaveBeenCalled();
  });

  it('11. submit button is aria-disabled when input is empty, enabled when populated', () => {
    render(<HomepageIntent />);
    const button = getSubmit();
    expect(button.getAttribute('aria-disabled')).toBe('true');
    fireEvent.change(getInput(), { target: { value: 'x' } });
    expect(button.getAttribute('aria-disabled')).toBe('false');
  });

  it('12. SSR-safe: component does not read window/localStorage during render', () => {
    render(<HomepageIntent />);
    const input = getInput();
    expect(input.value).toBe('');
  });
});
