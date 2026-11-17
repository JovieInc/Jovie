import type { MerchCard, MerchOrder } from '@/lib/db/schema/merch';
import type { PrintfulCreateOrderInput } from '@/lib/printful/client';
import { validateShippingAddress } from './shipping-address';
import type { MerchOrderFulfillmentInput } from './types';

function toPrintfulTechnique(technique: string): string {
  return technique === 'cut_and_sew' ? 'cut-sew' : technique;
}

export function buildPrintfulOrderInput(params: {
  readonly order: MerchOrder;
  readonly card: MerchCard;
  readonly fulfillment: MerchOrderFulfillmentInput;
}): PrintfulCreateOrderInput {
  const printFileUrl = params.card.printful.printFileUrls[0];
  if (!printFileUrl) {
    throw new Error('Merch card is missing a Printful print file URL');
  }

  const address = params.fulfillment.shippingAddress;
  if (!validateShippingAddress(address)) {
    throw new Error('Order is missing a complete shipping address');
  }

  return {
    external_id: params.order.printfulExternalId ?? params.order.id,
    recipient: {
      name: address.name,
      email: params.fulfillment.buyerEmail,
      phone: address.phone ?? null,
      address1: address.line1,
      address2: address.line2 ?? null,
      city: address.city,
      state_code: address.state ?? null,
      country_code: address.country,
      zip: address.postalCode,
    },
    order_items: [
      {
        quantity: params.order.quantity,
        catalog_variant_id: params.order.selectedVariantId,
        source: 'catalog',
        placements: params.card.printful.placements.map(placement => ({
          placement,
          technique: toPrintfulTechnique(
            params.card.printful.techniques[0] ?? 'dtg'
          ),
          layers: [
            {
              type: 'file',
              url: printFileUrl,
            },
          ],
        })),
      },
    ],
  };
}
