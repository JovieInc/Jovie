import { render, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { EditorialRetargetingEntry } from '@/lib/retargeting/editorial';
import { expectNoA11yViolations } from '@/tests/utils/a11y';

const state = vi.hoisted(() => ({
  pathname: '/blog/one-profile-for-your-work' as string | null,
}));

vi.mock('next/script', () => ({
  default: (props: Record<string, unknown>) => (
    <script data-testid='next-script' {...props} />
  ),
}));

vi.mock('next/navigation', () => ({
  usePathname: () => state.pathname,
}));

vi.mock('@/lib/env-client', () => ({
  env: { IS_TEST: false, IS_E2E: false },
}));

vi.mock('@/lib/demo-recording', () => ({
  isDemoRecordingClient: () => false,
}));

vi.mock('@/lib/tracking/consent', async importOriginal => {
  const original =
    await importOriginal<typeof import('@/lib/tracking/consent')>();
  return { ...original, isMarketingAllowed: () => true };
});

import { EditorialRetargeting } from './EditorialRetargeting';

const ENTRY: EditorialRetargetingEntry = {
  canonicalPath: '/blog/one-profile-for-your-work',
  derivativeId: 'company-identity-customer-explanation',
  contentRevision: '2026-09-28',
};

describe('EditorialRetargeting certificate', () => {
  beforeEach(() => {
    state.pathname = '/blog/one-profile-for-your-work';
    globalThis.JVConsent = undefined;
    delete (globalThis.window as { fbq?: unknown }).fbq;
    delete (globalThis.window as { _fbq?: unknown })._fbq;
  });

  afterEach(() => {
    delete document.documentElement.dataset.editorialRetargeting;
  });

  it('mounts the Meta pixel on a registered route and stays axe-clean', async () => {
    const { container } = render(
      <EditorialRetargeting entries={[ENTRY]} pixelId='px-cert' />
    );

    await waitFor(() =>
      expect(document.documentElement.dataset.editorialRetargeting).toBe(
        'eligible'
      )
    );
    await waitFor(() =>
      expect(
        container.querySelector('[data-testid="next-script"]')
      ).not.toBeNull()
    );
    await expectNoA11yViolations(container);
  });

  it('renders nothing with an empty registry', async () => {
    const { container } = render(
      <EditorialRetargeting entries={[]} pixelId='px-cert' />
    );

    expect(container).toBeEmptyDOMElement();
    expect(document.documentElement.dataset.editorialRetargeting).not.toBe(
      'eligible'
    );
    await expectNoA11yViolations(container);
  });
});
