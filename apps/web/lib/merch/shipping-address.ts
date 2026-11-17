import type Stripe from 'stripe';
import type { MerchShippingAddress } from '@/lib/db/schema/merch';

export function stripeSessionToShippingAddress(
  session: Stripe.Checkout.Session
): MerchShippingAddress | null {
  const details = (
    session as Stripe.Checkout.Session & {
      readonly shipping_details?: {
        readonly name?: string | null;
        readonly address?: Stripe.Address | null;
      } | null;
    }
  ).shipping_details;
  const address = details?.address;
  if (!address) return null;

  return {
    name: details.name ?? session.customer_details?.name ?? null,
    line1: address.line1 ?? null,
    line2: address.line2 ?? null,
    city: address.city ?? null,
    state: address.state ?? null,
    postalCode: address.postal_code ?? null,
    country: address.country ?? null,
    phone: session.customer_details?.phone ?? null,
  };
}

export function validateShippingAddress(
  address: MerchShippingAddress | null | undefined
): address is MerchShippingAddress & {
  readonly name: string;
  readonly line1: string;
  readonly city: string;
  readonly postalCode: string;
  readonly country: string;
} {
  return Boolean(
    address?.name &&
      address.line1 &&
      address.city &&
      address.postalCode &&
      address.country
  );
}
