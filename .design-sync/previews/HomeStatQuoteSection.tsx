// Authored preview — HomeStatQuoteSection. A large stat + supporting quote band.
// Props are optional (component has defaults); two stories show the default and a
// custom stat to exercise the prop axis.
import { HomeStatQuoteSection } from 'apps/web/components';

export function Default() {
  return <HomeStatQuoteSection />;
}

export function CustomStat() {
  return (
    <HomeStatQuoteSection
      stat='10x'
      body='more fan touchpoints from the same release calendar.'
      source='Jovie artist cohort, 2026'
    />
  );
}
