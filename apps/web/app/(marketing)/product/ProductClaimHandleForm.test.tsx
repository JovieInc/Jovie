import { readFileSync } from 'node:fs';
import path from 'node:path';
import { act, fireEvent, within } from '@testing-library/react';
import { hydrateRoot, type Root } from 'react-dom/client';
import { renderToString } from 'react-dom/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ProductClaimHandleForm } from './ProductClaimHandleForm';

const { push } = vi.hoisted(() => ({ push: vi.fn() }));
vi.mock('next/navigation', () => ({ useRouter: () => ({ push }) }));

const webRoot = path.resolve(__dirname, '../../..');
const formPath = 'app/(marketing)/product/ProductClaimHandleForm.tsx';

describe('ProductClaimHandleForm domain-prefix contrast', () => {
  it('keeps the jov.ie/ domain prefix on a token that clears WCAG AA', () => {
    const source = readFileSync(path.join(webRoot, formPath), 'utf8');

    // Regression guard: `text-tertiary-token` measured 4.09 (foreground
    // #8f95a0, background #333537) against the editorial input pill's
    // composited background on the homepage close section — fails the
    // required 4.5:1 and broke screenshots.yml's "Capture exact marketing
    // routes" axe pass for `/` (desktop + mobile) on 2026-09-29.
    // `text-secondary-token` (#a0a5af) measures 4.98:1 on the same
    // background. This span is shared by the homepage hero, homepage close,
    // and /product page claim forms, so fixing it here fixes all three.
    expect(source).toMatch(
      /<span className='shrink-0 select-none text-base text-secondary-token'>/
    );
    expect(source).not.toContain('text-tertiary-token');
  });
});

describe('ProductClaimHandleForm server draft retention', () => {
  const mounted: { root: Root; container: HTMLDivElement }[] = [];
  const form = (
    <ProductClaimHandleForm
      domain='jov.ie/'
      placeholder='you'
      submitLabel='Claim'
      inputId='homepage-claim-handle'
      testIdPrefix='homepage'
      submitTestId='homepage-primary-cta'
    />
  );

  beforeEach(() => {
    vi.useFakeTimers();
    push.mockClear();
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ available: true }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        })
      )
    );
  });

  afterEach(async () => {
    for (const { root, container } of mounted.splice(0)) {
      await act(async () => root.unmount());
      container.remove();
    }
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  async function hydrateDraft(draft: string) {
    const container = document.createElement('div');
    container.innerHTML = renderToString(form);
    document.body.appendChild(container);
    const input = within(container).getByRole('textbox') as HTMLInputElement;
    // Represents text accepted by the native SSR input before React attaches.
    fireEvent.input(input, { target: { value: draft } });
    expect(input.value).toBe(draft);
    let root: Root | undefined;
    await act(async () => {
      root = hydrateRoot(container, form);
    });
    if (!root) throw new Error('Hydration root was not created');
    mounted.push({ root, container });
    return { input, container };
  }

  it.each(['early-draft', 'EARLY-PASTE'])(
    'preserves and validates the early draft %s',
    async draft => {
      const { input, container } = await hydrateDraft(draft);
      const normalized = draft.toLowerCase();
      expect(input).toHaveValue(normalized);
      await act(async () => {
        await vi.advanceTimersByTimeAsync(500);
      });
      expect(globalThis.fetch).toHaveBeenCalledWith(
        expect.stringContaining(`handle=${normalized}`),
        expect.any(Object)
      );
      expect(
        within(container).getByTestId('homepage-handle-status')
      ).toHaveTextContent(`@${normalized} is available`);
      expect(input).toHaveValue(normalized);
      fireEvent.click(within(container).getByRole('button', { name: 'Claim' }));
      const target = new URL(push.mock.calls[0][0], 'https://jov.ie');
      expect(target.pathname).toBe('/start');
      expect(target.searchParams.get('handle')).toBe(normalized);
    }
  );

  it('retains invalid early text and prevents a wrong-handle handoff', async () => {
    const { input, container } = await hydrateDraft('not valid');
    expect(input).toHaveValue('not valid');
    expect(input).toHaveAttribute('aria-invalid', 'true');
    expect(
      within(container).getByTestId('homepage-handle-status')
    ).toHaveTextContent('Handle can only contain');
    fireEvent.submit(within(container).getByTestId('homepage-claim-form'));
    expect(push).not.toHaveBeenCalled();
    expect(input).toHaveFocus();
  });

  it('keeps an empty client form quiet and validates later editing', async () => {
    const { input, container } = await hydrateDraft('');
    await act(async () => {
      await vi.advanceTimersByTimeAsync(500);
    });
    expect(input).toHaveValue('');
    expect(globalThis.fetch).not.toHaveBeenCalled();
    expect(
      within(container).getByTestId('homepage-handle-status')
    ).toHaveAttribute('aria-hidden', 'true');
    fireEvent.change(input, { target: { value: 'LOADED-DRAFT' } });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(500);
    });
    expect(input).toHaveValue('loaded-draft');
    expect(
      within(container).getByTestId('homepage-handle-status')
    ).toHaveTextContent('@loaded-draft is available');
  });

  it('preserves an early draft when availability returns an error', async () => {
    vi.mocked(globalThis.fetch).mockResolvedValue(
      new Response(
        JSON.stringify({ available: false, error: 'Network unavailable' }),
        { status: 200, headers: { 'content-type': 'application/json' } }
      )
    );
    const { input, container } = await hydrateDraft('early-error');
    await act(async () => {
      await vi.advanceTimersByTimeAsync(500);
    });
    expect(input).toHaveValue('early-error');
    expect(input).toHaveAttribute('aria-invalid', 'true');
    expect(
      within(container).getByTestId('homepage-handle-status')
    ).toHaveTextContent('Network unavailable');
    fireEvent.change(input, { target: { value: '' } });
    expect(input).toHaveValue('');
    expect(
      within(container).getByTestId('homepage-handle-status')
    ).toHaveAttribute('aria-hidden', 'true');
  });

  it('keeps the native GET fallback and empty status in server HTML', () => {
    const container = document.createElement('div');
    container.innerHTML = renderToString(form);
    const nativeForm = within(container).getByTestId('homepage-claim-form');
    expect(nativeForm).toHaveAttribute('action', '/start');
    expect(nativeForm).toHaveAttribute('method', 'get');
    expect(within(container).getByRole('textbox')).toHaveAttribute(
      'name',
      'handle'
    );
    expect(
      within(container).getByRole('button', { name: 'Claim' })
    ).not.toBeDisabled();
    expect(
      within(container).getByTestId('homepage-handle-status')
    ).toHaveAttribute('aria-hidden', 'true');
  });
});
