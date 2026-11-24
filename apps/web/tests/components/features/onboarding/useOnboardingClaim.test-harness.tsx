import { useOnboardingClaim } from '@/components/features/onboarding/useOnboardingClaim';

export function ClaimHarness({
  trigger,
  enabled = true,
}: {
  readonly trigger: number;
  readonly enabled?: boolean;
}) {
  const status = useOnboardingClaim(trigger, enabled);
  return <span data-testid='claim-status'>{status}</span>;
}

export function renderClaimHarness(trigger: number) {
  return <ClaimHarness trigger={trigger} />;
}

export function jsonResponse(body: unknown, init?: ResponseInit) {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'content-type': 'application/json' },
    ...init,
  });
}
