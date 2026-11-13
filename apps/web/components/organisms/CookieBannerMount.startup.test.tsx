import { act, cleanup, render, screen } from '@testing-library/react';
import Link from 'next/link';
import { afterEach, expect, it, vi } from 'vitest';
import { CookieBannerMount } from './CookieBannerMount';

const privacyChunk = vi.hoisted(() => {
  let release!: () => void;
  const loaded = new Promise<void>(resolve => {
    release = resolve;
  });
  return { loaded, release };
});

vi.mock('./PrivacyChoices', async importOriginal => {
  await privacyChunk.loaded;
  return importOriginal();
});

afterEach(() => {
  cleanup();
  localStorage.clear();
  vi.restoreAllMocks();
});

it('keeps consent controls and privacy requests available while the privacy chunk is delayed', async () => {
  vi.spyOn(document, 'cookie', 'get').mockReturnValue('jv_cc_required=0');
  render(
    <>
      <Link href='/legal/privacy#privacy-choices'>Your Privacy Choices</Link>
      <CookieBannerMount />
    </>
  );
  expect(globalThis.JVConsent).toBeDefined();

  const subscriber = vi.fn();
  const unsubscribe = globalThis.JVConsent?.onChange(subscriber);
  const choice = { essential: true, analytics: true, marketing: false };
  act(() => {
    globalThis.JVConsent?._emit(choice);
    globalThis.dispatchEvent(new Event('jv:cookie:open'));
  });
  expect(subscriber).toHaveBeenCalledWith(choice);
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument();

  expect(
    await screen.findByRole('dialog', { name: 'Cookie Preferences' })
  ).toBeVisible();

  act(() => screen.getByRole('button', { name: 'Cancel' }).click());

  const privacyClick = new MouseEvent('click', {
    bubbles: true,
    cancelable: true,
  });
  act(() => {
    screen
      .getByRole('link', { name: 'Your Privacy Choices' })
      .dispatchEvent(privacyClick);
  });
  expect(privacyClick.defaultPrevented).toBe(true);

  await act(async () => {
    privacyChunk.release();
    await privacyChunk.loaded;
  });
  expect(
    await screen.findByRole('dialog', {
      name: 'Your Privacy Choices',
    })
  ).toBeVisible();
  unsubscribe?.();
});
