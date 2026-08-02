import { fireEvent, render, screen } from '@testing-library/react';
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

vi.mock('@/components/shell/ThreadImageCard', () => ({
  ThreadImageCard: ({ prompt, status }: { prompt: string; status: string }) => (
    <div data-testid='concept-art'>{`${prompt}:${status}`}</div>
  ),
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
  ],
};

describe('ChatMerchDesignCarousel', () => {
  beforeEach(() => {
    mutateMock.mockReset();
  });

  it('moves one concept at a time with arrows, keyboard, and stable dots', async () => {
    const user = userEvent.setup();
    render(<ChatMerchDesignCarousel result={result} />);

    expect(
      screen.queryByTestId('chat-generation-artifact-surface')
    ).not.toBeInTheDocument();
    expect(screen.getByText('Signal Vintage')).toBeInTheDocument();
    expect(screen.queryByText('Signal Mono')).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Next concept' }));
    expect(screen.getByText('Signal Mono')).toBeInTheDocument();

    const dots = screen.getAllByRole('button', { name: /Go to concept/ });
    expect(dots).toHaveLength(2);
    expect(dots[0]).toHaveClass('h-8', 'w-8');
    fireEvent.keyDown(dots[1], { key: 'ArrowLeft' });
    expect(screen.getByText('Signal Vintage')).toBeInTheDocument();
    expect(dots[0]).toHaveAttribute('aria-pressed', 'true');
  });

  it('selects in place and labels pending mockups truthfully', async () => {
    const user = userEvent.setup();
    mutateMock.mockImplementation(
      (
        input: { action: string },
        callbacks: {
          onSuccess: (response: Record<string, unknown>) => void;
        }
      ) => {
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
              {
                catalogProductId: 91,
                productName: 'Unisex Heavy Hoodie',
                productType: 'hoodie',
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
            selectedOptionId: '00000000-0000-4000-8000-000000000011',
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
        });
      }
    );

    render(
      <ChatMerchDesignCarousel
        result={result}
        profileId='00000000-0000-4000-8000-000000000001'
      />
    );

    await user.click(screen.getByRole('button', { name: 'Use this design' }));

    expect(mutateMock).toHaveBeenNthCalledWith(
      1,
      {
        profileId: '00000000-0000-4000-8000-000000000001',
        generationId: '00000000-0000-4000-8000-000000000010',
        optionId: '00000000-0000-4000-8000-000000000011',
        optionNumber: 1,
        action: 'products',
      },
      expect.any(Object)
    );
    expect(screen.getByText('Choose a product')).toBeInTheDocument();
    expect(screen.queryByText(/artist profit/)).not.toBeInTheDocument();

    await user.click(
      screen.getByRole('button', { name: /Unisex Staple T-Shirt/ })
    );
    expect(mutateMock).toHaveBeenNthCalledWith(
      2,
      {
        profileId: '00000000-0000-4000-8000-000000000001',
        generationId: '00000000-0000-4000-8000-000000000010',
        optionId: '00000000-0000-4000-8000-000000000011',
        optionNumber: 1,
        catalogProductId: 71,
        action: 'select',
      },
      expect.any(Object)
    );
    expect(
      screen.getByText('Product mockup is still rendering. Artwork shown.')
    ).toBeInTheDocument();
    expect(
      screen.getByText('$30.00 · $10.00 artist profit')
    ).toBeInTheDocument();
    expect(screen.queryByAltText(/product mockup/i)).not.toBeInTheDocument();

    await user.click(
      screen.getByRole('button', { name: 'Publish to profile' })
    );
    expect(mutateMock).toHaveBeenNthCalledWith(
      3,
      {
        profileId: '00000000-0000-4000-8000-000000000001',
        merchCardId: '00000000-0000-4000-8000-000000000020',
        action: 'publish',
      },
      expect.any(Object)
    );
    expect(
      screen.getByRole('button', { name: 'Live on profile' })
    ).toBeDisabled();
  });

  it('falls back to a concise prompt without exposing generation IDs', async () => {
    const dispatch = vi.spyOn(globalThis, 'dispatchEvent');
    const user = userEvent.setup();
    render(<ChatMerchDesignCarousel result={result} />);

    await user.click(screen.getByRole('button', { name: 'Use this design' }));

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

    expect(image).toHaveBeenCalledTimes(2);
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
