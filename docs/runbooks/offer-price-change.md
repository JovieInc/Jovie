# Changing the price, trial or billing terms

The offer lives in one place: `apps/web/lib/billing/offer/offer.ts`. Every sentence about money is a registered claim in `claims.ts`. Stripe objects are created from it by hand and checked against it by the live check (`apps/web/scripts/offer-truth-live-check.ts`). Never edit Stripe first.

## Price change (expand, then contract)

1. In Stripe, create the new Price on the Pro product (lookup key unchanged, old Price stays active). Do not archive anything yet.
2. Open one PR that edits `offer.ts` (amount, `version`) and `ACTIVE_PRICE_MAPPINGS`. The offer-claims guard, `offer.test.ts` and the surface binding test fail on any hand-typed leftover; fix by using claims, not by baselining.
3. Set `acceptServedVersions` for the previous offer version in the m2 canary step while both versions can be live (the deploy overlap window).
4. Merge and let the deploy finish. The live check (post-deploy and daily) must report `pass` for the new hash. `uncertified` means `STRIPE_RO_KEY` is missing: the Stripe side was not verified, treat the change as unfinished.
5. Archive the old Stripe Price. The live check fails on any stray active self-serve price.
6. Update every `attested` entry in `config/offer-surfaces.json` (Stripe receipts and invoices, customer portal text, App Store, partner pages, images) and set `lastVerifiedOfferHash` to the new hash. An entry older than the current hash fails the check.

## Trial or terms change

Same PR path. Flip `trial.enabled` / `trial.advertised` or edit `checkout.*` in `offer.ts`; trial claims disappear or change everywhere together. Changing `mechanism` to a Stripe trial also requires `buildCheckoutSessionParams` and the consent copy to change in the same PR (the claim shapes `trial.price_after_trial` and "then automatically charged" are forbidden while the trial is an entitlement).

## If the live check fails in production

A mismatch pages, and the app flips every guarded chat surface to the registered templates within the check interval (`offer:guard:strict`, expires after 36 h, cleared by a `pass` or `uncertified` report). Fix the drift (Stripe dashboard or code), rerun the M2 canary, confirm `strict: false` in the report response. Three consecutive "could not run" results alert and log an override; they never block a release.

## Taxes and currency

Prices are USD and Stripe automatic tax is off, so no tax statement is published; a statement is added as a claim only when tax collection is decided. Tracked in the PR that introduced the offer module.
