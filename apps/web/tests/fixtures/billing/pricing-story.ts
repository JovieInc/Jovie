import { fn } from 'storybook/test';
import { createSignedInApiMock } from '@/.storybook/signed-in-session';

export type FixtureWindow = Window & {
  __jovieApiMock?: ReturnType<typeof createSignedInApiMock>;
};

export function installPricingStoryFixture(status?: number | null) {
  const target = window as FixtureWindow;
  const previous = target.__jovieApiMock;
  const signedIn = createSignedInApiMock();
  target.__jovieApiMock = fn(request =>
    request.url.pathname === '/api/billing/price-lock'
      ? Response.json({ priceLock: null }, { status: status ?? 200 })
      : signedIn(request)
  );
  return () => {
    target.__jovieApiMock = previous;
  };
}
