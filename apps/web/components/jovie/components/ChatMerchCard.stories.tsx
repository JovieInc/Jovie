import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import {
  type ChatMerchGenerationResult,
  ChatMerchOptionsCard,
  ChatMerchSelectionCard,
} from './ChatMerchCard';

const generationResult: ChatMerchGenerationResult = {
  success: true,
  generationId: '00000000-0000-4000-8000-000000000100',
  nextStep: 'Pick one to save it to Work.',
  options: [
    {
      id: '00000000-0000-4000-8000-000000000101',
      option_number: 1,
      design_name: 'Signal Tee',
      product_type: 'Premium Tee',
      colorway: 'black',
      concept: 'A premium shirt with restrained artist typography.',
      mockup_urls: [],
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
      mockup_urls: [],
      price_recommendation: {
        sale_price: '$58.00',
        profit: '$0.00',
        margin_preset: 'standard',
      },
      sellability: {
        sellable: false,
        reasons: ['Printful product cost must come from Printful before sale.'],
      },
      production_warnings: [],
    },
  ],
};

const meta = {
  title: 'Jovie/Components/ChatMerchCard',
  component: ChatMerchOptionsCard,
  parameters: { layout: 'centered' },
  args: { result: generationResult },
} satisfies Meta<typeof ChatMerchOptionsCard>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Options: Story = {};

export const SelectionDraft: Story = {
  render: () => (
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
  ),
};

const [signalTee, draftHoodie] = generationResult.options;

/** Generation finished without a usable option: only the next-step line shows. */
export const EmptyOptions: Story = {
  args: {
    result: {
      ...generationResult,
      nextStep: 'No options came back. Ask for another set.',
      options: [],
    },
  },
};

/** The mockup render failed: the tile says so instead of a blank garment. */
export const ErrorMockupFailed: Story = {
  args: {
    result: {
      ...generationResult,
      options: [
        {
          ...signalTee,
          id: '00000000-0000-4000-8000-000000000111',
          sellability: {
            sellable: false,
            reasons: [
              'Printful mockup failed. Try generating this item again.',
            ],
          },
        },
      ],
    },
  },
};

/** Optional fields missing: no colorway, no pricing yet, mockup still rendering. */
export const PartialOption: Story = {
  args: {
    result: {
      success: true,
      generationId: generationResult.generationId,
      options: [
        {
          id: '00000000-0000-4000-8000-000000000121',
          option_number: 1,
          design_name: 'Signal Tee',
          product_type: 'Premium Tee',
          concept: 'A premium shirt with restrained artist typography.',
        },
      ],
    },
  },
};

export const LongContent: Story = {
  args: {
    result: {
      ...generationResult,
      nextStep:
        'Pick one to save it to Work. Publishing waits until Printful confirms product cost and the pricing checks pass for every size.',
      options: [
        {
          ...signalTee,
          design_name:
            'The Extended Midnight Drive Sessions Deluxe Anniversary Tee',
          printful_product_name:
            'Unisex Garment-Dyed Heavyweight Premium Cotton T-Shirt',
          colorway: 'washed vintage charcoal',
        },
        {
          ...draftHoodie,
          sellability: {
            sellable: false,
            reasons: [
              'Printful product cost must come from Printful before sale.',
              'The front print exceeds the printable area for the smallest size.',
              'Back print artwork is below the minimum resolution.',
            ],
          },
        },
      ],
    },
  },
};

export const RtlOptions: Story = {
  args: {
    result: {
      ...generationResult,
      nextStep: 'اختر واحدًا لحفظه في العمل.',
      options: [
        { ...signalTee, design_name: 'قميص الإشارة', colorway: 'أسود' },
        draftHoodie,
      ],
    },
  },
  decorators: [
    Story => (
      <div dir='rtl' lang='ar'>
        <Story />
      </div>
    ),
  ],
};
