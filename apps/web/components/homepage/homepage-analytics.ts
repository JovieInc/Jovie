export function trackHomepageEvent(
  event: string,
  properties?: Record<string, unknown>
) {
  void import('../../lib/analytics').then(({ track }) => {
    track(event, properties);
  });
}
