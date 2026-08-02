import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { MerchDesignCarouselResult } from '@/lib/merch/types';
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

    expect(screen.getByLabelText('Preparing merch concepts')).toHaveAttribute(
      'aria-busy',
      'true'
    );
    expect(container.querySelectorAll('.aspect-square')).toHaveLength(3);
    expect(screen.queryByText(/generating/i)).not.toBeInTheDocument();
  });
});
