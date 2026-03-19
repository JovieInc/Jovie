# Cookie Consent

Jovie uses a lightweight cookie consent system to comply with regional privacy laws.

## Regions

The banner is shown only for visitors detected in:

- European Union, EEA and United Kingdom (GDPR)
- Brazil (LGPD)
- South Korea (PIPA)
- California, Colorado, Virginia, Connecticut and Utah (USA)
- Quebec, Canada (Law 25)

For US and Canadian visitors, detection is state/province-level using Vercel's `x-vercel-ip-country-region` header. When the region cannot be determined, the banner is shown as a safe fallback.

## How it works

1. **Middleware** (`proxy.ts`) detects the visitor's country and region via Vercel geo headers (`x-vercel-ip-country`, `x-vercel-ip-country-region`) and sets a `jv_cc_required` cookie (`1` or `0`).
2. **CookieBannerSection** reads the `jv_cc_required` cookie on the client and shows the banner when required. **CookieModal** allows granular preference selection.
3. Preferences are stored in the `jv_cc` cookie and last for 365 days. They can be read with helpers in `lib/cookies/consent.ts`.

## Helpers

```ts
import { readConsent, saveConsent } from '@/lib/cookies/consent';
```

- `readConsent()` – server function returning saved consent or `null`.
- `saveConsent(consent)` – server action to persist consent.

## Legal

- [GDPR](https://gdpr.eu/) — EU/EEA + UK
- [LGPD](https://www.gov.br/cidadania/pt-br/acesso-a-informacao/lgpd) — Brazil
- [PIPA](https://www.privacy.go.kr/eng/index.do) — South Korea
- [CPRA](https://oag.ca.gov/privacy/ccpa) — California
- [Law 25 Quebec](https://www.cai.gouv.qc.ca/) — Quebec, Canada
