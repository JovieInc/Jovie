import { fireEvent, render, screen, within } from '@testing-library/react';
import React from 'react';
import { describe, expect, it, vi } from 'vitest';
import {
  type ChatMerchGenerationResult,
  ChatMerchOptionsCard,
  ChatMerchSelectionCard,
} from './ChatMerchCard';

vi.mock('next/image', () => ({
  default: ({
    alt,
    src,
    fill: _fill,
    sizes: _sizes,
    unoptimized: _unoptimized,
    ...props
  }: {
    readonly alt: string;
    readonly src: string;
    readonly fill?: boolean;
    readonly sizes?: string;
    readonly unoptimized?: boolean;
    readonly [key: string]: unknown;
  }) => React.createElement('img', { alt, src, ...props }),
}));

vi.mock('next/link', () => ({
  default: ({
    children,
    href,
    ...props
  }: {
    readonly children: React.ReactNode;
    readonly href: string;
    readonly [key: string]: unknown;
  }) => React.createElement('a', { href, ...props }, children),
}));

const generationResult: ChatMerchGenerationResult = {
  success: true,
  generationId: '00000000-0000-4000-8000-000000000100',
  nextStep: 'Pick one.',
  options: [
    {
      id: '00000000-0000-4000-8000-000000000101',
      option_number: 1,
      design_name: 'Signal Tee',
      product_type: 'Premium Tee',
      colorway: 'black',
      concept: 'A premium shirt with restrained artist typography.',
      mockup_urls: ['https://cdn.test/signal.jpg'],
      price_recommendation: {
        sale_price: '$45.00',
        profit: '$11.87',
        margin_preset: 'standard',
        presets: [
          {
            preset: 'safe',
            label: 'Safe',
            sale_price: '$42.00',
            profit: '$10.50',
          },
          {
            preset: 'standard',
            label: 'Standard',
            sale_price: '$45.00',
            profit: '$11.87',
          },
          {
            preset: 'aggressive',
            label: 'Aggressive',
            sale_price: '$49.00',
            profit: '$13.25',
          },
        ],
      },
      sellability: { sellable: true, reasons: [] },
      production_warnings: [],
    },
    {
      id: '00000000-0000-4000-8000-000000000102',
      option_number: 2,
      design_name: 'Draft Hoodie',
      product_type: 'Hoodie',
      colorway: 'black',
      concept: 'A heavier item waiting on provider pricing.',
      mockup_urls: ['https://cdn.test/hoodie.jpg'],
      price_recommendation: {
        sale_price: '$58.00',
        profit: '$0.00',
        margin_preset: 'standard',
        presets: [
          {
            preset: 'safe',
            label: 'Safe',
            sale_price: '$55.00',
            profit: '$0.00',
          },
          {
            preset: 'standard',
            label: 'Standard',
            sale_price: '$58.00',
            profit: '$0.00',
          },
          {
            preset: 'aggressive',
            label: 'Aggressive',
            sale_price: '$62.00',
            profit: '$0.00',
          },
        ],
      },
      sellability: {
        sellable: false,
        reasons: ['Printful product cost must come from Printful before sale.'],
      },
      production_warnings: [],
    },
  ],
};

describe('ChatMerchCard', () => {
  it('shows merch option economics and disables publish when blocked', () => {
    render(<ChatMerchOptionsCard result={generationResult} />);

    const optionCards = screen.getAllByTestId('chat-merch-option-card');
    const sellableCard = within(optionCards[0]);
    expect(sellableCard.getByTestId('merch-pricing-summary')).toHaveTextContent(
      '$45.00'
    );
    expect(sellableCard.getByTestId('merch-pricing-summary')).toHaveTextContent(
      '$11.87'
    );
    expect(sellableCard.getByRole('radio', { name: 'Standard' })).toBeChecked();
    expect(
      screen.getByText(
        'Printful product cost must come from Printful before sale.'
      )
    ).toBeInTheDocument();

    const publishButtons = screen.getAllByRole('button', { name: 'Publish' });
    expect(publishButtons[0]).not.toBeDisabled();
    expect(publishButtons[1]).toBeDisabled();
  });

  it('submits a select prompt for a sellable option', () => {
    const dispatch = vi.spyOn(globalThis, 'dispatchEvent');
    render(<ChatMerchOptionsCard result={generationResult} />);

    fireEvent.click(screen.getAllByRole('button', { name: 'Publish' })[0]);

    expect(dispatch).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'jovie-chat-submit-prompt',
        detail: {
          prompt:
            'Select and publish merch option 1 from generation 00000000-0000-4000-8000-000000000100.',
        },
      })
    );
  });

  it('explains when a selected card lands as draft because live sale is blocked', () => {
    render(
      <ChatMerchSelectionCard
        result={{
          success: true,
          merchCardId: '00000000-0000-4000-8000-000000000201',
          status: 'draft',
          selectedOptionId: '00000000-0000-4000-8000-000000000102',
          title: 'Draft Hoodie',
          publicUrl: null,
          publishBlockedReasons: [
            'Printful product cost must come from Printful before sale.',
          ],
        }}
      />
    );

    expect(
      screen.getByText(
        'Draft card is in Library as a draft until Printful and pricing checks pass.'
      )
    ).toBeInTheDocument();
    expect(screen.getByText('Open Library')).toHaveAttribute(
      'href',
      '/app/library?view=merch'
    );
  });

  it('submits same-design alternative item prompts from the saved card', () => {
    const dispatch = vi.spyOn(globalThis, 'dispatchEvent');

    render(
      <ChatMerchSelectionCard
        result={{
          success: true,
          merchCardId: '00000000-0000-4000-8000-000000000201',
          status: 'draft',
          selectedOptionId: '00000000-0000-4000-8000-000000000101',
          title: 'Signal Tee',
          publicUrl: null,
        }}
      />
    );

    fireEvent.click(screen.getByRole('button', { name: 'Hoodie' }));

    expect(dispatch).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'jovie-chat-submit-prompt',
        detail: {
          prompt:
            'Create a hoodie version of merch card 00000000-0000-4000-8000-000000000201 with the same design.',
        },
      })
    );

    dispatch.mockRestore();
  });
});
