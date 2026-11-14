import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { MerchDesignCarouselResult } from '@/lib/merch/types';
import { expectNoA11yViolations } from '@/tests/utils/a11y';
import {
  ChatMerchDesignCarousel,
  ChatMerchDesignCarouselLoading,
  prefetchMerchDesignPreviews,
} from './ChatMerchDesignCarousel';

const mutateMock = vi.hoisted(() => vi.fn());

vi.mock('@/lib/queries', () => ({
  useConfirmChatMerchActionMutation: () => ({ mutate: mutateMock }),
}));

const result: MerchDesignCarouselResult = {
  success: true,
  generationId: '00000000-0000-4000-8000-000000000010',
  designs: [
    {
      id: '00000000-0000-4000-8000-000000000011',
      option_number: 1,
      design_name: 'Signal Vintage',
      concept: 'Distressed type and a one-color emblem.',
      status: 'ready',
      preview_url: 'https://blob.example.com/one.png',
      slots: { artist_name: 'Signal' },
    },
    {
      id: '00000000-0000-4000-8000-000000000012',
      option_number: 2,
      design_name: 'Signal Mono',
      concept: 'Editorial type with open space.',
      status: 'ready',
      preview_url: 'https://blob.example.com/two.png',
      slots: { artist_name: 'Signal' },
    },
    {
      id: '00000000-0000-4000-8000-000000000013',
      option_number: 3,
      design_name: 'Signal Bold',
      concept: 'Large type with a compact emblem.',
      status: 'ready',
      preview_url: 'https://blob.example.com/three.png',
      slots: { artist_name: 'Signal' },
    },
  ],
};

describe('ChatMerchDesignCarousel', () => {
  beforeEach(() => mutateMock.mockReset());

  it('shows exactly three compact selectable concepts without carousel chrome', () => {
    render(<ChatMerchDesignCarousel result={result} />);

    expect(screen.getAllByTestId('chat-merch-option-card')).toHaveLength(3);
    expect(screen.getAllByRole('button', { name: 'Select' })).toHaveLength(3);
    expect(
      screen.queryByRole('button', { name: /next concept|previous concept/i })
    ).not.toBeInTheDocument();
    expect(screen.getByText('Do you like any of these?')).toBeInTheDocument();
  });

  it('keeps the art clean: Select and the name sit below it, tiles share one height', () => {
    render(<ChatMerchDesignCarousel result={result} />);

    for (const card of screen.getAllByTestId('chat-merch-option-card')) {
      const art = card.querySelector('[data-testid="chat-merch-option-art"]');
      expect(art).not.toBeNull();
      // Nothing overlays the artwork: no button, no gradient plate.
      expect(art?.querySelector('button')).toBeNull();
      expect(art?.children).toHaveLength(1);
      const caption = card.querySelector(
        '[data-testid="chat-merch-option-caption"]'
      );
      expect(caption?.querySelector('button')).not.toBeNull();
      expect(card).toHaveClass('flex', 'flex-col', 'h-full');
      expect(caption).toHaveClass('flex-1');
    }
  });

  it('keeps the product choice in the selected surface before creating a truthful pricing card', async () => {
    const user = userEvent.setup();
    mutateMock.mockImplementation(
      (
        input?: { action: string },
        callbacks?: { onSuccess: (response: Record<string, unknown>) => void }
      ) => {
        if (!input || !callbacks) return;
        if (input.action === 'products') {
          callbacks.onSuccess({
            success: true,
            products: [
              {
                catalogProductId: 71,
                productName: 'Unisex Staple T-Shirt',
                productType: 't-shirt',
                colorway: 'Black',
              },
            ],
          });
          return;
        }
        if (input.action === 'select') {
          callbacks.onSuccess({
            success: true,
            merchCardId: '00000000-0000-4000-8000-000000000020',
            status: 'draft',
            selectedOptionId: result.designs[0].id,
            title: 'Signal Vintage',
            publicUrl: null,
            product: {
              productType: 't-shirt',
              productName: 'Unisex Staple T-Shirt',
              colorway: 'Black',
              artworkUrl: 'https://blob.example.com/one.png',
              mockupUrl: null,
              mockupStatus: 'pending',
              retailPrice: '$30.00',
              artistProfit: '$10.00',
              publishEligible: true,
            },
          });
          return;
        }
        callbacks.onSuccess({
          success: true,
          merchCardId: '00000000-0000-4000-8000-000000000020',
          status: 'live',
          title: 'Signal Vintage',
          publicUrl: 'https://jov.ie/signal/merch/20',
        });
      }
    );

    render(
      <ChatMerchDesignCarousel
        result={result}
        profileId='00000000-0000-4000-8000-000000000001'
      />
    );

    await user.click(screen.getAllByRole('button', { name: 'Select' })[0]);
    expect(screen.getByText('Choose the product.')).toBeInTheDocument();
    expect(mutateMock).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'products', optionNumber: 1 }),
      expect.any(Object)
    );

    await user.click(
      screen.getByRole('button', { name: 'Unisex Staple T-Shirt' })
    );
    expect(
      screen.getByText('$30.00 · $10.00 artist profit')
    ).toBeInTheDocument();

    await user.click(
      screen.getByRole('button', { name: 'Publish to profile' })
    );
    expect(
      screen.getByRole('link', { name: 'Open merch page' })
    ).toHaveAttribute('href', 'https://jov.ie/signal/merch/20');
  });

  it('falls back to a concise selection prompt without exposing IDs', async () => {
    const dispatch = vi.spyOn(globalThis, 'dispatchEvent');
    const user = userEvent.setup();
    render(<ChatMerchDesignCarousel result={result} />);

    await user.click(screen.getAllByRole('button', { name: 'Select' })[0]);

    expect(dispatch).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'jovie-chat-submit-prompt',
        detail: { prompt: 'Use concept 1.' },
      })
    );
    expect(JSON.stringify(dispatch.mock.calls)).not.toContain(
      result.generationId
    );
    dispatch.mockRestore();
  });

  it('preloads each ready preview once for instant concept navigation', () => {
    const OriginalImage = globalThis.Image;
    const image = vi.fn();
    Object.defineProperty(globalThis, 'Image', {
      configurable: true,
      value: image,
    });

    prefetchMerchDesignPreviews([...result.designs, result.designs[0]]);

    expect(image).toHaveBeenCalledTimes(3);
    Object.defineProperty(globalThis, 'Image', {
      configurable: true,
      value: OriginalImage,
    });
  });

  it('reserves a quiet three-concept area while image generation runs', () => {
    const { container } = render(<ChatMerchDesignCarouselLoading />);

    expect(screen.getByLabelText('Preparing Merch Concepts')).toHaveAttribute(
      'aria-busy',
      'true'
    );
    expect(container.querySelectorAll('.aspect-square')).toHaveLength(3);
    expect(screen.queryByText(/generating/i)).not.toBeInTheDocument();
  });

  it('does not present a blank garment when mockup rendering failed', () => {
    render(
      <ChatMerchDesignCarousel
        result={{
          ...result,
          designs: [
            {
              ...result.designs[0],
              status: 'generating',
              preview_url: undefined,
              mockup_status: 'mockup_failed',
            },
          ],
        }}
      />
    );

    expect(screen.getByTestId('chat-merch-mockup-failed')).toHaveTextContent(
      'Preview unavailable'
    );
    expect(screen.queryByAltText(/mockup/i)).toBeNull();
  });

  it('says so and offers a retry when no design came back', async () => {
    const submitted = vi.fn();
    globalThis.addEventListener('jovie-chat-submit-prompt', submitted);
    try {
      render(<ChatMerchDesignCarousel result={{ ...result, designs: [] }} />);

      const retry = within(
        screen.getByRole('region', { name: 'Retry Merch Concepts' })
      );
      expect(retry.getByText('No designs came back this time.')).toBeVisible();
      await userEvent.click(retry.getByRole('button', { name: 'Try Again' }));
      expect(submitted).toHaveBeenCalledTimes(1);
      expect(submitted).toHaveBeenCalledWith(
        expect.objectContaining({
          detail: { prompt: 'Try generating the merch designs again' },
        })
      );
    } finally {
      globalThis.removeEventListener('jovie-chat-submit-prompt', submitted);
    }
  });
});

describe('ChatMerchDesignCarousel certificate states', () => {
  beforeEach(() => mutateMock.mockReset());

  const [ready, second, third] = result.designs;
  const withDesigns = (
    designs: MerchDesignCarouselResult['designs']
  ): MerchDesignCarouselResult => ({ ...result, designs });
  const partial = withDesigns([
    ready,
    { ...second, status: 'generating', preview_url: undefined },
    {
      ...third,
      status: 'generating',
      mockup_status: 'mockup_failed',
      preview_url: undefined,
    },
  ]);
  const long = withDesigns([
    {
      ...ready,
      design_name:
        'The Extended Midnight Drive Sessions Deluxe Anniversary Edition Tee',
    },
    {
      ...second,
      design_name:
        'Neon Highway Hoodie With Hand-Lettered Back Print And Sleeve Tour Dates',
    },
    third,
  ]);

  function failProductsWith(error: unknown) {
    mutateMock.mockImplementation(
      (_input: unknown, callbacks?: { onError: (e: unknown) => void }) =>
        callbacks?.onError(error)
    );
  }

  it.each([
    ['three ready concepts', result],
    ['partial readiness', partial],
    ['long concept names', long],
    ['empty batch', withDesigns([])],
  ] as const)('has no axe violations: %s', async (_state, value) => {
    const { container } = render(<ChatMerchDesignCarousel result={value} />);
    await expectNoA11yViolations(container);
  });

  it('has no axe violations while concepts are still generating', async () => {
    const { container } = render(<ChatMerchDesignCarouselLoading />);
    await expectNoA11yViolations(container);
  });

  it('only lets ready concepts be selected when readiness is partial', () => {
    render(<ChatMerchDesignCarousel result={partial} />);
    const buttons = screen.getAllByRole('button', { name: 'Select' });
    expect(buttons.map(button => button.hasAttribute('disabled'))).toEqual([
      false,
      true,
      true,
    ]);
    expect(screen.getByTestId('chat-merch-mockup-fallback')).toHaveTextContent(
      'Rendering'
    );
    expect(screen.getByTestId('chat-merch-mockup-failed')).toHaveTextContent(
      'Preview unavailable'
    );
  });

  it('keeps long concept names whole behind the three-line clamp', () => {
    render(<ChatMerchDesignCarousel result={long} />);
    const heading = screen.getByRole('heading', {
      name: 'The Extended Midnight Drive Sessions Deluxe Anniversary Edition Tee',
    });
    expect(heading).toHaveClass('line-clamp-3');
  });

  it.each([
    ['a server error', new Error('503 Printful unavailable')],
    ['an offline request', new TypeError('Failed to fetch')],
  ])(
    'keeps the concepts and says the products could not load after %s',
    async (_cause, error) => {
      failProductsWith(error);
      const user = userEvent.setup();
      const { container } = render(
        <ChatMerchDesignCarousel result={result} profileId='profile-1' />
      );
      await user.click(screen.getAllByRole('button', { name: 'Select' })[0]);
      expect(
        screen.getByText('Unable to load products. Try again.')
      ).toBeInTheDocument();
      expect(screen.getAllByTestId('chat-merch-option-card')).toHaveLength(3);
      expect(
        screen.getAllByRole('button', { name: 'Select' })[0]
      ).toBeEnabled();
      await expectNoA11yViolations(container);
    }
  );

  it('says so when the product lookup returns nothing', async () => {
    mutateMock.mockImplementation(
      (
        _input: unknown,
        callbacks?: { onSuccess: (response: unknown) => void }
      ) => callbacks?.onSuccess({ success: true, products: [] })
    );
    const user = userEvent.setup();
    render(<ChatMerchDesignCarousel result={result} profileId='profile-1' />);
    await user.click(screen.getAllByRole('button', { name: 'Select' })[0]);
    expect(
      screen.getByText('No products are available right now.')
    ).toBeInTheDocument();
  });

  it('has no axe violations on the product chooser', async () => {
    mutateMock.mockImplementation(
      (
        _input: unknown,
        callbacks?: { onSuccess: (response: unknown) => void }
      ) =>
        callbacks?.onSuccess({
          success: true,
          products: [
            {
              catalogProductId: 71,
              productName: 'Unisex Staple T-Shirt',
              productType: 't-shirt',
              colorway: 'Black',
            },
          ],
        })
    );
    const user = userEvent.setup();
    const { container } = render(
      <ChatMerchDesignCarousel result={result} profileId='profile-1' />
    );
    await user.click(screen.getAllByRole('button', { name: 'Select' })[0]);
    expect(screen.getByText('Choose the product.')).toBeInTheDocument();
    await expectNoA11yViolations(container);
  });

  it('renders right-to-left concepts and stays axe-clean', async () => {
    const { container } = render(
      <div dir='rtl' lang='ar'>
        <ChatMerchDesignCarousel
          result={withDesigns([
            { ...ready, design_name: 'قميص الليل' },
            { ...second, design_name: 'هودي الطريق السريع' },
            { ...third, design_name: 'ملصق الأفق' },
          ])}
        />
      </div>
    );
    expect(screen.getByRole('heading', { name: 'قميص الليل' })).toBeVisible();
    await expectNoA11yViolations(container);
  });
});
