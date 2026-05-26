import { fireEvent, render, screen } from '@testing-library/react';
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
        retail_price: '$45.00',
        artist_share: '$11.87',
        jovie_share: '$11.87',
        minimum_jovie_margin: '$5.00',
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
        retail_price: '$58.00',
        artist_share: '$0.00',
        jovie_share: '$0.00',
        minimum_jovie_margin: '$5.80',
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

    expect(screen.getByText('Price $45.00')).toBeInTheDocument();
    expect(screen.getByText('Jovie $11.87')).toBeInTheDocument();
    expect(screen.getByText('Floor $5.80')).toBeInTheDocument();
    expect(screen.getByText('Draft')).toBeInTheDocument();
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
});
