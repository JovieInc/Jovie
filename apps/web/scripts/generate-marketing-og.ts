import { join } from 'node:path';
import { writeMarketingOgCards } from '@/lib/og/marketing-og-card';

const outputDir = join(process.cwd(), 'public/og');
void writeMarketingOgCards(outputDir)
  .then(() => {
    console.log(`wrote marketing OG cards to ${outputDir}`);
  })
  .catch((error: unknown) => {
    console.error(error);
    process.exitCode = 1;
  });
