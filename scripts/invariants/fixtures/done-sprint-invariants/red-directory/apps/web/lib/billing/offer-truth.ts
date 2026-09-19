export function isMaxPurchaseEnabled(): boolean {
  return false;
}

export function getMaxOfferStatus() {
  return 'contact_sales';
}

export const PRO_TRIAL_DURATION_DAYS = 14;

export function isSelfServiceOffer(plan, interval) {
  return (
    plan === 'free' ||
    (plan === 'pro' && validateBillingInterval(interval) === 'month')
  );
}

export function getPaidPlanPriceUsd() {
  throw new Error('Only monthly Pro is available for new subscriptions');
}
